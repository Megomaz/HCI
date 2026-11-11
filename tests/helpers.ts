import { expect, type Page } from "@playwright/test";

/** Set SHOTS=/some/dir to save a screenshot of every screen. */
const shotsDir = process.env.SHOTS;

export async function shot(page: Page, name: string): Promise<void> {
  if (shotsDir) await page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: true });
}

export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page should not scroll sideways").toBeLessThanOrEqual(0);
}

export interface SpokenLine {
  text: string;
  lang: string;
  voice: string | null;
  rate: number;
}

/**
 * Replace the browser's speech engine with a silent, predictable one.
 * It follows the real API closely (queue, start/end events, pause, resume,
 * cancel) so the app code under test is the real code.
 */
export async function installFakeSpeech(
  page: Page,
  options: { lineMs?: number; voices?: string[]; brokenPause?: boolean; manual?: boolean } = {},
): Promise<void> {
  await page.addInitScript(
    ({ lineMs, voiceLangs, brokenPause, manual }) => {
      type Fake = {
        text: string;
        lang: string;
        voice: { lang: string; name: string } | null;
        rate: number;
        onstart?: (e: unknown) => void;
        onend?: (e: unknown) => void;
        onerror?: (e: unknown) => void;
      };
      const spoken: unknown[] = [];
      let queue: Fake[] = [];
      let current: Fake | null = null;
      let timer: number | undefined;
      let paused = false;

      const finish = () => {
        const done = current;
        current = null;
        timer = undefined;
        done?.onend?.({ type: "end" });
        next();
      };
      const next = () => {
        if (current || paused || queue.length === 0) return;
        current = queue.shift()!;
        spoken.push({
          text: current.text,
          lang: current.lang,
          voice: current.voice?.name ?? null,
          rate: current.rate,
        });
        current.onstart?.({ type: "start" });
        if (!manual) timer = window.setTimeout(finish, lineMs);
      };

      const fake = {
        get speaking() {
          return current !== null;
        },
        get pending() {
          return queue.length > 0;
        },
        get paused() {
          return paused;
        },
        getVoices: () => voiceLangs.map((lang) => ({ lang, name: `Voice ${lang}` })),
        speak(utterance: Fake) {
          queue.push(utterance);
          window.setTimeout(next, 0);
        },
        cancel() {
          const interrupted = current;
          window.clearTimeout(timer);
          timer = undefined;
          current = null;
          queue = [];
          interrupted?.onerror?.({ type: "error", error: "interrupted" });
        },
        pause() {
          // Some Android browsers ignore pause() and keep talking.
          if (brokenPause) return;
          if (!current && queue.length === 0) return;
          paused = true;
          window.clearTimeout(timer);
          timer = undefined;
        },
        resume() {
          if (!paused) return;
          paused = false;
          if (current && !manual) timer = window.setTimeout(finish, lineMs);
          else if (!current) next();
        },
        addEventListener() {},
        removeEventListener() {},
      };

      class FakeUtterance {
        text: string;
        lang = "";
        voice = null;
        rate = 1;
        constructor(text: string) {
          this.text = text;
        }
      }

      Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        value: FakeUtterance,
        configurable: true,
      });
      (window as unknown as { __spoken: unknown[] }).__spoken = spoken;
      // Manual mode: a line lasts until the test ends it.
      (window as unknown as { __endLine: () => void }).__endLine = () => {
        if (current && !paused) finish();
      };
    },
    {
      lineMs: options.lineMs ?? 150,
      voiceLangs: options.voices ?? ["en-US", "en-GB", "en_IE"],
      brokenPause: options.brokenPause ?? false,
      manual: options.manual ?? false,
    },
  );
}

/** Manual mode only: end the line being spoken so the next one starts. */
export async function endSpokenLine(page: Page, lines = 1): Promise<void> {
  for (let i = 0; i < lines; i++) {
    await page.waitForFunction(() => window.speechSynthesis.speaking);
    await page.evaluate(() => (window as unknown as { __endLine: () => void }).__endLine());
  }
}

export async function removeSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
  });
}

export async function spoken(page: Page): Promise<SpokenLine[]> {
  return page.evaluate(() => (window as unknown as { __spoken: SpokenLine[] }).__spoken);
}

export async function spokenTexts(page: Page): Promise<string[]> {
  return (await spoken(page)).map((line) => line.text);
}

/** Open the page and get to the checklist the way a user does (error first, then Try again). */
export async function goToChecklist(page: Page, url = "/"): Promise<void> {
  await page.goto(url);
  await page.getByRole("button", { name: "Simplify this" }).click();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "What you need to send" })).toBeFocused();
}

export const GLOSSARY: Record<string, string> = {
  furnish: "Give or send.",
  "documentary evidence": "Papers that prove something, like a bill or a letter.",
  means: "All the money you get, like wages or payments.",
  residency: "Where you live.",
  preceding: "The one before.",
  "materially altered": "Changed in a big way.",
  assessment: "The last time they checked if you could get the card.",
  "supplementary documentation": "Extra papers.",
  "tax return": "The form you send to Revenue each year showing what you earned.",
};

/** The underlined words in the original paragraph, in reading order. */
export const ORIGINAL_WORDS = [
  "furnish",
  "documentary evidence",
  "means",
  "preceding",
  "residency",
  "materially altered",
  "assessment",
  "supplementary documentation",
];

/**
 * Freeze the page's clock so read-aloud can be stepped line by line.
 * Call before page.goto(); then move time on with page.clock.runFor(ms).
 */
export async function freezeClock(page: Page): Promise<void> {
  await page.clock.install({ time: 0 });
}

/** Frozen-clock version of goToChecklist (skips the on-purpose error). */
export async function goToChecklistFrozen(page: Page): Promise<void> {
  await freezeClock(page);
  await page.goto("/?demoError=0");
  await page.clock.pauseAt(60_000);
  await page.getByRole("button", { name: "Simplify this" }).click();
  await page.clock.runFor(2100);
  await expect(page.getByRole("heading", { name: "What you need to send" })).toBeFocused();
}
