import { expect, test } from "@playwright/test";
import {
  SAMPLE_ITEMS,
  SAMPLE_ORIGINAL,
  SAMPLE_SIMPLE,
  expectNoSidewaysScroll,
  installFakeSpeech,
  shot,
  stepHeading,
  useSample,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

test("the four steps in order with the sample letter, at 390px", async ({ page }) => {
  await page.goto("/");

  // Step 1
  await expect(stepHeading(page, 1)).toBeVisible();
  await expect(page).toHaveTitle("Step 1 of 4: Upload your letter – Translate");
  await expect(page.locator(".segments .on")).toHaveCount(1);
  await expect(
    page.getByText(
      "This is a prototype. Use the sample letter, or a letter with your personal details removed.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose a letter" })).toBeVisible();
  await expect(page.getByText("Prototype – synthetic content")).toBeVisible();
  // No Back on Step 1, and no Next until there is a letter
  await expect(page.getByRole("button", { name: /^Back|^Next/ })).toHaveCount(0);
  await expectNoSidewaysScroll(page);
  await shot(page, "1-upload");

  // Loading state, announced politely
  await page.getByRole("button", { name: "Use the sample letter" }).click();
  await expect(page.getByRole("heading", { name: "Reading your letter…" })).toBeFocused();
  await expect(page.locator("#announcer")).toHaveText(
    "Reading your letter. This can take a little while.",
  );
  await expect(page.locator("#announcer")).toHaveAttribute("aria-live", "polite");
  await shot(page, "1-loading");

  // Step 2
  await expect(stepHeading(page, 2)).toBeFocused();
  await expect(page.locator(".segments .on")).toHaveCount(2);
  await expect(page.getByText("Tip: tap any underlined word to see what it means.")).toBeVisible();
  await expect(page.locator(".letter-text")).toHaveText(SAMPLE_ORIGINAL);
  await expectNoSidewaysScroll(page);
  await shot(page, "2-words");

  // Step 3
  await page.getByRole("button", { name: "Next: simple version" }).click();
  await expect(stepHeading(page, 3)).toBeFocused();
  await expect(page.locator(".segments .on")).toHaveCount(3);
  await expect(page.locator(".simple-text p")).toHaveText(SAMPLE_SIMPLE);
  await expect(page.getByText("Not sure? Check it against the original letter.")).toBeVisible();
  await expect(page.getByText("Tip: tap any underlined word to see what it means.")).toBeVisible();
  await expectNoSidewaysScroll(page);
  await shot(page, "3-simple");

  // See the original letter toggles to Back to simple version, and focus stays on the toggle
  await page.getByRole("button", { name: "See the original letter" }).click();
  await expect(page.locator(".letter-text")).toHaveText(SAMPLE_ORIGINAL);
  const backToSimple = page.getByRole("button", { name: "Back to simple version" });
  await expect(backToSimple).toBeFocused();
  await expect(stepHeading(page, 3)).toBeVisible();
  await shot(page, "3-original");
  await backToSimple.click();
  await expect(page.locator(".simple-text p")).toHaveText(SAMPLE_SIMPLE);
  await expect(page.getByRole("button", { name: "See the original letter" })).toBeFocused();

  // Step 4
  await page.getByRole("button", { name: "Next: checklist" }).click();
  await expect(stepHeading(page, 4)).toBeFocused();
  await expect(page.locator(".segments .on")).toHaveCount(4);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Must have",
    "Optional",
    "Only if needed",
  ]);
  await expect(page.locator(".check-text")).toHaveText(SAMPLE_ITEMS);
  for (const item of SAMPLE_ITEMS) {
    await expect(page.getByRole("checkbox", { name: item, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /^Next/ })).toHaveCount(0);

  // Whole row is tappable, and the tick survives leaving the step
  const income = page.getByRole("checkbox", { name: SAMPLE_ITEMS[0] });
  await page.getByText("Proof of your income for the last 12 months").click();
  await expect(income).toBeChecked();
  await income.click();
  await expect(income).not.toBeChecked();
  await income.click();
  await expect(income).toBeChecked();
  await expectNoSidewaysScroll(page);
  await shot(page, "4-checklist");

  // Back, step by step, all the way to Step 1
  await page.getByRole("button", { name: "Back: simple version" }).click();
  await expect(stepHeading(page, 3)).toBeFocused();
  await page.getByRole("button", { name: "Back: understand the words" }).click();
  await expect(stepHeading(page, 2)).toBeFocused();
  await page.getByRole("button", { name: "Back: upload your letter" }).click();
  await expect(stepHeading(page, 1)).toBeFocused();

  // With a letter loaded, Step 1 offers Next
  await page.getByRole("button", { name: "Next: understand the words" }).click();
  await expect(stepHeading(page, 2)).toBeFocused();
  await page.getByRole("button", { name: "Skip to checklist" }).click();
  await expect(income).toBeChecked();
});

