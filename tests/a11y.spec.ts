import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  ORIGINAL_WORDS,
  endSpokenLine,
  expectNoSidewaysScroll,
  goToChecklist,
  installFakeSpeech,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page, { lineMs: 400 });
});

async function expectNoAxeViolations(page: Page, screen: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const summary = results.violations.map(
    (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(", ")}`,
  );
  expect(summary, `axe violations on ${screen}`).toEqual([]);
}

/** Name of the element that has keyboard focus, as a screen reader would say it. */
async function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "";
    return (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  });
}

/** Press Tab until the named control has focus. Fails if Tab alone can't get there. */
async function tabTo(page: Page, name: string): Promise<void> {
  for (let presses = 0; presses < 40; presses++) {
    await page.keyboard.press("Tab");
    if ((await focusedName(page)) === name) return;
  }
  throw new Error(`Could not reach "${name}" with the Tab key`);
}

/** Every stop the Tab key makes on the current screen, in order. */
async function tabOrder(page: Page): Promise<string[]> {
  const names: string[] = [];
  for (let presses = 0; presses < 40; presses++) {
    await page.keyboard.press("Tab");
    const name = await focusedName(page);
    if (!name || names.includes(name)) break;
    names.push(name);
  }
  return names;
}

// ---------- axe on every screen ----------

test.describe("zero axe violations", () => {
  test("renewal page", async ({ page }) => {
    await page.goto("/");
    await expectNoAxeViolations(page, "renewal");
  });

  test("simplifying", async ({ page }) => {
    // Live mode with a held request keeps the Simplifying screen up for as long as the scan needs.
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/simplify", async (route) => {
      await held;
      await route.fulfill({ status: 503, json: {} });
    });
    await page.goto("/?live=1");
    await page.getByRole("button", { name: "Simplify this" }).click();
    await expect(page.getByRole("heading", { name: "Making this easier to read…" })).toBeFocused();
    await expect(page.locator("#announcer")).not.toBeEmpty();
    await expectNoAxeViolations(page, "simplifying");
    release();
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("error state", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Simplify this" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expectNoAxeViolations(page, "error");
  });

  test("checklist, with a row ticked", async ({ page }) => {
    await goToChecklist(page);
    await page.getByRole("checkbox").first().check();
    await expectNoAxeViolations(page, "checklist");
  });

  test("original text", async ({ page }) => {
    await goToChecklist(page);
    await page.getByRole("button", { name: "See the original text" }).click();
    await expect(page.getByRole("heading", { name: "The original text" })).toBeFocused();
    await expectNoAxeViolations(page, "original");
  });

  test("reading aloud: a line, a word meaning, paused and finished", async ({ page }) => {
    await installFakeSpeech(page, { manual: true });
    await goToChecklist(page);
    await page.getByRole("button", { name: "Read checklist aloud" }).click();

    await endSpokenLine(page, 2); // past "What you need to send." and "Must have."
    await expect(page.locator('[data-line="mustHave-0"]')).toHaveClass(/speaking/);
    await expectNoAxeViolations(page, "reading (line highlighted)");

    await endSpokenLine(page);
    await expect(page.locator('[data-term-id="mustHave-0-t0"]')).toHaveClass(/speaking/);
    await expectNoAxeViolations(page, "reading (word highlighted)");

    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expectNoAxeViolations(page, "reading (paused)");
    await page.getByRole("button", { name: "Play", exact: true }).click();

    await endSpokenLine(page, 6);
    await expect(page.getByText("Finished reading")).toBeVisible();
    await expectNoAxeViolations(page, "reading (finished)");
  });

  test("reading the original aloud, with the tip highlighted", async ({ page }) => {
    await installFakeSpeech(page, { manual: true });
    await page.goto("/");
    await page.getByRole("button", { name: "Read the original aloud" }).click();
    await expect(page.locator('.tip[data-line="tip"]')).toHaveClass(/speaking/);
    await expectNoAxeViolations(page, "reading original (tip)");
    await endSpokenLine(page);
    await expect(page.locator('.sentence[data-line="s0"]')).toHaveClass(/speaking/);
    await expectNoAxeViolations(page, "reading original (sentence)");
    await endSpokenLine(page);
    await expect(page.locator('[data-term-id="s0-t0"]')).toHaveClass(/speaking/);
    await expectNoAxeViolations(page, "reading original (word)");
  });

  test("done listening", async ({ page }) => {
    await goToChecklist(page);
    await page.getByRole("button", { name: "Read checklist aloud" }).click();
    await page.getByRole("button", { name: "Done listening" }).click();
    await expect(
      page.getByRole("heading", { name: "You have everything you need to know." }),
    ).toBeFocused();
    await expectNoAxeViolations(page, "done listening");
  });

  test("word meaning sheet", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "furnish, show meaning" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(400); // let the slide-up finish
    await expectNoAxeViolations(page, "word meaning sheet");
  });

  test("read aloud not available message", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Read the original aloud" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Read aloud" })).toBeVisible();
    await expectNoAxeViolations(page, "renewal with notice");
  });

  test("live mode renewal page", async ({ page }) => {
    await page.goto("/?live=1");
    await expect(page.getByLabel("Paste your own letter")).toBeVisible();
    await expectNoAxeViolations(page, "renewal (live mode)");
  });
});

// ---------- Keyboard only ----------

test("the whole journey works with the keyboard alone", async ({ page }) => {
  await page.goto("/");

  // Renewal: Tab goes top to bottom, through every underlined word, then the buttons
  expect(await tabOrder(page)).toEqual([
    ...ORIGINAL_WORDS.map((word) => `${word}, show meaning`),
    "Simplify this",
    "Read the original aloud",
  ]);

  // Open a word with Enter, look around the dialog, close with Esc
  await page.reload();
  await tabTo(page, "documentary evidence, show meaning");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog").getByRole("heading")).toBeFocused();
  await expect(page.getByRole("dialog")).toContainText(
    "Papers that prove something, like a bill or a letter.",
  );
  await tabTo(page, "Read meaning aloud");
  await page.keyboard.press("Enter");
  await tabTo(page, "Close");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "documentary evidence, show meaning" }),
  ).toBeFocused();

  // Simplify -> error (focus on its heading) -> Try again
  await tabTo(page, "Simplify this");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Sorry, we couldn't simplify this right now" }),
  ).toBeFocused();
  await tabTo(page, "Try again");
  await page.keyboard.press("Space");

  // Checklist: tick a box with Space, open "tax return" with Space, close with the Close button
  const heading = page.getByRole("heading", { name: "What you need to send" });
  await expect(heading).toBeFocused();
  expect(await tabOrder(page)).toEqual([
    "Proof of your income for the last 12 months (for example, your tax return)",
    "tax return, show meaning",
    "Proof of your address (for example, a recent bill)",
    "A letter from your accountant, if you have one",
    "If your income or home changed since last year, send proof of the change",
    "Read checklist aloud",
    "See the original text",
  ]);
  await heading.focus();
  await tabTo(page, "Proof of your address (for example, a recent bill)");
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("checkbox", { name: "Proof of your address (for example, a recent bill)" }),
  ).toBeChecked();
  await heading.focus();
  await tabTo(page, "tax return, show meaning");
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog")).toContainText(
    "The form you send to Revenue each year showing what you earned.",
  );
  await tabTo(page, "Close");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "tax return, show meaning" })).toBeFocused();

  // Original text and back
  await tabTo(page, "See the original text");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "The original text" })).toBeFocused();
  await tabTo(page, "Back to simple version");
  await page.keyboard.press("Enter");
  await expect(heading).toBeFocused();

  // Read aloud: Pause, Play, Play again, Done listening, Back to checklist
  await tabTo(page, "Read checklist aloud");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Reading aloud…")).toBeVisible();
  await tabTo(page, "Pause");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Paused")).toBeVisible();
  expect(await focusedName(page)).toBe("Play");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Reading aloud…")).toBeVisible();
  await tabTo(page, "Play again");
  await page.keyboard.press("Space");
  await tabTo(page, "Done listening");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "You have everything you need to know." }),
  ).toBeFocused();
  await tabTo(page, "Back to checklist");
  await page.keyboard.press("Enter");
  await expect(heading).toBeFocused();
  await expect(
    page.getByRole("checkbox", { name: "Proof of your address (for example, a recent bill)" }),
  ).toBeChecked();
});

// ---------- Other audit items ----------

/** Visit each screen in turn and run a check on it. */
async function onEveryScreen(page: Page, check: (screen: string) => Promise<void>): Promise<void> {
  await page.goto("/");
  await check("renewal");
  await page.getByRole("button", { name: "furnish, show meaning" }).click();
  await check("word meaning");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Read the original aloud" }).click();
  await check("reading the original");
  await page.getByRole("button", { name: "Done listening" }).click();
  await page.getByRole("button", { name: "Simplify this" }).click();
  await check("simplifying");
  await expect(page.getByRole("alert")).toBeVisible();
  await check("error");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "What you need to send" })).toBeFocused();
  await check("checklist");
  await page.getByRole("button", { name: "See the original text" }).click();
  await check("original");
  await page.getByRole("button", { name: "Back to simple version" }).click();
  await page.getByRole("button", { name: "Read checklist aloud" }).click();
  await check("reading the checklist");
  await page.getByRole("button", { name: "Done listening" }).click();
  await check("done listening");
}

for (const width of [640, 320, 195]) {
  // 200% zoom halves the layout width: 640 is a 1280px laptop, 195 is a 390px phone.
  test(`no sideways scrolling at ${width}px wide (200% zoom)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await onEveryScreen(page, async () => expectNoSidewaysScroll(page));
  });
}

