import { expect, test, type Page } from "@playwright/test";
import { aiCalls, installFakeSpeech, shot, stepHeading, textLetter, uniqueRef } from "./helpers";

/**
 * Uploaded letters, end to end: the browser reads the file, the real serverless
 * function runs, and a stand-in for OpenRouter answers (tests/mock-openrouter.mjs).
 * No real API key is used.
 */

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

const fileInput = (page: Page) => page.locator("#file-input");
const PARAGRAPH_1 =
  "Your application for Fuel Allowance has been received. You are required to furnish proof of household income within 21 days of the date of this letter.";
const PARAGRAPH_2 =
  "Failure to submit the requested documentation may result in your claim being disallowed.";

async function expectError(page: Page, message: string): Promise<void> {
  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Sorry, that didn't work" })).toBeFocused();
  await expect(alert.locator("p")).toHaveText(message);
  await expect(alert.getByRole("button")).toHaveText(["Try again", "Use the sample letter"]);
  await expect(stepHeading(page, 1)).toBeVisible();
}

test("the file chooser accepts PDFs, photos, text and Word files", async ({ page }) => {
  await page.goto("/");
  await expect(fileInput(page)).toHaveAttribute("accept", "application/pdf,image/*,.txt,.docx");
  // Tapping the button is enough: it opens the file chooser (no drag and drop needed)
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a letter" }).click();
  expect((await chooser).isMultiple()).toBe(false);
});

for (const file of ["letter.txt", "letter.docx", "letter.pdf", "letter.png"]) {
  test(`${file}: the words are read and Steps 2 to 4 are filled in`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/");
    await fileInput(page).setInputFiles(`tests/fixtures/${file}`);

    await expect(stepHeading(page, 2)).toBeFocused({ timeout: 60_000 });
    const paragraphs = page.locator(".letter-text p");
    await expect(paragraphs.filter({ hasText: "Fuel Allowance" })).toHaveText(PARAGRAPH_1);
    await expect(paragraphs.filter({ hasText: "Failure" })).toHaveText(PARAGRAPH_2);
    await expect(paragraphs.first()).toHaveText("Benefits Office");

    // The AI's difficult words are underlined and tappable; a word that is not in the letter is dropped
    await expect(page.locator(".letter-text button.term")).toHaveText([
      "Fuel Allowance",
      "furnish",
      "disallowed",
    ]);
    await page.getByRole("button", { name: "disallowed, show meaning" }).click();
    await expect(page.getByRole("dialog")).toContainText("Turned down.");
    await page.getByRole("button", { name: "Close" }).click();
    if (file === "letter.pdf") await shot(page, "up-2-words");

    // Step 3: the simple version, with remaining difficult words still underlined
    await page.getByRole("button", { name: "Next: simple version" }).click();
    await expect(page.locator(".simple-text p")).toHaveText([
      "We got your form for Fuel Allowance.",
      "You must furnish proof of the money your home gets.",
      "Send it within 21 days.",
      "If you do not, we may say no.",
    ]);
    await expect(page.locator(".simple-text button.term")).toHaveText(["Fuel Allowance", "furnish"]);
    await page.getByRole("button", { name: "See the original letter" }).click();
    await expect(page.locator(".letter-text p").filter({ hasText: "Failure" })).toHaveText(PARAGRAPH_2);

    // Step 4: the checklist, with the empty section left out
    await page.getByRole("button", { name: "Next: checklist" }).click();
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Must have", "Only if needed"]);
    await expect(page.locator(".check-text")).toHaveText([
      "Proof of the money your home gets, within 21 days",
      "If your address changed, tell us your new address",
    ]);
  });
}