test("Skip to checklist goes from Step 2 straight to Step 4", async ({ page }) => {
  await useSample(page);
  await page.getByRole("button", { name: "Skip to checklist" }).click();
  await expect(stepHeading(page, 4)).toBeFocused();
  await expect(page.locator(".check-text")).toHaveText(SAMPLE_ITEMS);
});

test("Start again with another letter returns to Step 1 and forgets the letter", async ({
  page,
}) => {
  await useSample(page);
  await page.getByRole("button", { name: "Skip to checklist" }).click();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Start again with another letter" }).click();
  await expect(stepHeading(page, 1)).toBeFocused();
  await expect(page.getByRole("button", { name: /^Next/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Use the sample letter" }).click();
  await expect(stepHeading(page, 2)).toBeFocused();
  await page.getByRole("button", { name: "Skip to checklist" }).click();
  await expect(page.getByRole("checkbox").first()).not.toBeChecked();
});

test("the sample letter works offline, through all four steps", async ({ page, context }) => {
  await page.goto("/");
  await context.setOffline(true);
  await page.getByRole("button", { name: "Use the sample letter" }).click();
  await expect(stepHeading(page, 2)).toBeFocused();
  await page.getByRole("button", { name: "furnish, show meaning" }).click();
  await expect(page.getByRole("dialog")).toContainText("Give or send.");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Next: simple version" }).click();
  await expect(page.locator(".simple-text p")).toHaveText(SAMPLE_SIMPLE);
  await page.getByRole("button", { name: "Next: checklist" }).click();
  await expect(page.locator(".check-text")).toHaveText(SAMPLE_ITEMS);
});

test("the sample letter never calls the AI", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/**", (route) => {
    calls += 1;
    return route.abort();
  });
  await useSample(page);
  await page.getByRole("button", { name: "Skip to checklist" }).click();
  expect(calls).toBe(0);
});

test("?demoError=1 makes the first attempt fail, in plain language; Try again works", async ({
  page,
}) => {
  await page.goto("/?demoError=1");
  await page.getByRole("button", { name: "Use the sample letter" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sorry, that didn't work" })).toBeFocused();
  await expect(alert).toContainText(
    "We couldn't make this letter easier to read right now. Your letter is still here. Try again, or use the sample letter.",
  );
  await expect(alert.locator(".error-title svg")).toBeVisible(); // not shown by colour alone
  await expect(alert.getByRole("button")).toHaveText(["Try again", "Use the sample letter"]);
  await expect(stepHeading(page, 1)).toBeVisible();
  await expectNoSidewaysScroll(page);
  await shot(page, "1-error");

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(stepHeading(page, 2)).toBeFocused();
});

test("without ?demoError=1 nothing fails on purpose", async ({ page }) => {
  await useSample(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("Stop and go back cancels reading a letter", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use the sample letter" }).click();
  await page.getByRole("button", { name: "Stop and go back" }).click();
  await expect(stepHeading(page, 1)).toBeFocused();
  await page.waitForTimeout(2000);
  await expect(stepHeading(page, 1)).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose a letter" })).toBeVisible();
});

test("there are no hidden skip or test links", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /test|debug/i })).toHaveCount(0);
  await useSample(page);
  await expect(page.getByRole("link")).toHaveCount(0);
});
