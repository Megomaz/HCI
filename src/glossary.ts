/** A difficult word (or phrase) and its one-sentence meaning. */
export interface DifficultWord {
  term: string;
  meaning: string;
}

/** The sample letter's difficult words (PLAN.md §7). Uploaded letters get theirs from the AI. */
export const SAMPLE_WORDS: readonly DifficultWord[] = [
  { term: "furnish", meaning: "Give or send." },
  {
    term: "documentary evidence",
    meaning: "Papers that prove something, like a bill or a letter.",
  },
  { term: "means", meaning: "All the money you get, like wages or payments." },
  { term: "residency", meaning: "Where you live." },
  { term: "preceding", meaning: "The one before." },
  { term: "materially altered", meaning: "Changed in a big way." },
  { term: "assessment", meaning: "The last time they checked if you could get the card." },
  { term: "supplementary documentation", meaning: "Extra papers." },
  {
    term: "tax return",
    meaning: "The form you send to Revenue each year showing what you earned.",
  },
];

function keyOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** Case-insensitive lookup; tolerates extra spaces and surrounding punctuation. */
export function findWord(
  words: readonly DifficultWord[],
  text: string,
): DifficultWord | undefined {
  const key = keyOf(text);
  return key ? words.find((word) => keyOf(word.term) === key) : undefined;
}

const patterns = new WeakMap<readonly DifficultWord[], RegExp | null>();

function patternFor(words: readonly DifficultWord[]): RegExp | null {
  let pattern = patterns.get(words);
  if (pattern === undefined) {
    const terms = words
      .map((word) => word.term.trim())
      .filter(Boolean)
      // Longest first, so "documentary evidence" wins over any shorter overlap.
      .sort((a, b) => b.length - a.length)
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"));
    pattern = terms.length > 0 ? new RegExp(terms.join("|"), "giu") : null;
    patterns.set(words, pattern);
  }
  return pattern;
}

const isWordChar = (char: string | undefined) => !!char && /[\p{L}\p{N}]/u.test(char);

export interface TextPart {
  text: string;
  /** Set when this run is one of the difficult words. */
  word?: DifficultWord;
}

/** Split text into plain runs and difficult words (whole words only), keeping the original casing. */
export function splitTerms(text: string, words: readonly DifficultWord[]): TextPart[] {
  const pattern = patternFor(words);
  if (!pattern) return [{ text }];

  const parts: TextPart[] = [];
  let last = 0;
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const start = match.index;
    const end = start + match[0].length;
    const word = findWord(words, match[0]);
    if (!word || isWordChar(text[start - 1]) || isWordChar(text[end])) {
      pattern.lastIndex = start + 1; // part of a longer word: keep looking
      continue;
    }
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: match[0], word });
    last = end;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function hasTerms(texts: readonly string[], words: readonly DifficultWord[]): boolean {
  return texts.some((text) => splitTerms(text, words).some((part) => part.word));
}
