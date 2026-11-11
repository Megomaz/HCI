import { expect, test, type Page } from "@playwright/test";
import {
  freezeClock,
  goToChecklistFrozen,
  installFakeSpeech,
  removeSpeech,
  shot,
  spoken,
  spokenTexts,
} from "./helpers";

const NO_SPEECH = "Read aloud isn't available on this browser";

/** Each spoken line lasts this long in the fake speech engine. */
const LINE = 300;

const CHECKLIST_SPOKEN = [
  "What you need to send.",
  "Must have.",
  "Proof of your income for the last 12 months (for example, your tax return)",
  "tax return. In simple words: The form you send to Revenue each year showing what you earned.",
  "Proof of your address (for example, a recent bill)",
  "Optional.",
  "A letter from your accountant, if you have one",
  "Only if needed.",
  "If your income or home changed since last year, send proof of the change",
];

const speaking = (page: Page, selector: string) => page.locator(`${selector}.speaking`);

/** Start reading the checklist and stop the clock just after the first line begins. */
async function startChecklistReading(page: Page): Promise<void> {
  await goToChecklistFrozen(page);
  await page.getByRole("button", { name: "Read checklist aloud" }).click();
  await page.clock.runFor(10);
}

test.describe("read aloud", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeSpeech(page, { lineMs: LINE });
  });

  test("checklist: one utterance per line, highlight follows, meanings are spoken", async ({
    page,
  }) => {
    await startChecklistReading(page);
    await expect(page.getByText("Reading aloud…")).toBeVisible();
    expect(await spokenTexts(page)).toEqual(["What you need to send."]);

    await page.clock.runFor(LINE);
    await expect(speaking(page, '[data-line="sec-mustHave"]')).toHaveCount(1);

    await page.clock.runFor(LINE);
    await expect(speaking(page, '[data-line="mustHave-0"]')).toHaveCount(1);
    await expect(page.locator(".speaking")).toHaveCount(1);

    // The underlined word in that line is explained next; the word itself is marked too
    await page.clock.runFor(LINE);
    await expect(speaking(page, '[data-term-id="mustHave-0-t0"]')).toHaveCount(1);
    await expect(speaking(page, '[data-line="mustHave-0"]')).toHaveCount(1);
    await shot(page, "6b-reading-word-meaning");

    await page.clock.runFor(LINE);
    await expect(speaking(page, '[data-line="mustHave-1"]')).toHaveCount(1);
    await expect(page.locator(".speaking")).toHaveCount(1);

    await page.clock.runFor(LINE * 6);
    await expect(page.getByText("Finished reading")).toBeVisible();
    await expect(page.locator(".speaking")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();

    expect(await spokenTexts(page)).toEqual(CHECKLIST_SPOKEN);

    // Irish voice first, at the slower rate
    for (const line of await spoken(page)) {
      expect(line.voice).toBe("Voice en_IE");
      expect(line.lang).toBe("en-IE");
      expect(line.rate).toBe(0.9);
    }
  });

  test("Pause toggles to Play and holds the line; Play carries on", async ({ page }) => {
    await startChecklistReading(page);
    await page.clock.runFor(LINE * 2);
    await expect(speaking(page, '[data-line="mustHave-0"]')).toHaveCount(1);

    await page.getByRole("button", { name: "Pause", exact: true }).click();
    const play = page.getByRole("button", { name: "Play", exact: true });
    await expect(play).toBeFocused();
    await expect(page.getByText("Paused")).toBeVisible();

    await page.clock.runFor(5000);
    expect(await spokenTexts(page)).toEqual(CHECKLIST_SPOKEN.slice(0, 3));
    await expect(speaking(page, '[data-line="mustHave-0"]')).toHaveCount(1);

    await play.click();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeFocused();
    await expect(page.getByText("Reading aloud…")).toBeVisible();
    await page.clock.runFor(LINE * 8);
    await expect(page.getByText("Finished reading")).toBeVisible();
    // Nothing was skipped and nothing was read twice
    expect(await spokenTexts(page)).toEqual(CHECKLIST_SPOKEN);
  });

  test("Play again restarts from the top; Play after the end does too", async ({ page }) => {
    await startChecklistReading(page);
    await page.clock.runFor(LINE * 4);
    await expect(speaking(page, '[data-line="mustHave-1"]')).toHaveCount(1);

    await page.getByRole("button", { name: "Play again" }).click();
    await expect(page.locator(".speaking")).toHaveCount(0);
    await page.clock.runFor(100 + LINE);
    await expect(speaking(page, '[data-line="sec-mustHave"]')).toHaveCount(1);
    await page.clock.runFor(LINE * 9);
    await expect(page.getByText("Finished reading")).toBeVisible();
    expect(await spokenTexts(page)).toEqual([
      ...CHECKLIST_SPOKEN.slice(0, 5),
      ...CHECKLIST_SPOKEN,
    ]);

    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.getByText("Reading aloud…")).toBeVisible();
    await page.clock.runFor(10 + LINE);
    await expect(speaking(page, '[data-line="sec-mustHave"]')).toHaveCount(1);
  });

  test("leaving the screen stops the speech", async ({ page }) => {
    await startChecklistReading(page);
    await page.clock.runFor(LINE * 2);
    await page.getByRole("button", { name: "Done listening" }).click();
    await expect(
      page.getByRole("heading", { name: "You have everything you need to know." }),
    ).toBeFocused();

    await page.clock.runFor(3000);
    expect(await spokenTexts(page)).toEqual(CHECKLIST_SPOKEN.slice(0, 3));
    expect(await page.evaluate(() => window.speechSynthesis.speaking)).toBe(false);
  });

  test("original text: says the tip first, then each sentence and its word meanings", async ({
    page,
  }) => {
    await freezeClock(page);
    await page.goto("/");
    await page.clock.pauseAt(60_000);
    await page.getByRole("button", { name: "Read the original aloud" }).click();
    await expect(page.getByRole("heading", { name: "The original text" })).toBeFocused();

    await page.clock.runFor(10);
    await expect(speaking(page, '.tip[data-line="tip"]')).toHaveCount(1);
    await page.clock.runFor(LINE);
    await expect(speaking(page, '.sentence[data-line="s0"]')).toHaveCount(1);
    await page.clock.runFor(LINE);
    await expect(speaking(page, '[data-term-id="s0-t0"]')).toHaveCount(1);
    await expect(speaking(page, '.sentence[data-line="s0"]')).toHaveCount(1);
    await shot(page, "8-reading-original");
    await page.clock.runFor(LINE * 5);
    await expect(speaking(page, '.sentence[data-line="s1"]')).toHaveCount(1);
    await expect(speaking(page, ".sentence")).toHaveCount(1);

    await page.clock.runFor(LINE * 5);
    await expect(page.getByText("Finished reading")).toBeVisible();
    expect(await spokenTexts(page)).toEqual([
      "Tip: tap any underlined word to see what it means.",
      "Applicants must furnish documentary evidence of all means, including self-employment income for the preceding 12-month period, together with proof of residency.",
      "furnish. In simple words: Give or send.",
      "documentary evidence. In simple words: Papers that prove something, like a bill or a letter.",
      "means. In simple words: All the money you get, like wages or payments.",
      "preceding. In simple words: The one before.",
      "residency. In simple words: Where you live.",
      "Where the applicant's circumstances have materially altered since the previous assessment, supplementary documentation may be required.",
      "materially altered. In simple words: Changed in a big way.",
      "assessment. In simple words: The last time they checked if you could get the card.",
      "supplementary documentation. In simple words: Extra papers.",
    ]);

    // Done listening goes back to where the user came from
    await page.getByRole("button", { name: "Done listening" }).click();
    await expect(page.getByRole("button", { name: "Simplify this" })).toBeVisible();
  });

  test("the error screen can read the original aloud too", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Simplify this" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Read the original aloud" }).click();
    await expect
      .poll(() => spokenTexts(page))
      .toContain("Tip: tap any underlined word to see what it means.");
    await page.getByRole("button", { name: "Done listening" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("opening a word meaning pauses the reading; Play picks the line up again", async ({
    page,
  }) => {
    await startChecklistReading(page);
    await page.clock.runFor(LINE * 4);
    await expect(speaking(page, '[data-line="mustHave-1"]')).toHaveCount(1);

    await page.getByRole("button", { name: "tax return, show meaning" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Read meaning aloud" }).click();
    await page.clock.runFor(10);
    expect((await spokenTexts(page)).at(-1)).toBe(
      "tax return. The form you send to Revenue each year showing what you earned.",
    );
    await page.getByRole("button", { name: "Close" }).click();

    await expect(page.getByText("Paused")).toBeVisible();
    await page.clock.runFor(3000);
    expect(await page.evaluate(() => window.speechSynthesis.speaking)).toBe(false);

    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.clock.runFor(LINE * 6);
    await expect(page.getByText("Finished reading")).toBeVisible();
    // Carried on from the line that was interrupted
    expect((await spokenTexts(page)).slice(-5)).toEqual(CHECKLIST_SPOKEN.slice(4));
  });
});

test.describe("browsers that ignore pause()", () => {
  test("Pause still goes quiet, and Play re-reads the current line", async ({ page }) => {
    await installFakeSpeech(page, { lineMs: LINE, brokenPause: true });
    await startChecklistReading(page);
    await page.clock.runFor(LINE * 2);
    await expect(speaking(page, '[data-line="mustHave-0"]')).toHaveCount(1);

    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await page.clock.runFor(5000);
    expect(await page.evaluate(() => window.speechSynthesis.speaking)).toBe(false);
    const whilePaused = await spokenTexts(page);
    expect(whilePaused.length).toBeLessThanOrEqual(4);

    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.clock.runFor(LINE * 9);
    await expect(page.getByText("Finished reading")).toBeVisible();
    const all = await spokenTexts(page);
    expect(all.at(-1)).toBe(CHECKLIST_SPOKEN.at(-1));
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
      await page.goto("/");
      await page.getByRole("button", { name: "Read the original aloud" }).click();
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
    await page.goto("/");
    await page.getByRole("button", { name: "Read the original aloud" }).click();
    await expect(page.getByRole("status").filter({ hasText: NO_SPEECH })).toBeVisible();
    await expect(page.getByRole("button", { name: "Simplify this" })).toBeVisible();

    await page.getByRole("button", { name: "furnish, show meaning" }).click();
    await page.getByRole("button", { name: "Read meaning aloud" }).click();
    await expect(page.getByRole("dialog").getByText(NO_SPEECH)).toBeVisible();
  });
});
