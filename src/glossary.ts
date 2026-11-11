/** Difficult words and their one-sentence meanings (PLAN.md §6). Keys are lower case. */
export const GLOSSARY: Readonly<Record<string, string>> = {
  furnish: "Give or send.",
  "documentary evidence": "Papers that prove something, like a bill or a letter.",
  means: "All the money you get, like wages or payments.",
  residency: "Where you live.",
  preceding: "The one before.",
  "materially altered": "Changed in a big way.",
  assessment: "The last time they checked if you could get the card.",
  "supplementary documentation": "Extra papers.",
  "tax return": "The form you send to Revenue each year showing what you earned.",
};

/** Case-insensitive lookup; tolerates extra spaces and surrounding punctuation. */
export function lookup(word: string): string | undefined {
  const key = word
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  return GLOSSARY[key];
}

// Longest phrases first so "documentary evidence" wins over any shorter overlap.
const TERM_PATTERN = new RegExp(
  `\\b(${Object.keys(GLOSSARY)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"))
    .join("|")})\\b`,
  "gi",
);

export interface TextPart {
  text: string;
  isTerm: boolean;
}

/** Split text into plain runs and glossary terms, keeping the original casing. */
export function splitTerms(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(TERM_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), isTerm: false });
    parts.push({ text: match[0], isTerm: true });
    last = start + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), isTerm: false });
  return parts;
}
