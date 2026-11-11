import {
  MAX_LETTER_LENGTH,
  MAX_WORD_LENGTH,
  errorResponse,
  explainWord,
  json,
  readJson,
} from "./_lib/claude.js";

/** POST /api/explain  { word, context? } -> { meaning } */
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  const word = typeof body?.word === "string" ? body.word.trim() : "";
  const context = typeof body?.context === "string" ? body.context.trim() : "";
  if (!word) return json({ error: "No word to explain" }, 400);
  if (word.length > MAX_WORD_LENGTH || context.length > MAX_LETTER_LENGTH) {
    return json({ error: "Text is too long" }, 413);
  }

  try {
    return json({ meaning: await explainWord(word, context) });
  } catch (error) {
    return errorResponse(error);
  }
}
