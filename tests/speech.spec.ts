import { expect, test, type Page } from "@playwright/test";
import {
  SAMPLE_ITEMS,
  SAMPLE_SIMPLE,
  installFakeSpeech,
  removeSpeech,
  shot,
  spoken,
  spokenTexts,
  stepHeading,
  useSample,
  useSampleFrozen,
} from "./helpers";

const NO_SPEECH = "Read aloud isn't available on this browser";
const SPOKEN_TIP = "Tip: tap any underlined word to hear what it means.";

/** Each spoken line lasts this long in the fake speech engine. */
const LINE = 300;

const SENTENCE_1 =
  "Applicants must furnish documentary evidence of all means, including self-employment income for the preceding 12-month period, together with proof of residency.";
const SENTENCE_2 =
  "Where the applicant's circumstances have materially altered since the previous assessment, supplementary documentation may be required.";

const LETTER_SPOKEN = [
  SPOKEN_TIP,
  SENTENCE_1,
  "furnish means: give or send.",
  "documentary evidence means: papers that prove something, like a bill or a letter.",
  "means means: all the money you get, like wages or payments.",
  "preceding means: the one before.",
  "residency means: where you live.",
  SENTENCE_2,
  "materially altered means: changed in a big way.",
  "assessment means: the last time they checked if you could get the card.",
  "supplementary documentation means: extra papers.",
];

const CHECKLIST_SPOKEN = [
  SPOKEN_TIP,
  "Your checklist.",
  "Must have.",
  SAMPLE_ITEMS[0],
  "tax return means: the form you send to Revenue each year showing what you earned.",
  SAMPLE_ITEMS[1],
  "Optional.",
  SAMPLE_ITEMS[2],
  "Only if needed.",
  SAMPLE_ITEMS[3],
];

const speaking = (page: Page, selector: string) => page.locator(`${selector}.speaking`);

async function startLetterReading(page: Page): Promise<void> {
  await useSampleFrozen(page);
  await page.getByRole("button", { name: "Read the letter aloud" }).click();
  await page.clock.runFor(10);
}

async function startChecklistReading(page: Page): Promise<void> {
  await useSampleFrozen(page);
  await page.getByRole("button", { name: "Skip to checklist" }).click();
  await page.getByRole("button", { name: "Read checklist aloud" }).click();
  await page.clock.runFor(10);
}

