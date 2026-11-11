import {
  MAX_LETTER_LENGTH,
  errorResponse,
  json,
  readJson,
  simplifyLetter,
} from "./_lib/claude.js";

/** POST /api/simplify  { text } -> { mustHave: [], optional: [], onlyIfNeeded: [] } */
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return json({ error: "No text to simplify" }, 400);
  if (text.length > MAX_LETTER_LENGTH) return json({ error: "Text is too long" }, 413);

  try {
    return json(await simplifyLetter(text));
  } catch (error) {
    return errorResponse(error);
  }
}
