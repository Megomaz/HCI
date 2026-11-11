import { expect, test, type Page } from "@playwright/test";
import {
  GLOSSARY,
  ORIGINAL_WORDS,
  goToChecklist,
  installFakeSpeech,
  shot,
  spokenTexts,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

const dialog = (page: Page) => page.getByRole("dialog");

async function expectMeaning(page: Page, word: string): Promise<void> {
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole("heading", { name: word, exact: true })).toBeVisible();
  await expect(dialog(page).locator("#sheet-meaning")).toHaveText(GLOSSARY[word]);
}

/** Select text the way a highlight does: a real DOM selection over the given word. */
async function selectText(page: Page, containerSelector: string, text: string): Promise<void> {
  await page.evaluate(
    ({ containerSelector, text }) => {
      const container = document.querySelector(containerSelector)!;
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent!.indexOf(text);
        if (at === -1) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + text.length);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      throw new Error(`"${text}" not found`);
    },
    { containerSelector, text },
  );
}

test("every underlined word opens the right meaning by tap", async ({ page }) => {
  await page.goto("/");
  for (const word of ORIGINAL_WORDS) {
    await page.getByRole("button", { name: `${word}, show meaning` }).click();
    await expectMeaning(page, word);
    await page.getByRole("button", { name: "Close" }).click();
    await expect(dialog(page)).toBeHidden();
  }

  await goToChecklist(page);
  await page.getByRole("button", { name: "tax return, show meaning" }).click();
  await expectMeaning(page, "tax return");
  await shot(page, "9-word-meaning");
  await page.getByRole("button", { name: "Close" }).click();
  // Tapping the word inside a checklist row does not tick the row
  await expect(page.getByRole("checkbox").first()).not.toBeChecked();
});

test("every underlined word can be reached with Tab and opened with Enter or Space", async ({
  page,
}) => {
  await page.goto("/");
  let useEnter = true;
  for (const word of ORIGINAL_WORDS) {
    // Tab order follows reading order, starting from the top of the page
    await page.keyboard.press("Tab");
    const button = page.getByRole("button", { name: `${word}, show meaning` });
    await expect(button).toBeFocused();

    await page.keyboard.press(useEnter ? "Enter" : "Space");
    useEnter = !useEnter;
    await expectMeaning(page, word);

    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(button).toBeFocused();
  }

  await goToChecklist(page);
  const taxReturn = page.getByRole("button", { name: "tax return, show meaning" });
  await taxReturn.focus();
  await page.keyboard.press("Enter");
  await expectMeaning(page, "tax return");
});

test("the focused word has a thick, visible outline", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const outline = await page
    .getByRole("button", { name: "furnish, show meaning" })
    .locator("span")
    .evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor };
    });
  expect(outline).toEqual({ width: "3px", style: "solid", color: "rgb(27, 42, 65)" });
});

test("every glossary word opens the right meaning by selecting it", async ({ page }) => {
  await page.goto("/");
  for (const word of ORIGINAL_WORDS) {
    await selectText(page, ".original", word);
    await expectMeaning(page, word);
    await page.getByRole("button", { name: "Close" }).click();
    await expect(dialog(page)).toBeHidden();
  }

  // Selecting part of an underlined phrase gives the whole phrase
  await selectText(page, ".original", "documentary");
  await expectMeaning(page, "documentary evidence");
  await page.getByRole("button", { name: "Close" }).click();

  await goToChecklist(page);
  await selectText(page, ".check-list", "tax return");
  await expectMeaning(page, "tax return");
});

test("selecting a word that is not in the glossary says so", async ({ page }) => {
  await page.goto("/");
  await selectText(page, ".original", "Applicants");
  await expect(dialog(page).getByRole("heading", { name: "Applicants" })).toBeVisible();
  await expect(dialog(page)).toContainText("We don't have a simple meaning for this word yet.");
  await expect(page.getByRole("button", { name: "Read meaning aloud" })).toBeHidden();
  await page.getByRole("button", { name: "Close" }).click();

  // A long selection (someone copying a sentence) is left alone
  await selectText(page, ".original", "including self-employment income for the");
  await page.waitForTimeout(1000);
  await expect(dialog(page)).toBeHidden();
});

test("the sheet is a proper dialog", async ({ page }) => {
  await page.goto("/");
  const opener = page.getByRole("button", { name: "residency, show meaning" });
  await opener.click();

  // Focus moves into the dialog, which is named after the word and described by the meaning
  await expect(dialog(page)).toHaveAccessibleName("residency");
  await expect(dialog(page)).toHaveAccessibleDescription("Where you live.");
  await expect(dialog(page).getByRole("heading", { name: "residency" })).toBeFocused();

  // Tab stays inside
  const read = page.getByRole("button", { name: "Read meaning aloud" });
  const close = page.getByRole("button", { name: "Close" });
  await page.keyboard.press("Tab");
  await expect(read).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(
      () => !!document.activeElement?.closest("dialog") || document.activeElement === document.body,
    );
    expect(inside, "focus must not reach the page behind the dialog").toBe(true);
  }
  await page.keyboard.press("Shift+Tab");

  // The page behind cannot be used while it is open
  const reachedPageBehind = await page.evaluate(() => {
    const behind = document.querySelector<HTMLElement>('[data-action="simplify"]')!;
    behind.focus();
    return document.activeElement === behind;
  });
  expect(reachedPageBehind).toBe(false);

  // Esc closes and focus goes back to the word
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(opener).toBeFocused();

  // Close does the same
  await opener.click();
  await close.click();
  await expect(dialog(page)).toBeHidden();
  await expect(opener).toBeFocused();
});

test("Read meaning aloud speaks the word and its meaning; closing stops it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "assessment, show meaning" }).click();
  await page.getByRole("button", { name: "Read meaning aloud" }).click();
  await expect
    .poll(() => spokenTexts(page))
    .toEqual(["assessment. The last time they checked if you could get the card."]);
  await page.getByRole("button", { name: "Close" }).click();
  expect(await page.evaluate(() => window.speechSynthesis.speaking)).toBe(false);
});
