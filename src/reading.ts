import { SECTIONS, type Checklist } from "./content";
import { lookup, splitTerms } from "./glossary";

export const TIP_TEXT = "Tip: tap any underlined word to see what it means.";

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

export function sentenceLineId(index: number): string {
  return `s${index}`;
}

/**
 * After a line is read, say what each underlined word in it means.
 * Without this, someone who only listens never finds out the meanings exist.
 */
function meaningLines(text: string, lineId: string): ReadLine[] {
  return splitTerms(text)
    .filter((part) => part.isTerm)
    .map((part, n) => ({
      text: `${part.text}. In simple words: ${lookup(part.text) ?? ""}`,
      lineId,
      termId: termIdFor(lineId, n),
    }));
}

function hasTerms(texts: readonly string[]): boolean {
  return texts.some((text) => splitTerms(text).some((part) => part.isTerm));
}

export function originalLines(sentences: readonly string[]): ReadLine[] {
  const lines: ReadLine[] = [];
  if (hasTerms(sentences)) lines.push({ text: TIP_TEXT, lineId: "tip" });
  sentences.forEach((sentence, i) => {
    const lineId = sentenceLineId(i);
    lines.push({ text: sentence, lineId }, ...meaningLines(sentence, lineId));
  });
  return lines;
}

export function checklistLines(list: Checklist): ReadLine[] {
  const lines: ReadLine[] = [{ text: "What you need to send." }];
  for (const { key, title } of SECTIONS) {
    if (list[key].length === 0) continue;
    lines.push({ text: `${title}.`, lineId: `sec-${key}` });
    list[key].forEach((item, i) => {
      const lineId = `${key}-${i}`;
      lines.push({ text: item, lineId }, ...meaningLines(item, lineId));
    });
  }
  return lines;
}
