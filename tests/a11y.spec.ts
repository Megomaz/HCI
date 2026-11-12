import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  ORIGINAL_WORDS,
  SAMPLE_ITEMS,
  endSpokenLine,
  expectNoSidewaysScroll,
  focusedName,
  goToChecklist,
  goToSimple,
  installFakeSpeech,
  stepHeading,
  tabOrder,
  tabTo,
  textLetter,
  uniqueRef,
  useSample,
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

// ---------- axe on every step and state ----------

test.describe("zero axe violations", () => {
  test("Step 1: upload", async ({ page }) => {
    await page.goto("/");
    await expectNoAxeViolations(page, "step 1");
  });

  test("Step 1: reading your letter", async ({ page }) => {
    // A held request keeps "Reading your letter…" up for as long as the scan needs.
    let release = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/api/simplify", async (route) => {
      await held;
      await route.abort();
    });
    await page.goto("/");
    await page.locator("#file-input").setInputFiles(textLetter(uniqueRef()));
    await expect(page.getByRole("heading", { name: "Reading your letter…" })).toBeFocused();
    await expect(page.locator("#announcer")).not.toBeEmpty();
    await expectNoAxeViolations(page, "step 1 loading");
    release();
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("Step 1: error", async ({ page }) => {
    await page.goto("/?demoError=1");
    await page.getByRole("button", { name: "Use the sample letter" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expectNoAxeViolations(page, "step 1 error");
  });

  test("Step 1: with a letter already loaded", async ({ page }) => {
    await useSample(page);
    await page.getByRole("button", { name: "Back: upload your letter" }).click();
    await expect(page.getByRole("button", { name: "Next: understand the words" })).toBeVisible();
    await expectNoAxeViolations(page, "step 1 with letter");
  });

  test("Step 2: understand the words", async ({ page }) => {
    await useSample(page);
    await expectNoAxeViolations(page, "step 2");
    await page.keyboard.press("Tab"); // a focused word
    await expectNoAxeViolations(page, "step 2 with a word focused");
  });

  test("Step 2: an uploaded letter", async ({ page }) => {
    await page.goto("/");
    await page.locator("#file-input").setInputFiles(textLetter(uniqueRef()));
    await expect(stepHeading(page, 2)).toBeFocused();
    await expectNoAxeViolations(page, "step 2 (uploaded letter)");
  });

  test("Step 2: reading aloud (tip, sentence, word meaning, paused, finished)", async ({ page }) => {
    await installFakeSpeech(page, { manual: true });
    await useSample(page);
    await page.getByRole("button", { name: "Read the letter aloud" }).click();
    await expect(page.locator('.tip[data-line="tip"]')).toHaveClass(/speaking/);
    await expectNoAxeViolations(page, "step 2 reading (tip)");

    await endSpokenLine(page);
    await expect(page.locator('.sentence[data-line="s0"]')).toHaveClass(/speaking/);
    await expectNoAxeViolations(page, "step 2 reading (sentence)");

    await endSpokenLine(page);
    await expect(page.locator('[data-term-id="s0-t0"]')).toHaveClass(/speaking/);
    await expectNoAxeViolations(page, "step 2 reading (word)");

    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expectNoAxeViolations(page, "step 2 reading (paused)");
    await page.getByRole("button", { name: "Play", exact: true }).click();

    await endSpokenLine(page, 9);
    await expect(page.getByText("Finished reading")).toBeVisible();
    await expectNoAxeViolations(page, "step 2 reading (finished)");
  });

  test("Step 3: simple version, and the original letter", async ({ page }) => {
    await goToSimple(page);
    await expectNoAxeViolations(page, "step 3");
    await page.getByRole("button", { name: "See the original letter" }).click();
    await expect(page.getByRole("button", { name: "Back to simple version" })).toBeFocused();
    await expectNoAxeViolations(page, "step 3 original letter");
  });

  test("Step 3: reading aloud", async ({ page }) => {
    await installFakeSpeech(page, { manual: true });
    await goToSimple(page);
    await page.getByRole("button", { name: "Read simple version aloud" }).click();
    await expect(page.locator('[data-line="v0"]')).toHaveClass(/speaking/);
    await expectNoAxeViolations(page, "step 3 reading");
  });

  test("Step 4: checklist, with a row ticked", async ({ page }) => {
    await goToChecklist(page);
    await page.getByRole("checkbox", { name: SAMPLE_ITEMS[0] }).check();
    await expectNoAxeViolations(page, "step 4");
  });

  test("Step 4: reading aloud, then the confirmation", async ({ page }) => {
    await installFakeSpeech(page, { manual: true });
    await goToChecklist(page);
    await page.getByRole("button", { name: "Read checklist aloud" }).click();
    await endSpokenLine(page, 3); // tip, "Your checklist.", "Must have."
    await expect(page.locator('[data-line="mustHave-0"]')).toHaveClass(/speaking/);
    await expectNoAxeViolations(page, "step 4 reading (row)");
    await endSpokenLine(page);
    await expect(page.locator('[data-term-id="mustHave-0-t0"]')).toHaveClass(/speaking/);
    await expectNoAxeViolations(page, "step 4 reading (word)");

    await page.getByRole("button", { name: "Done listening" }).click();
    await expect(
      page.getByRole("heading", { name: "You have everything you need to know." }),
    ).toBeFocused();
    await expectNoAxeViolations(page, "step 4 confirmation");
  });

  test("word meaning sheet", async ({ page }) => {
    await useSample(page);
    await page.getByRole("button", { name: "furnish, show meaning" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(400); // let the slide-up finish
    await expectNoAxeViolations(page, "word meaning sheet");
  });

  test("read aloud not available message", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "speechSynthesis", { value: undefined, configurable: true });
    });
    await useSample(page);
    await page.getByRole("button", { name: "Read the letter aloud" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Read aloud" })).toBeVisible();
    await expectNoAxeViolations(page, "step 2 with notice");
  });
});

// ---------- Keyboard only ----------

test("keyboard only: all four steps with the sample letter", async ({ page }) => {
  await page.goto("/");

  // Step 1
  expect(await tabOrder(page)).toEqual(["Choose a letter", "Use the sample letter"]);
  await page.reload();
  await tabTo(page, "Use the sample letter");
  await page.keyboard.press("Enter");

  // Step 2: focus is on the step heading; Tab runs through every word, then the controls
  await expect(stepHeading(page, 2)).toBeFocused();
  expect(await tabOrder(page)).toEqual([
    ...ORIGINAL_WORDS.map((word) => `${word}, show meaning`),
    "Read the letter aloud",
    "Explain words while reading",
    "Next: simple version",
    "Skip to checklist",
    "Back: upload your letter",
  ]);

  // Open a word meaning with Enter, look around the dialog, close with Esc
  await stepHeading(page, 2).focus();
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

  // Turn "Explain words while reading" off and on again with Space
  await tabTo(page, "Explain words while reading");
  await page.keyboard.press("Space");
  await expect(page.getByRole("checkbox", { name: "Explain words while reading" })).not.toBeChecked();
  await page.keyboard.press("Space");
  await expect(page.getByRole("checkbox", { name: "Explain words while reading" })).toBeChecked();

  // Read the letter aloud: focus lands on Pause; Pause, Play, Play again, Done listening
  await stepHeading(page, 2).focus();
  await tabTo(page, "Read the letter aloud");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Reading aloud…")).toBeVisible();
  expect(await focusedName(page)).toBe("Pause");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Paused")).toBeVisible();
  expect(await focusedName(page)).toBe("Play");
  await page.keyboard.press("Space");
  await expect(page.getByText("Reading aloud…")).toBeVisible();
  await tabTo(page, "Play again");
  await page.keyboard.press("Enter");
  await tabTo(page, "Done listening");
  await page.keyboard.press("Enter");
  expect(await focusedName(page)).toBe("Read the letter aloud");

  // Step 3
  await tabTo(page, "Next: simple version");
  await page.keyboard.press("Enter");
  await expect(stepHeading(page, 3)).toBeFocused();
  expect(await tabOrder(page)).toEqual([
    "Read simple version aloud",
    "Next: checklist",
    "See the original letter",
    "Back: understand the words",
  ]);
  await stepHeading(page, 3).focus();
  await tabTo(page, "See the original letter");
  await page.keyboard.press("Enter");
  expect(await focusedName(page)).toBe("Back to simple version");
  await page.keyboard.press("Enter");
  expect(await focusedName(page)).toBe("See the original letter");

  // Back to Step 2 and forward again, to prove Back works from the keyboard
  await tabTo(page, "Back: understand the words");
  await page.keyboard.press("Enter");
  await expect(stepHeading(page, 2)).toBeFocused();
  await tabTo(page, "Next: simple version");
  await page.keyboard.press("Space");
  await expect(stepHeading(page, 3)).toBeFocused();

  // Step 4
  await tabTo(page, "Next: checklist");
  await page.keyboard.press("Enter");
  await expect(stepHeading(page, 4)).toBeFocused();
  expect(await tabOrder(page)).toEqual([
    SAMPLE_ITEMS[0],
    "tax return, show meaning",
    SAMPLE_ITEMS[1],
    SAMPLE_ITEMS[2],
    SAMPLE_ITEMS[3],
    "Read checklist aloud",
    "Explain words while reading",
    "Start again with another letter",
    "Back: simple version",
  ]);

  // Tick a box with Space; open "tax return" with Space; close with the Close button
  await stepHeading(page, 4).focus();
  await tabTo(page, SAMPLE_ITEMS[1]);
  await page.keyboard.press("Space");
  await expect(page.getByRole("checkbox", { name: SAMPLE_ITEMS[1] })).toBeChecked();
  await stepHeading(page, 4).focus();
  await tabTo(page, "tax return, show meaning");
  await page.keyboard.press("Space");
  await expect(page.getByRole("dialog")).toContainText(
    "The form you send to Revenue each year showing what you earned.",
  );
  await tabTo(page, "Close");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "tax return, show meaning" })).toBeFocused();

  // Read checklist aloud, Done listening, confirmation, Back to checklist
  await tabTo(page, "Read checklist aloud");
  await page.keyboard.press("Enter");
  expect(await focusedName(page)).toBe("Pause");
  await tabTo(page, "Done listening");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "You have everything you need to know." }),
  ).toBeFocused();
  await tabTo(page, "Back to checklist");
  await page.keyboard.press("Enter");
  await expect(stepHeading(page, 4)).toBeFocused();
  await expect(page.getByRole("checkbox", { name: SAMPLE_ITEMS[1] })).toBeChecked();

  // Start again
  await tabTo(page, "Start again with another letter");
  await page.keyboard.press("Enter");
  await expect(stepHeading(page, 1)).toBeFocused();
});

