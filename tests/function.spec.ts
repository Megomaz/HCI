import { expect, test } from "@playwright/test";
import { parseAnswer } from "../api/_lib/letter";

/** The serverless function's own checks, and the rules for accepting the AI's answer. */

const LETTER = "You must furnish proof of income. Your claim may be disallowed.";

const GOOD = {
  difficultWords: [{ term: "furnish", meaning: "Give or send." }],
  simpleVersion: ["Send proof of your money."],
  checklist: { mustHave: ["Proof of your money"], optional: [], onlyIfNeeded: [] },
};

test.describe("POST /api/simplify input checks (before any AI call)", () => {
  test("rejects an empty letter", async ({ request }) => {
    const response = await request.post("/api/simplify", { data: { text: "   " } });
    expect(response.status()).toBe(400);
  });

  test("rejects a letter that is too long, rather than cutting it short", async ({ request }) => {
    const response = await request.post("/api/simplify", { data: { text: "a".repeat(8001) } });
    expect(response.status()).toBe(413);
  });

  test("rejects a body that is not JSON", async ({ request }) => {
    const response = await request.post("/api/simplify", {
      headers: { "Content-Type": "application/json" },
      data: "not json",
    });
    expect(response.status()).toBe(400);
  });

  test("only POST is allowed", async ({ request }) => {
    expect((await request.get("/api/simplify")).status()).toBe(405);
  });
});

test.describe("without an API key", () => {
  test("answers 503 and never calls the AI service", async () => {
    const savedKey = process.env.OPENROUTER_API_KEY;
    const savedFetch = globalThis.fetch;
    delete process.env.OPENROUTER_API_KEY;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch;
    try {
      const { POST } = await import("../api/simplify");
      const response = await POST(
        new Request("http://localhost/api/simplify", {
          method: "POST",
          body: JSON.stringify({ text: LETTER }),
        }),
      );
      expect(response.status).toBe(503);
      expect(called).toBe(false);
    } finally {
      globalThis.fetch = savedFetch;
      if (savedKey !== undefined) process.env.OPENROUTER_API_KEY = savedKey;
    }
  });
});

test.describe("accepting the AI's answer", () => {
  test("a valid answer passes through", () => {
    expect(parseAnswer(JSON.stringify(GOOD), LETTER)).toEqual(GOOD);
  });

  test("a code fence around the JSON is tolerated", () => {
    expect(parseAnswer("```json\n" + JSON.stringify(GOOD) + "\n```", LETTER)).toEqual(GOOD);
  });

  test("terms that are not in the letter are dropped, and repeats removed", () => {
    const answer = parseAnswer(
      JSON.stringify({
        ...GOOD,
        difficultWords: [
          { term: "furnish", meaning: "Give or send." },
          { term: "Furnish", meaning: "A repeat." },
          { term: "remuneration", meaning: "Not in the letter." },
          { term: "disallowed", meaning: "  Turned   down. " },
        ],
      }),
      LETTER,
    );
    expect(answer?.difficultWords).toEqual([
      { term: "furnish", meaning: "Give or send." },
      { term: "disallowed", meaning: "Turned down." },
    ]);
  });

  for (const [name, reply] of [
    ["text that is not JSON", "Here you go!"],
    ["a missing checklist", JSON.stringify({ ...GOOD, checklist: undefined })],
    ["a checklist with a missing section", JSON.stringify({ ...GOOD, checklist: { mustHave: [] } })],
    ["no simple version", JSON.stringify({ ...GOOD, simpleVersion: [] })],
    ["a simple version of blank lines", JSON.stringify({ ...GOOD, simpleVersion: ["  ", ""] })],
    ["words in the wrong shape", JSON.stringify({ ...GOOD, difficultWords: ["furnish"] })],
    ["an empty reply", ""],
  ] as const) {
    test(`${name} is rejected`, () => {
      expect(parseAnswer(reply, LETTER)).toBeNull();
    });
  }
});