test("one AI call per letter, text only, with the key sent only by the server", async ({ page }) => {
  const ref = uniqueRef();
  const sentByBrowser: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/simplify")) {
      sentByBrowser.push(JSON.stringify(request.headers()) + (request.postData() ?? ""));
    }
  });

  await page.goto("/");
  await fileInput(page).setInputFiles(textLetter(ref));
  await expect(stepHeading(page, 2)).toBeFocused();

  const seen = await aiCalls(page, ref);
  expect(seen.count).toBe(1);
  expect(seen.auth).toBe("Bearer test-key-not-real");
  expect(seen.model).toBe("deepseek/deepseek-chat");
  expect(seen.jsonMode).toBe(true);
  expect(seen.textOnly).toBe(true);

  // The browser's own request carries the letter text and no key
  expect(sentByBrowser).toHaveLength(1);
  expect(sentByBrowser[0]).toContain(ref);
  expect(sentByBrowser[0]).not.toContain("test-key-not-real");
  expect(sentByBrowser[0].toLowerCase()).not.toContain("bearer");
});

test("nothing about the letter is stored in the browser", async ({ page }) => {
  await page.goto("/");
  await fileInput(page).setInputFiles(textLetter(uniqueRef()));
  await expect(stepHeading(page, 2)).toBeFocused();
  const stored = await page.evaluate(() => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookies: document.cookie,
  }));
  expect(stored).toEqual({ local: 0, session: 0, cookies: "" });
  // A reload forgets the letter
  await page.reload();
  await expect(stepHeading(page, 1)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Next/ })).toHaveCount(0);
});

test("invalid JSON from the AI is retried once, without the user noticing", async ({ page }) => {
  const ref = uniqueRef();
  await page.goto("/");
  await fileInput(page).setInputFiles(textLetter(ref, "BADJSON-ONCE"));
  await expect(stepHeading(page, 2)).toBeFocused();
  expect((await aiCalls(page, ref)).count).toBe(2);
});

test("JSON wrapped in a code fence is still accepted", async ({ page }) => {
  const ref = uniqueRef();
  await page.goto("/");
  await fileInput(page).setInputFiles(textLetter(ref, "FENCED"));
  await expect(stepHeading(page, 2)).toBeFocused();
  expect((await aiCalls(page, ref)).count).toBe(1);
});

test("invalid JSON twice shows the Step 1 error; Try again asks again without re-reading the file", async ({
  page,
}) => {
  const ref = uniqueRef();
  await page.goto("/");
  await fileInput(page).setInputFiles(textLetter(ref, "BADJSON-ALWAYS"));
  await expectError(
    page,
    "We couldn't make this letter easier to read right now. Your letter is still here. Try again, or use the sample letter.",
  );
  expect((await aiCalls(page, ref)).count).toBe(2);
  await shot(page, "up-error-ai");

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await aiCalls(page, ref)).count).toBe(4);

  // The sample letter is always a way out
  await page.getByRole("button", { name: "Use the sample letter" }).click();
  await expect(stepHeading(page, 2)).toBeFocused();
  await expect(page.locator(".letter-text")).toContainText("Applicants must");
});

test("a failing AI service shows the Step 1 error", async ({ page }) => {
  const ref = uniqueRef();
  await page.goto("/");
  await fileInput(page).setInputFiles(textLetter(ref, "UPSTREAM-DOWN"));
  await expectError(
    page,
    "We couldn't make this letter easier to read right now. Your letter is still here. Try again, or use the sample letter.",
  );
  expect((await aiCalls(page, ref)).count).toBe(1);
});

test("a network failure shows the Step 1 error", async ({ page }) => {
  await page.route("**/api/simplify", (route) => route.abort());
  await page.goto("/");
  await fileInput(page).setInputFiles(textLetter(uniqueRef()));
  await expectError(
    page,
    "We couldn't make this letter easier to read right now. Your letter is still here. Try again, or use the sample letter.",
  );
});

test("being offline says so, and Try again works once back online", async ({ page, context }) => {
  await page.goto("/");
  await context.setOffline(true);
  await fileInput(page).setInputFiles(textLetter(uniqueRef()));
  await expectError(
    page,
    "You are not connected to the internet. Check your connection and try again, or use the sample letter.",
  );
  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(stepHeading(page, 2)).toBeFocused();
});