test("keyboard only: Skip to checklist", async ({ page }) => {
  await page.goto("/");
  await tabTo(page, "Use the sample letter");
  await page.keyboard.press("Space");
  await expect(stepHeading(page, 2)).toBeFocused();
  await tabTo(page, "Skip to checklist");
  await page.keyboard.press("Enter");
  await expect(stepHeading(page, 4)).toBeFocused();
  await tabTo(page, "Back: simple version");
  await page.keyboard.press("Enter");
  await expect(stepHeading(page, 3)).toBeFocused();
});

test("keyboard only: the error state", async ({ page }) => {
  await page.goto("/?demoError=1");
  await tabTo(page, "Use the sample letter");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Sorry, that didn't work" })).toBeFocused();
  expect(await tabOrder(page)).toEqual(["Try again", "Use the sample letter"]);
  await page.getByRole("heading", { name: "Sorry, that didn't work" }).focus();
  await tabTo(page, "Try again");
  await page.keyboard.press("Enter");
  await expect(stepHeading(page, 2)).toBeFocused();
});

// ---------- Other standing requirements ----------

/** Visit each step and state in turn and run a check on it. */
async function onEveryScreen(page: Page, check: (screen: string) => Promise<void>): Promise<void> {
  await page.goto("/?demoError=1");
  await check("step 1");
  await page.getByRole("button", { name: "Use the sample letter" }).click();
  await check("step 1 loading");
  await expect(page.getByRole("alert")).toBeVisible();
  await check("step 1 error");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(stepHeading(page, 2)).toBeFocused();
  await check("step 2");
  await page.getByRole("button", { name: "furnish, show meaning" }).click();
  await check("word meaning");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Read the letter aloud" }).click();
  await check("step 2 reading");
  await page.getByRole("button", { name: "Done listening" }).click();
  await page.getByRole("button", { name: "Back: upload your letter" }).click();
  await check("step 1 with letter");
  await page.getByRole("button", { name: "Next: understand the words" }).click();
  await page.getByRole("button", { name: "Next: simple version" }).click();
  await check("step 3");
  await page.getByRole("button", { name: "See the original letter" }).click();
  await check("step 3 original letter");
  await page.getByRole("button", { name: "Next: checklist" }).click();
  await check("step 4");
  await page.getByRole("button", { name: "Read checklist aloud" }).click();
  await check("step 4 reading");
  await page.getByRole("button", { name: "Done listening" }).click();
  await check("step 4 confirmation");
}