test("every button name is unique on its screen and says what it does", async ({ page }) => {
  await onEveryScreen(page, async (screen) => {
    const scope = screen === "word meaning" ? page.getByRole("dialog") : page.locator("#screen");
    const names = await scope
      .getByRole("button")
      .evaluateAll((buttons) =>
        buttons.map((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim()),
      );
    expect(new Set(names).size, `duplicate button names on ${screen}: ${names}`).toBe(names.length);
    for (const name of names) {
      expect(["Done", "Read aloud", "OK", ""], `vague button name on ${screen}`).not.toContain(name);
    }
  });
});

test("tap targets are big enough", async ({ page }) => {
  await onEveryScreen(page, async (screen) => {
    const sizes = await page.evaluate(() => {
      const scope = document.querySelector("dialog[open]") ?? document.querySelector("#screen")!;
      return [...scope.querySelectorAll<HTMLElement>("button, .check-row")].map((el) => {
        const box = el.getBoundingClientRect();
        const min = el.matches(".btn-primary, .btn-secondary, .check-row") ? 56 : 48;
        return { name: el.textContent!.trim().slice(0, 30), w: box.width, h: box.height, min };
      });
    });
    for (const size of sizes) {
      expect(size.h, `${size.name} on ${screen} is too short`).toBeGreaterThanOrEqual(size.min);
      expect(size.w, `${size.name} on ${screen} is too narrow`).toBeGreaterThanOrEqual(48);
    }
  });
});

test("stacked buttons and rows have at least 8px between them", async ({ page }) => {
  await onEveryScreen(page, async (screen) => {
    const gaps = await page.evaluate(() => {
      const scope = document.querySelector("dialog[open]") ?? document.querySelector("#screen")!;
      const boxes = [...scope.querySelectorAll<HTMLElement>(".btn, .check-row")]
        .map((el) => el.getBoundingClientRect())
        .sort((a, b) => a.top - b.top);
      return boxes.slice(1).map((box, i) => box.top - boxes[i].bottom);
    });
    for (const gap of gaps) expect(gap, `gap on ${screen}`).toBeGreaterThanOrEqual(8);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("no progress, sound-bar or sheet animation", async ({ page }) => {
    const animationOf = (selector: string) =>
      page.locator(selector).first().evaluate((el) => getComputedStyle(el).animationName);

    await page.goto("/");
    await page.getByRole("button", { name: "furnish, show meaning" }).click();
    expect(await animationOf("dialog.sheet")).toBe("none");
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Read the original aloud" }).click();
    expect(await animationOf(".sound-bar i")).toBe("none");
    await page.getByRole("button", { name: "Done listening" }).click();

    await page.getByRole("button", { name: "Simplify this" }).click();
    expect(await animationOf(".loader span")).toBe("none");
  });
});

test("body text is at least 18px and uses one typeface", async ({ page }) => {
  await onEveryScreen(page, async (screen) => {
    const problems = await page.evaluate(() => {
      const scope = document.querySelector("dialog[open]") ?? document.querySelector(".app")!;
      const found: string[] = [];
      for (const el of scope.querySelectorAll<HTMLElement>("*")) {
        const hasOwnText = [...el.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim() !== "",
        );
        if (!hasOwnText || el.closest(".app-footer, .sr-only")) continue;
        const style = getComputedStyle(el);
        if (parseFloat(style.fontSize) < 18) found.push(`${el.textContent!.trim()}: ${style.fontSize}`);
        if (!style.fontFamily.includes("Atkinson Hyperlegible")) found.push(`font: ${style.fontFamily}`);
      }
      return found;
    });
    expect(problems, `text problems on ${screen}`).toEqual([]);
  });
});