test("an answer in the wrong shape from the server shows the Step 1 error", async ({ page }) => {
  await page.route("**/api/simplify", (route) => route.fulfill({ json: { items: ["x"] } }));
  await page.goto("/");
  await fileInput(page).setInputFiles(textLetter(uniqueRef()));
  await expect(page.getByRole("alert")).toBeVisible();
});

for (const [file, message] of [
  [
    "blurry.png",
    "We couldn't read the words in this photo. Try a clearer photo in good light, or use the sample letter.",
  ],
  [
    "scan.pdf",
    "We couldn't find any words in this PDF. Try taking a photo of the letter instead, or use the sample letter.",
  ],
  ["empty.txt", "This file has no words in it. Try a different file, or use the sample letter."],
  [
    "notes.xyz",
    "We can't read this kind of file. Choose a PDF, a photo, a Word file or a text file, or use the sample letter.",
  ],
  ["broken.pdf", "We couldn't open this file. Try a different file, or use the sample letter."],
  [
    "long.txt",
    "This letter is too long for this prototype. Try one page at a time, or use the sample letter.",
  ],
] as const) {
  test(`${file}: plain-language error; Try again opens the file chooser`, async ({ page }) => {
    test.setTimeout(90_000);
    let aiCalled = false;
    await page.route("**/api/simplify", (route) => {
      aiCalled = true;
      return route.abort();
    });
    await page.goto("/");
    await fileInput(page).setInputFiles(`tests/fixtures/${file}`);
    await expectError(page, message);
    expect(aiCalled, "an unreadable file must not be sent to the AI").toBe(false);
    if (file === "blurry.png") await shot(page, "up-error-photo");

    // The file was the problem, so Try again asks for another file
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Try again" }).click();
    await (await chooser).setFiles("tests/fixtures/letter.txt");
    await page.unroute("**/api/simplify");
  });
}

test("while a letter is being read: progress shown, announced, and can be stopped", async ({
  page,
}) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/simplify", async (route) => {
    await held;
    await route.abort();
  });
  await page.goto("/");
  await fileInput(page).setInputFiles(textLetter(uniqueRef()));

  await expect(page.getByRole("heading", { name: "Reading your letter…" })).toBeFocused();
  await expect(page.locator(".loader")).toBeVisible();
  await expect(page.locator("#announcer")).toHaveText(
    "Reading your letter. This can take a little while.",
  );
  await page.getByRole("button", { name: "Stop and go back" }).click();
  await expect(stepHeading(page, 1)).toBeFocused();
  release();
  await page.waitForTimeout(500);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("?demoError=1 also makes the first upload fail; Try again then works", async ({ page }) => {
  const ref = uniqueRef();
  await page.goto("/?demoError=1");
  await fileInput(page).setInputFiles(textLetter(ref));
  await expect(page.getByRole("alert")).toBeVisible();
  expect((await aiCalls(page, ref)).count).toBe(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(stepHeading(page, 2)).toBeFocused();
  expect((await aiCalls(page, ref)).count).toBe(1);
});

test("read aloud works on an uploaded letter", async ({ page }) => {
  await page.goto("/");
  await fileInput(page).setInputFiles(textLetter(uniqueRef()));
  await expect(stepHeading(page, 2)).toBeFocused();
  await page.getByRole("button", { name: "Read the letter aloud" }).click();
  await expect(page.getByText("Finished reading")).toBeVisible({ timeout: 20_000 });
  const texts = await page.evaluate(
    () => (window as unknown as { __spoken: { text: string }[] }).__spoken.map((line) => line.text),
  );
  expect(texts[0]).toBe("Tip: tap any underlined word to hear what it means.");
  expect(texts).toContain("Dear Applicant,");
  expect(texts).toContain("Your application for Fuel Allowance has been received.");
  expect(texts).toContain("Fuel Allowance means: money to help pay for heating.");
  expect(texts).toContain("disallowed means: turned down.");
});
