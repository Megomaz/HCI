import type { Checklist } from "./content";

/**
 * Live mode (optional, `?live=1`): real AI simplification through the serverless
 * functions in /api. The API key lives only on the server. Any failure here
 * ends in the normal error state.
 */

/** Give up on a hung request and show the error state instead. Not a limit on the user. */
const REQUEST_TIMEOUT_MS = 45_000;

async function post(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}`);
  return response.json();
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("Unexpected response");
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

export async function simplifyLive(text: string): Promise<Checklist> {
  const data = (await post("/api/simplify", { text })) as Record<string, unknown>;
  const list: Checklist = {
    mustHave: stringList(data.mustHave),
    optional: stringList(data.optional),
    onlyIfNeeded: stringList(data.onlyIfNeeded),
  };
  if (list.mustHave.length + list.optional.length + list.onlyIfNeeded.length === 0) {
    throw new Error("Empty checklist");
  }
  return list;
}

export async function explainLive(word: string, context: string): Promise<string> {
  const data = (await post("/api/explain", { word, context })) as Record<string, unknown>;
  if (typeof data.meaning !== "string" || data.meaning.trim() === "") {
    throw new Error("No meaning");
  }
  return data.meaning.trim();
}
