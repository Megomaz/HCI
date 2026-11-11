import { expect, test } from "@playwright/test";
import { installFakeSpeech, spokenTexts } from "./helpers";

/**
 * Live mode (?live=1). The AI itself is mocked here, so these tests need no API
 * key and cost nothing; they check the browser side and the function's input checks.
 */

const AI_CHECKLIST = {
  mustHave: ["Your last 3 payslips", "A copy of your tax return"],
  optional: [],
  onlyIfNeeded: ["If you moved house, send a bill with your new address"],
};

test.beforeEach(async ({ page }) => {
  await installFakeSpeech(page);
});

test("demo mode has no letter box and never calls the server", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/**", (route) => {
    calls += 1;
    return route.abort();
  });
  await page.goto("/");
  await expect(page.getByLabel("Paste your own letter")).toHaveCount(0);
  await page.getByRole("button", { name: "Simplify this" }).click();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "What you need to send" })).toBeFocused();
  expect(calls).toBe(0);
});

test("simplifies a pasted letter and shows the AI's checklist", async ({ page }) => {
  let sent: { text?: string } = {};
  await page.route("**/api/simplify", async (route) => {
    sent = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ json: AI_CHECKLIST });
  });

  await page.goto("/?live=1");
  await page
    .getByLabel("Paste your own letter")
    .fill("You are required to submit remuneration records. Notify us of any change of address.");
  await page.getByRole("button", { name: "Simplify this" }).click();
  await expect(page.getByRole("heading", { name: "Making this easier to read…" })).toBeVisible();

  await expect(page.getByRole("heading", { name: "What you need to send" })).toBeFocused();
  expect(sent.text).toBe(
    "You are required to submit remuneration records. Notify us of any change of address.",
  );
  await expect(page.locator(".check-text")).toHaveText([
    "Your last 3 payslips",
    "A copy of your tax return",
    "If you moved house, send a bill with your new address",
  ]);
  // An empty section is left out, and glossary words in the AI's answer are still tappable
  await expect(page.getByRole("heading", { level: 3 })).toHaveText(["Must have", "Only if needed"]);
  await expect(page.getByRole("button", { name: "tax return, show meaning" })).toBeVisible();

  // The original text is now the pasted letter
  await page.getByRole("button", { name: "See the original text" }).click();
  await expect(page.locator(".original")).toHaveText(
    "You are required to submit remuneration records. Notify us of any change of address.",
  );
  await page.getByRole("button", { name: "Read the original aloud" }).click();
  await expect.poll(() => spokenTexts(page)).toContain("Notify us of any change of address.");
});

test("with no letter pasted, the page's own text is sent", async ({ page }) => {
  let sent: { text?: string } = {};
  await page.route("**/api/simplify", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: AI_CHECKLIST });
  });
  await page.goto("/?live=1");
  await page.getByRole("button", { name: "Simplify this" }).click();
  await expect(page.getByRole("heading", { name: "What you need to send" })).toBeFocused();
  expect(sent.text).toMatch(/^Applicants must furnish documentary evidence/);
});

for (const [name, reply] of [
  ["a server error", { status: 503, json: { error: "Live mode is not available" } }],
  ["an answer in the wrong shape", { status: 200, json: { items: ["x"] } }],
  ["an empty checklist", { status: 200, json: { mustHave: [], optional: [], onlyIfNeeded: [] } }],
  ["something that is not JSON", { status: 200, body: "<html>oops</html>" }],
] as const) {
  test(`${name} shows the error state, and Try again recovers`, async ({ page }) => {
    let calls = 0;
    await page.route("**/api/simplify", (route) => {
      calls += 1;
      return calls === 1 ? route.fulfill(reply) : route.fulfill({ json: AI_CHECKLIST });
    });
    await page.goto("/?live=1");
    await page.getByRole("button", { name: "Simplify this" }).click();
    await expect(page.getByRole("alert")).toContainText(
      "Sorry, we couldn't simplify this right now",
    );
    await expect(page.getByRole("alert")).toContainText("Your page is still here. Nothing is lost.");
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByRole("heading", { name: "What you need to send" })).toBeFocused();
  });
}

test("a network failure shows the error state", async ({ page }) => {
  await page.route("**/api/simplify", (route) => route.abort());
  await page.goto("/?live=1");
  await page.getByRole("button", { name: "Simplify this" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("a selected word that is not in the glossary is explained by the AI", async ({ page }) => {
  let sent: { word?: string; context?: string } = {};
  await page.route("**/api/explain", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({ json: { meaning: "People who are asking for something." } });
  });
  await page.goto("/?live=1");
  await page.evaluate(() => {
    const node = document.querySelector(".original .sentence")!.firstChild!;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, "Applicants".length);
    window.getSelection()!.addRange(range);
  });

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Applicants" })).toBeVisible();
  await expect(dialog).toContainText("People who are asking for something.");
  expect(sent.word).toBe("Applicants");
  expect(sent.context).toContain("Applicants must furnish");

  await page.getByRole("button", { name: "Read meaning aloud" }).click();
  await expect
    .poll(() => spokenTexts(page))
    .toEqual(["Applicants. People who are asking for something."]);
});

test("if the AI can't explain a word, the plain fallback message is shown", async ({ page }) => {
  await page.route("**/api/explain", (route) => route.fulfill({ status: 502, json: {} }));
  await page.goto("/?live=1");
  await page.evaluate(() => {
    const node = document.querySelector(".original .sentence")!.firstChild!;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, "Applicants".length);
    window.getSelection()!.addRange(range);
  });
  await expect(page.getByRole("dialog")).toContainText(
    "We don't have a simple meaning for this word yet.",
  );
});

test("the function rejects bad input before calling the AI", async ({ request }) => {
  const empty = await request.post("/api/simplify", { data: { text: "   " } });
  expect(empty.status()).toBe(400);

  const tooLong = await request.post("/api/simplify", { data: { text: "a".repeat(4001) } });
  expect(tooLong.status()).toBe(413);

  const notJson = await request.post("/api/simplify", {
    headers: { "Content-Type": "application/json" },
    data: "not json",
  });
  expect(notJson.status()).toBe(400);

  const noWord = await request.post("/api/explain", { data: { context: "hello" } });
  expect(noWord.status()).toBe(400);

  const wrongMethod = await request.get("/api/simplify");
  expect(wrongMethod.status()).toBe(405);
});