test.describe("read aloud", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeSpeech(page, { lineMs: LINE });
  });

  test("Step 2: speaks the tip first, then each sentence, then each underlined word's meaning", async ({
    page,
  }) => {
    await startLetterReading(page);

    // The reading-aloud state replaces the step's buttons; focus lands on Pause
    await expect(page.getByText("Reading aloud…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeFocused();
    await expect(page.getByRole("button", { name: /^Next|^Back|^Skip/ })).toHaveCount(0);

    // Tip first, with the tip on screen highlighted
    expect(await spokenTexts(page)).toEqual([SPOKEN_TIP]);
    await expect(speaking(page, '.tip[data-line="tip"]')).toHaveCount(1);

    // Then the first sentence
    await page.clock.runFor(LINE);
    await expect(speaking(page, '.sentence[data-line="s0"]')).toHaveCount(1);
    await expect(page.locator(".speaking")).toHaveCount(1);

    // After the sentence, each underlined word's button is highlighted while its meaning is said
    await page.clock.runFor(LINE);
    await expect(speaking(page, 'button[data-term-id="s0-t0"]')).toHaveCount(1);
    await expect(speaking(page, '.sentence[data-line="s0"]')).toHaveCount(1);
    expect((await spokenTexts(page)).at(-1)).toBe("furnish means: give or send.");
    await shot(page, "2-reading-word");

    await page.clock.runFor(LINE);
    await expect(speaking(page, 'button[data-term-id="s0-t1"]')).toHaveCount(1);
    await expect(page.locator(".term.speaking")).toHaveCount(1);

    await page.clock.runFor(LINE * 4);
    await expect(speaking(page, '.sentence[data-line="s1"]')).toHaveCount(1);
    await expect(page.locator(".sentence.speaking")).toHaveCount(1);

    await page.clock.runFor(LINE * 4);
    await expect(page.getByText("Finished reading")).toBeVisible();
    await expect(page.locator(".speaking")).toHaveCount(0);
    expect(await spokenTexts(page)).toEqual(LETTER_SPOKEN);

    // Irish voice first, at the slower rate
    for (const line of await spoken(page)) {
      expect(line.voice).toBe("Voice en_IE");
      expect(line.lang).toBe("en-IE");
      expect(line.rate).toBe(0.9);
    }

    // Done listening returns to the step, with focus back on the button that started it
    await page.getByRole("button", { name: "Done listening" }).click();
    await expect(page.getByRole("button", { name: "Read the letter aloud" })).toBeFocused();
    await expect(page.getByRole("button", { name: "Next: simple version" })).toBeVisible();
  });

  test("Explain words while reading is on by default and can be turned off", async ({ page }) => {
    await useSampleFrozen(page);
    const toggle = page.getByRole("checkbox", { name: "Explain words while reading" });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();

    await page.getByRole("button", { name: "Read the letter aloud" }).click();
    await page.clock.runFor(LINE * 5);
    await expect(page.getByText("Finished reading")).toBeVisible();
    // The tip is still spoken; the meanings are not
    expect(await spokenTexts(page)).toEqual([SPOKEN_TIP, SENTENCE_1, SENTENCE_2]);

    // The choice is remembered on the other steps
    await page.getByRole("button", { name: "Done listening" }).click();
    await page.getByRole("button", { name: "Skip to checklist" }).click();
    await expect(page.getByRole("checkbox", { name: "Explain words while reading" })).not.toBeChecked();
    await page.getByRole("button", { name: "Read checklist aloud" }).click();
    await page.clock.runFor(LINE * 12);
    expect((await spokenTexts(page)).some((text) => text.includes("means:"))).toBe(false);
  });

  test("Step 3: reads the simple version line by line", async ({ page }) => {
    await useSampleFrozen(page);
    await page.getByRole("button", { name: "Next: simple version" }).click();
    await page.getByRole("button", { name: "Read simple version aloud" }).click();
    await page.clock.runFor(10);
    await expect(speaking(page, '[data-line="v0"]')).toHaveCount(1);
    await page.clock.runFor(LINE);
    await expect(speaking(page, '[data-line="v1"]')).toHaveCount(1);
    await expect(page.locator(".speaking")).toHaveCount(1);
    await page.clock.runFor(LINE * 5);
    await expect(page.getByText("Finished reading")).toBeVisible();
    // No underlined words in this text, so there is no tip to speak
    expect(await spokenTexts(page)).toEqual(SAMPLE_SIMPLE);
    await page.getByRole("button", { name: "Done listening" }).click();
    await expect(page.getByRole("button", { name: "Read simple version aloud" })).toBeFocused();
  });

  test("Step 4: reads the checklist; Done listening shows the confirmation", async ({ page }) => {
    await startChecklistReading(page);
    await page.clock.runFor(LINE * 2);
    await expect(speaking(page, '[data-line="sec-mustHave"]')).toHaveCount(1);
    await page.clock.runFor(LINE);
    await expect(speaking(page, '.check-row[data-line="mustHave-0"]')).toHaveCount(1);
    await page.clock.runFor(LINE);
    await expect(speaking(page, 'button[data-term-id="mustHave-0-t0"]')).toHaveCount(1);
    await expect(speaking(page, '.check-row[data-line="mustHave-0"]')).toHaveCount(1);
    await shot(page, "4-reading");
    await page.clock.runFor(LINE * 7);
    await expect(page.getByText("Finished reading")).toBeVisible();
    expect(await spokenTexts(page)).toEqual(CHECKLIST_SPOKEN);

    await page.getByRole("button", { name: "Done listening" }).click();
    await expect(
      page.getByRole("heading", { name: "You have everything you need to know." }),
    ).toBeFocused();
    await expect(page.getByText("Gather these documents, then continue.")).toBeVisible();
    await shot(page, "4-done");
    await page.getByRole("button", { name: "Back to checklist" }).click();
    await expect(stepHeading(page, 4)).toBeFocused();
    await expect(page.getByRole("button", { name: "Read checklist aloud" })).toBeVisible();
  });

  test("Pause toggles to Play and holds the line; Play carries on", async ({ page }) => {
    await startLetterReading(page);
    await page.clock.runFor(LINE);
    await expect(speaking(page, '.sentence[data-line="s0"]')).toHaveCount(1);

    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const play = page.getByRole("button", { name: "Play", exact: true });
    await expect(play).toBeFocused();
    await expect(page.getByText("Paused")).toBeVisible();

    await page.clock.runFor(5000);
    expect(await spokenTexts(page)).toEqual(LETTER_SPOKEN.slice(0, 2));
    await expect(speaking(page, '.sentence[data-line="s0"]')).toHaveCount(1);

    await play.click();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeFocused();
    await expect(page.getByText("Reading aloud…")).toBeVisible();
    await page.clock.runFor(LINE * 11);
    await expect(page.getByText("Finished reading")).toBeVisible();
    // Nothing was skipped and nothing was read twice
    expect(await spokenTexts(page)).toEqual(LETTER_SPOKEN);
  });

  test("Play again restarts from the top; Play after the end does too", async ({ page }) => {
    await startLetterReading(page);
    await page.clock.runFor(LINE * 3);

    await page.getByRole("button", { name: "Play again" }).click();
    await expect(page.locator(".speaking")).toHaveCount(0);
    await page.clock.runFor(100);
    await expect(speaking(page, '.tip[data-line="tip"]')).toHaveCount(1);
    await page.clock.runFor(LINE * 12);
    await expect(page.getByText("Finished reading")).toBeVisible();
    expect(await spokenTexts(page)).toEqual([...LETTER_SPOKEN.slice(0, 4), ...LETTER_SPOKEN]);

    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByText("Reading aloud…")).toBeVisible();
    await page.clock.runFor(10);
    await expect(speaking(page, '.tip[data-line="tip"]')).toHaveCount(1);
  });

  test("opening a word meaning pauses the reading; Play picks the line up again", async ({
    page,
  }) => {
    await startLetterReading(page);
    await page.clock.runFor(LINE * 7); // into the second sentence
    await expect(speaking(page, '.sentence[data-line="s1"]')).toHaveCount(1);

    await page.getByRole("button", { name: "assessment, show meaning" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Read meaning aloud" }).click();
    await page.clock.runFor(10);
    expect((await spokenTexts(page)).at(-1)).toBe(
      "assessment. The last time they checked if you could get the card.",
    );
    await page.getByRole("button", { name: "Close" }).click();

    await expect(page.getByText("Paused")).toBeVisible();
    await page.clock.runFor(3000);
    expect(await page.evaluate(() => window.speechSynthesis.speaking)).toBe(false);

    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.clock.runFor(LINE * 5);
    await expect(page.getByText("Finished reading")).toBeVisible();
    // Carried on from the sentence that was interrupted
    expect((await spokenTexts(page)).slice(-4)).toEqual(LETTER_SPOKEN.slice(7));
  });

  test("leaving the step stops the speech", async ({ page }) => {
    await useSampleFrozen(page);
    await page.getByRole("button", { name: "Next: simple version" }).click();
    await page.getByRole("button", { name: "Read simple version aloud" }).click();
    await page.clock.runFor(10 + LINE);
    await page.getByRole("button", { name: "Done listening" }).click();
    await page.getByRole("button", { name: "Next: checklist" }).click();
    await page.clock.runFor(3000);
    expect(await spokenTexts(page)).toEqual(SAMPLE_SIMPLE.slice(0, 2));
    expect(await page.evaluate(() => window.speechSynthesis.speaking)).toBe(false);
  });
});

test.describe("scrolling while reading aloud", () => {
  // A short screen, so the letter and the buttons can't both be in view.
  test.use({ viewport: { width: 390, height: 420 }, reducedMotion: "reduce" });

  test.beforeEach(async ({ page }) => {
    await installFakeSpeech(page, { lineMs: LINE });
  });

  const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
  const lineInView = (page: Page) =>
    page.evaluate(() => {
      const box = document.querySelector(".speaking")!.getBoundingClientRect();
      return box.bottom > 0 && box.top < window.innerHeight;
    });

  test("the page follows the spoken line while the reader stays with it", async ({ page }) => {
    await startLetterReading(page);
    expect(await scrollY(page)).toBe(0);
    await page.clock.runFor(LINE * 7); // into the second sentence, further down the page
    await expect(speaking(page, '.sentence[data-line="s1"]')).toHaveCount(1);
    expect(await lineInView(page)).toBe(true);
  });

  test("after scrolling away, the page stays put instead of jumping back to the line", async ({
    page,
  }) => {
    await startLetterReading(page);
    await page.clock.runFor(LINE);
    await expect(speaking(page, '.sentence[data-line="s0"]')).toHaveCount(1);

    // The reader scrolls down to the buttons
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bottom = await scrollY(page);
    expect(bottom).toBeGreaterThan(200);
    expect(await lineInView(page)).toBe(false);

    // Reading carries on through the word meanings and the next sentence; the page does not move
    for (let i = 0; i < 8; i++) {
      await page.clock.runFor(LINE);
      expect(await scrollY(page)).toBe(bottom);
    }
    await expect(speaking(page, '.sentence[data-line="s1"]')).toHaveCount(1);

    // Play again from down here does not drag the page to the top either
    await page.getByRole("button", { name: "Play again" }).click();
    await page.clock.runFor(100 + LINE * 2);
    expect(await scrollY(page)).toBe(bottom);

    // Scrolling back up to the highlighted line picks the following up again
    await page.evaluate(() => document.querySelector(".speaking")!.scrollIntoView());
    await page.clock.runFor(LINE * 7);
    await expect(speaking(page, '.sentence[data-line="s1"]')).toHaveCount(1);
    expect(await lineInView(page)).toBe(true);
  });

  test("a line that is only partly in view does not pull the page either", async ({ page }) => {
    await startLetterReading(page);
    await page.clock.runFor(LINE);
    // Scroll so that the highlighted sentence is cut off at the top of the screen
    await page.evaluate(() => {
      const box = document.querySelector(".sentence.speaking")!.getBoundingClientRect();
      window.scrollBy(0, box.top + 60);
    });
    const position = await scrollY(page);
    for (let i = 0; i < 5; i++) {
      await page.clock.runFor(LINE); // the word meanings inside that sentence
      expect(await scrollY(page)).toBe(position);
    }
  });

  test("Play after the end, pressed from the bottom of the page, does not jump to the top", async ({
    page,
  }) => {
    await startLetterReading(page);
    await page.clock.runFor(LINE * 12);
    await expect(page.getByText("Finished reading")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bottom = await scrollY(page);
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.clock.runFor(LINE * 3);
    expect(await scrollY(page)).toBe(bottom);
  });
});

test.describe("scrolling while reading aloud, on a phone-sized screen", () => {
  test.use({ reducedMotion: "reduce" });

  test("scrolling to the bottom during read aloud is never undone", async ({ page }) => {
    await installFakeSpeech(page, { lineMs: LINE });
    await startLetterReading(page);
    await page.clock.runFor(LINE);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bottom = await page.evaluate(() => Math.round(window.scrollY));
    expect(bottom).toBeGreaterThan(0);
    for (let i = 0; i < 11; i++) {
      await page.clock.runFor(LINE);
      expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(bottom);
    }
    await expect(page.getByText("Finished reading")).toBeVisible();
    await expect(page.getByRole("button", { name: "Done listening" })).toBeInViewport();
  });
});

test.describe("browsers that ignore pause()", () => {
  test("Pause still goes quiet, and Play re-reads the current line", async ({ page }) => {
    await installFakeSpeech(page, { lineMs: LINE, brokenPause: true });
    await startLetterReading(page);
    await page.clock.runFor(LINE);

    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.clock.runFor(5000);
    expect(await page.evaluate(() => window.speechSynthesis.speaking)).toBe(false);
    const whilePaused = await spokenTexts(page);
    expect(whilePaused.length).toBeLessThanOrEqual(3);

    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.clock.runFor(LINE * 12);
    await expect(page.getByText("Finished reading")).toBeVisible();
    const all = await spokenTexts(page);
    expect(all.at(-1)).toBe(LETTER_SPOKEN.at(-1));
    // The line that was cut off is read again, in full
    expect(all[whilePaused.length]).toBe(whilePaused.at(-1));
  });
});

test.describe("voice choice", () => {
  test("falls back to en-GB, then to any English voice", async ({ browser }) => {
    for (const [voices, expected] of [
      [["fr-FR", "en-US", "en-GB"], "Voice en-GB"],
      [["fr-FR", "en-AU"], "Voice en-AU"],
    ] as const) {
      const page = await browser.newPage();
      await installFakeSpeech(page, { voices: [...voices] });
      await useSample(page);
      await page.getByRole("button", { name: "Read the letter aloud" }).click();
      await expect.poll(async () => (await spoken(page))[0]?.voice).toBe(expected);
      await page.close();
    }
  });
});

test.describe("no speech support", () => {
  test.beforeEach(async ({ page }) => {
    await removeSpeech(page);
  });

  test("says so instead of failing silently", async ({ page }) => {
    await useSample(page);
    await page.getByRole("button", { name: "Read the letter aloud" }).click();
    await expect(page.getByRole("status").filter({ hasText: NO_SPEECH })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next: simple version" })).toBeVisible();

    await page.getByRole("button", { name: "furnish, show meaning" }).click();
    await page.getByRole("button", { name: "Read meaning aloud" }).click();
    await expect(page.getByRole("dialog").getByText(NO_SPEECH)).toBeVisible();
  });
});
