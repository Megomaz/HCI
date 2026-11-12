import { MAX_LETTER_LENGTH, SYSTEM_PROMPT, parseAnswer } from "./_lib/letter.js";

/**
 * POST /api/simplify  { text }  ->  { difficultWords, simpleVersion, checklist }
 *
 * Sends the letter's text to DeepSeek through OpenRouter (text only, never an image).
 * The API key is read from the OPENROUTER_API_KEY environment variable and is used
 * only here, on the server. Nothing is stored and the letter text is never logged.
 */

const DEFAULT_MODEL = "deepseek/deepseek-chat";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
/** Two tries must fit inside the function's 60 second limit (see vercel.json). */
const MODEL_TIMEOUT_MS = 28_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

class UpstreamError extends Error {
  constructor(public readonly status: number) {
    super(`OpenRouter answered ${status}`);
  }
}

async function askModel(text: string, apiKey: string): Promise<string> {
  const baseUrl = process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Translate prototype",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `<letter>\n${text}\n</letter>` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 6000,
    }),
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
  });
  if (!response.ok) throw new UpstreamError(response.status);

  const data = (await response.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

export async function POST(request: Request): Promise<Response> {
  let text = "";
  try {
    const body: unknown = await request.json();
    const value = (body as { text?: unknown } | null)?.text;
    if (typeof value === "string") text = value.trim();
  } catch {
    return json({ error: "The request was not valid JSON" }, 400);
  }
  if (!text) return json({ error: "No letter text" }, 400);
  if (text.length > MAX_LETTER_LENGTH) return json({ error: "The letter is too long" }, 413);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY is not set");
    return json({ error: "The AI service is not set up" }, 503);
  }

  try {
    // If the answer is not valid JSON in the agreed shape, ask once more.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const answer = parseAnswer(await askModel(text, apiKey), text);
      if (answer) return json(answer);
      console.error(`Model answer was not valid (attempt ${attempt} of 2)`);
    }
    return json({ error: "The AI answer could not be used" }, 502);
  } catch (error) {
    if (error instanceof UpstreamError) {
      console.error(error.message);
      if (error.status === 429) return json({ error: "The AI service is busy" }, 429);
      if (error.status === 401 || error.status === 402 || error.status === 403) {
        return json({ error: "The AI service is not set up" }, 503);
      }
      return json({ error: "The AI service had a problem" }, 502);
    }
    console.error(error instanceof Error ? error.name : "Unknown error");
    return json({ error: "The AI service could not be reached" }, 502);
  }
}
