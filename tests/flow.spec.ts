import { expect, test } from "@playwright/test";
import { expectNoSidewaysScroll, installFakeSpeech, shot } from "./helpers";

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

test("full click-through at 390px", async ({ page }) => {
  await page.goto("/");

  // 1. Renewal page
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Medical Card – Renewal");
  await expect(page.getByText("Step 2 of 4: Documents")).toBeVisible();
  await expect(page.getByText("Tip: tap any underlined word to see what it means.")).toBeVisible();
  await expect(page.getByText("Prototype – synthetic content")).toBeVisible();
  await expect(page.locator(".original")).toHaveText(
    "Applicants must furnish documentary evidence of all means, including self-employment income for the preceding 12-month period, together with proof of residency. Where the applicant's circumstances have materially altered since the previous assessment, supplementary documentation may be required.",
  );
  await expectNoSidewaysScroll(page);
  await shot(page, "1-renewal");

  // 2. Simplifying
  await page.getByRole("button", { name: "Simplify this" }).click();
  const simplifying = page.getByRole("heading", { name: "Making this easier to read…" });
  await expect(simplifying).toBeFocused();
  await expect(page.getByText("This takes a few seconds.", { exact: true })).toBeVisible();
  await expect(page.locator("#announcer")).toHaveText(
    "Making this easier to read. This takes a few seconds.",
  );
  await shot(page, "2-simplifying");

  // 3. Error: the first Simplify fails on purpose in demo mode
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sorry, we couldn't simplify this right now" }),
  ).toBeFocused();
  await expect(alert).toContainText("Your page is still here. Nothing is lost.");
  await expect(page.getByRole("button", { name: "Read the original aloud" })).toHaveCount(1);
  await expectNoSidewaysScroll(page);
  await shot(page, "3-error");

  // Try again succeeds
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(simplifying).toBeVisible();

  // 4. Checklist
  const checklistHeading = page.getByRole("heading", { name: "What you need to send" });
  await expect(checklistHeading).toBeFocused();
  for (const section of ["Must have", "Optional", "Only if needed"]) {
    await expect(page.getByRole("heading", { level: 3, name: section, exact: true })).toBeVisible();
  }
  const items = [
    "Proof of your income for the last 12 months (for example, your tax return)",
    "Proof of your address (for example, a recent bill)",
    "A letter from your accountant, if you have one",
    "If your income or home changed since last year, send proof of the change",
  ];
  await expect(page.locator(".check-text")).toHaveText(items);
  for (const item of items) {
    await expect(page.getByRole("checkbox", { name: item, exact: true })).toBeVisible();
  }

  // Whole row is tappable, and the tick survives leaving the screen
  const income = page.getByRole("checkbox", { name: items[0] });
  await page.getByText("Proof of your income for the last 12 months").click();
  await expect(income).toBeChecked();
  await income.click();
  await expect(income).not.toBeChecked();
  await income.click();
  await expect(income).toBeChecked();
  await expectNoSidewaysScroll(page);
  await shot(page, "4-checklist");

  // See the original text, then back
  await page.getByRole("button", { name: "See the original text" }).click();
  await expect(page.getByRole("heading", { name: "The original text" })).toBeFocused();
  await expect(page.getByText("Applicants must")).toBeVisible();
  await shot(page, "5-original");
  await page.getByRole("button", { name: "Back to simple version" }).click();
  await expect(checklistHeading).toBeFocused();
  await expect(income).toBeChecked();

  // 5. Reading aloud, then the confirmation
  await page.getByRole("button", { name: "Read checklist aloud" }).click();
  await expect(page.getByText("Reading aloud…")).toBeVisible();
  await shot(page, "6-reading");
  await page.getByRole("button", { name: "Done listening" }).click();
  await expect(
    page.getByRole("heading", { name: "You have everything you need to know." }),
  ).toBeFocused();
  await expect(page.getByText("Gather these documents, then continue.")).toBeVisible();
  await shot(page, "7-done");
  await page.getByRole("button", { name: "Back to checklist" }).click();
  await expect(checklistHeading).toBeFocused();
});

test("?demoError=0 goes straight to the checklist", async ({ page }) => {
  await page.goto("/?demoError=0");
  await page.getByRole("button", { name: "Simplify this" }).click();
  await expect(page.getByRole("heading", { name: "What you need to send" })).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("there are no hidden skip or test links", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /skip|test|debug/i })).toHaveCount(0);
});
