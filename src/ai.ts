import { LoadError } from "./errors";
import type { AiResult } from "./letter";

/**
 * Asks the serverless function to simplify an uploaded letter (one call).
 * The API key lives only on the server. Any failure ends in the Step 1 error state.
 */

/** Give up on a hung request and show the error state instead. Not a limit on the user. */
const REQUEST_TIMEOUT_MS = 70_000;

const isOffline = () => navigator.onLine === false;

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new LoadError("ai");
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

export async function analyseLetter(text: string): Promise<AiResult> {
  if (isOffline()) throw new LoadError("offline");

  let response: Response;
  try {
    response = await fetch("/api/simplify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new LoadError(isOffline() ? "offline" : "ai");
  }
  if (response.status === 413) throw new LoadError("long");
  if (!response.ok) throw new LoadError("ai");

  try {
    const data = (await response.json()) as Record<string, unknown>;
    const checklist = data.checklist as Record<string, unknown>;
    const result: AiResult = {
      difficultWords: (data.difficultWords as unknown[]).flatMap((entry) => {
        const { term, meaning } = entry as Record<string, unknown>;
        return typeof term === "string" && typeof meaning === "string" && term.trim() && meaning.trim()
          ? [{ term: term.trim(), meaning: meaning.trim() }]
          : [];
      }),
      simpleVersion: stringList(data.simpleVersion),
      checklist: {
        mustHave: stringList(checklist.mustHave),
        optional: stringList(checklist.optional),
        onlyIfNeeded: stringList(checklist.onlyIfNeeded),
      },
    };
    if (result.simpleVersion.length === 0) throw new LoadError("ai");
    return result;
  } catch {
    throw new LoadError("ai");
  }
}