for (const width of [640, 320, 195]) {
  // 200% zoom halves the layout width: 640 is a 1280px laptop, 195 is a 390px phone.
  test(`no sideways scrolling at ${width}px wide (200% zoom)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await onEveryScreen(page, async () => expectNoSidewaysScroll(page));
  });
}

test("every step shows 'Step X of 4: name' and the right number of filled segments", async ({
  page,
}) => {
  await useSample(page);
  for (const [step, next] of [
    [2, "Next: simple version"],
    [3, "Next: checklist"],
    [4, null],
  ] as const) {
    await expect(stepHeading(page, step)).toBeVisible();
    await expect(page.locator(".segments span")).toHaveCount(4);
    await expect(page.locator(".segments .on")).toHaveCount(step);
    if (next) await page.getByRole("button", { name: next }).click();
  }
  await expect(page.locator("html")).toHaveAttribute("lang", "en-IE");
});

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
      expect(
        ["Done", "Read aloud", "OK", "Back", "Next", ""],
        `vague button name on ${screen}`,
      ).not.toContain(name);
    }
  });
});

test("tap targets are big enough", async ({ page }) => {
  await onEveryScreen(page, async (screen) => {
    const sizes = await page.evaluate(() => {
      const scope = document.querySelector("dialog[open]") ?? document.querySelector("#screen")!;
      return [...scope.querySelectorAll<HTMLElement>("button, .check-row, .option-row")].map(
        (el) => {
          const box = el.getBoundingClientRect();
          const tall = el.matches(".btn-primary, .btn-secondary, .check-row, .option-row");
          return {
            name: el.textContent!.trim().slice(0, 30),
            w: box.width,
            h: box.height,
            min: tall ? 56 : 48,
          };
        },
      );
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
      const boxes = [...scope.querySelectorAll<HTMLElement>(".btn, .check-row, .option-row")]
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
    await page.getByRole("button", { name: "Use the sample letter" }).click();
    expect(await animationOf(".loader span")).toBe("none");
    await expect(stepHeading(page, 2)).toBeFocused();

    await page.getByRole("button", { name: "furnish, show meaning" }).click();
    expect(await animationOf("dialog.sheet")).toBe("none");
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Read the letter aloud" }).click();
    expect(await animationOf(".sound-bar i")).toBe("none");
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
