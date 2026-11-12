import { SECTIONS } from "./content";
import { splitTerms, type DifficultWord } from "./glossary";
import { allSentences, type Letter } from "./letter";

/** The tip as shown on screen, and as spoken at the start of read aloud. */
export const TIP_TEXT = "Tip: tap any underlined word to see what it means.";
export const SPOKEN_TIP = "Tip: tap any underlined word to hear what it means.";

/** One spoken line, and what to highlight on screen while it is spoken. */
export interface ReadLine {
  text: string;
  /** Matches a `data-line` attribute on the screen. */
  lineId?: string;
  /** Matches a `data-term-id` attribute: the underlined word being explained. */
  termId?: string;
}

/** Id of the n-th underlined word inside a line. Shared by the markup and the speech queue. */
export function termIdFor(lineId: string, n: number): string {
  return `${lineId}-t${n}`;
}

export const sentenceLineId = (index: number) => `s${index}`;
export const simpleLineId = (index: number) => `v${index}`;

function lowerFirst(text: string): string {
  // Leave acronyms such as "PPS number" alone.
  return /^\p{Lu}\p{Lu}/u.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * After a sentence is read, say what each underlined word in it means:
 * "furnish means: give or send." Without this, someone who only listens
 * never finds out that the meanings exist.
 */
function meaningLines(text: string, lineId: string, words: readonly DifficultWord[]): ReadLine[] {
  return splitTerms(text, words)
    .filter((part) => part.word)
    .map((part, n) => ({
      text: `${part.text} means: ${lowerFirst(part.word!.meaning)}`,
      lineId,
      termId: termIdFor(lineId, n),
    }));
}

function withMeanings(
  texts: readonly string[],
  idFor: (index: number) => string,
  words: readonly DifficultWord[],
  explain: boolean,
): ReadLine[] {
  return texts.flatMap((text, i) => {
    const lineId = idFor(i);
    return [{ text, lineId }, ...(explain ? meaningLines(text, lineId, words) : [])];
  });
}

/** The tip is spoken first whenever the text has underlined words to tap. */
function tipLine(texts: readonly string[], words: readonly DifficultWord[]): ReadLine[] {
  const any = texts.some((text) => splitTerms(text, words).some((part) => part.word));
  return any ? [{ text: SPOKEN_TIP, lineId: "tip" }] : [];
}

export function letterLines(letter: Letter, explain: boolean): ReadLine[] {
  const sentences = allSentences(letter);
  return [
    ...tipLine(sentences, letter.words),
    ...withMeanings(sentences, sentenceLineId, letter.words, explain),
  ];
}

export function simpleLines(letter: Letter, explain: boolean): ReadLine[] {
  return [
    ...tipLine(letter.simple, letter.words),
    ...withMeanings(letter.simple, simpleLineId, letter.words, explain),
  ];
}

export function checklistLines(letter: Letter, explain: boolean): ReadLine[] {
  const items = SECTIONS.flatMap(({ key }) => letter.checklist[key]);
  const lines: ReadLine[] = [...tipLine(items, letter.words), { text: "Your checklist." }];
  for (const { key, title } of SECTIONS) {
    const list = letter.checklist[key];
    if (list.length === 0) continue;
    lines.push({ text: `${title}.`, lineId: `sec-${key}` });
    lines.push(...withMeanings(list, (i) => `${key}-${i}`, letter.words, explain));
  }
  return lines;
}
