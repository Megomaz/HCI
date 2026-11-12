import { expect, type Locator, type Page } from "@playwright/test";

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

export const STEP_NAMES = [
  "Upload your letter",
  "Understand the words",
  "Simple version",
  "Your checklist",
] as const;

/** The page heading for a step, as a screen reader says it: "Step 2 of 4: Understand the words". */
export function stepHeading(page: Page, step: 1 | 2 | 3 | 4): Locator {
  return page.getByRole("heading", {
    level: 1,
    name: `Step ${step} of 4: ${STEP_NAMES[step - 1]}`,
    exact: true,
  });
}

/** Open the page and load the sample letter the way a user does. Ends on Step 2. */
export async function useSample(page: Page, url = "/"): Promise<void> {
  await page.goto(url);
  await page.getByRole("button", { name: "Use the sample letter" }).click();
  await expect(stepHeading(page, 2)).toBeFocused();
}

export async function goToSimple(page: Page): Promise<void> {
  await useSample(page);
  await page.getByRole("button", { name: "Next: simple version" }).click();
  await expect(stepHeading(page, 3)).toBeFocused();
}

export async function goToChecklist(page: Page): Promise<void> {
  await useSample(page);
  await page.getByRole("button", { name: "Skip to checklist" }).click();
  await expect(stepHeading(page, 4)).toBeFocused();
}

/**
 * Freeze the page's clock so read-aloud can be stepped line by line.
 * Call before page.goto(); then move time on with page.clock.runFor(ms).
 */
export async function freezeClock(page: Page): Promise<void> {
  await page.clock.install({ time: 0 });
}

/** Frozen-clock version of useSample. Ends on Step 2 with time stopped. */
export async function useSampleFrozen(page: Page): Promise<void> {
  await freezeClock(page);
  await page.goto("/");
  await page.clock.pauseAt(60_000);
  await page.getByRole("button", { name: "Use the sample letter" }).click();
  await page.clock.runFor(1600);
  await expect(stepHeading(page, 2)).toBeFocused();
}

export const SAMPLE_ORIGINAL =
  "Applicants must furnish documentary evidence of all means, including self-employment income for the preceding 12-month period, together with proof of residency. Where the applicant's circumstances have materially altered since the previous assessment, supplementary documentation may be required.";

export const SAMPLE_SIMPLE = [
  "You must send papers that show all the money you get.",
  "This includes money from your own work in the last 12 months.",
  "You must also send proof of where you live.",
  "Has anything big changed since your last check?",
  "If so, you may need to send extra papers.",
];

export const SAMPLE_ITEMS = [
  "Proof of your income for the last 12 months (for example, your tax return)",
  "Proof of your address (for example, a recent bill)",
  "A letter from your accountant, if you have one",
  "If your income or home changed since last year, send proof of the change",
];

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

/** The underlined words in the sample letter, in reading order. */
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

/** Name of the element that has keyboard focus, as a screen reader would say it. */
export async function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "";
    const label =
      el.getAttribute("aria-label") ??
      (el instanceof HTMLInputElement ? el.labels?.[0]?.textContent : null) ??
      el.textContent ??
      "";
    return label.replace(/\s+/g, " ").trim();
  });
}

/** Press Tab until the named control has focus. Fails if Tab alone can't get there. */
export async function tabTo(page: Page, name: string): Promise<void> {
  for (let presses = 0; presses < 40; presses++) {
    await page.keyboard.press("Tab");
    if ((await focusedName(page)) === name) return;
  }
  throw new Error(`Could not reach "${name}" with the Tab key`);
}

/** Every stop the Tab key makes on the current screen, in order. */
export async function tabOrder(page: Page): Promise<string[]> {
  const names: string[] = [];
  for (let presses = 0; presses < 40; presses++) {
    await page.keyboard.press("Tab");
    const name = await focusedName(page);
    if (!name || names.includes(name)) break;
    names.push(name);
  }
  return names;
}

/** A unique reference to put in a test letter, so the stand-in AI can count calls per letter. */
export function uniqueRef(): string {
  return `T-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function textLetter(ref: string, extra = ""): { name: string; mimeType: string; buffer: Buffer } {
  const text = `Benefits Office\nRef: ${ref}\n\nDear Applicant,\n\nYour application for Fuel Allowance has been received. You are required to furnish proof of household income within 21 days of the date of this letter.\n\nFailure to submit the requested documentation may result in your claim being disallowed. ${extra}\n\nYours sincerely,\nClaims Section\n`;
  return { name: "letter.txt", mimeType: "text/plain", buffer: Buffer.from(text) };
}

/** What the stand-in AI saw for a given letter reference. */
export async function aiCalls(
  page: Page,
  ref: string,
): Promise<{ count: number; auth?: string; model?: string; jsonMode?: boolean; textOnly?: boolean }> {
  const response = await page.request.get(`http://127.0.0.1:5198/calls?ref=${ref}`);
  return response.json();
}
