import {
  SAMPLE_CHECKLIST,
  SAMPLE_SENTENCES,
  SAMPLE_SIMPLE_VERSION,
  type Checklist,
} from "./content";
import { SAMPLE_WORDS, type DifficultWord } from "./glossary";

/** Everything the four steps need. Kept in memory only; never saved or sent anywhere else. */
export interface Letter {
  isSample: boolean;
  /** The original text: paragraphs, each a list of sentences. */
  paragraphs: string[][];
  words: readonly DifficultWord[];
  simple: readonly string[];
  checklist: Checklist;
}

/** What /api/simplify returns for an uploaded letter. */
export interface AiResult {
  difficultWords: DifficultWord[];
  simpleVersion: string[];
  checklist: Checklist;
}

export function sampleLetter(): Letter {
  return {
    isSample: true,
    paragraphs: [[...SAMPLE_SENTENCES]],
    words: SAMPLE_WORDS,
    simple: SAMPLE_SIMPLE_VERSION,
    checklist: SAMPLE_CHECKLIST,
  };
}

export function letterFromAi(text: string, result: AiResult): Letter {
  return {
    isSample: false,
    paragraphs: toParagraphs(text),
    words: result.difficultWords,
    simple: result.simpleVersion,
    checklist: result.checklist,
  };
}

export function allSentences(letter: Letter): string[] {
  return letter.paragraphs.flat();
}

// ---------- Turning raw extracted text into paragraphs and sentences ----------

/** Shorter lines than this are treated as their own line (addresses, headings, sign-offs). */
const SHORT_LINE = 40;

/** A line that ends a sentence and is shorter than this share of the longest line ends a paragraph. */
const LAST_LINE_RATIO = 0.85;

const ABBREVIATIONS = /(?:^|\s)(?:mr|mrs|ms|dr|prof|st|co|no|tel|ref|e\.g|i\.e|etc|vs)\.$/i;

function toSentences(block: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  const ender = /[.!?]+["')\]]*\s+/g;
  for (let match = ender.exec(block); match; match = ender.exec(block)) {
    const end = match.index + match[0].length;
    const next = block[end];
    const soFar = block.slice(start, match.index + 1);
    // Only break before a capital letter, digit or quote, and never after "Mr." and friends.
    if (!next || !/[\p{Lu}\p{N}"'(]/u.test(next) || ABBREVIATIONS.test(soFar)) continue;
    sentences.push(block.slice(start, end).trim());
    start = end;
  }
  const rest = block.slice(start).trim();
  if (rest) sentences.push(rest);
  return sentences;
}

export function toParagraphs(text: string): string[][] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim());

  const longest = Math.max(0, ...lines.map((line) => line.length));

  const blocks: string[] = [];
  let current = "";
  const flush = () => {
    if (current) blocks.push(current);
    current = "";
  };

  for (const line of lines) {
    if (!line) {
      flush();
      continue;
    }
    if (current.endsWith("-") && /^\p{Ll}/u.test(line)) {
      current = current.slice(0, -1) + line; // word split across two lines
    } else {
      current = current ? `${current} ${line}` : line;
    }
    // A paragraph ends at a short line (address, heading, sign-off), or where a
    // sentence ends well before the right-hand edge of the text.
    const endsSentence = /[.!?]["')\]]*$/.test(line);
    if (line.length < SHORT_LINE && !/[,;:-]$/.test(line)) flush();
    else if (endsSentence && line.length < longest * LAST_LINE_RATIO) flush();
  }
  flush();

  return blocks.map(toSentences).filter((paragraph) => paragraph.length > 0);
}

/** The cleaned-up letter as plain text: what is sent to the AI. */
export function plainText(paragraphs: string[][]): string {
  return paragraphs.map((paragraph) => paragraph.join(" ")).join("\n\n");
}
