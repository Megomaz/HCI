/** Why a letter could not be loaded. Each kind has a plain-language message that says what to do next. */
export type LoadErrorKind =
  | "photo"
  | "scan"
  | "empty"
  | "type"
  | "big"
  | "long"
  | "open"
  | "offline"
  | "ai";

export class LoadError extends Error {
  constructor(public readonly kind: LoadErrorKind) {
    super(kind);
  }
}

export const ERROR_MESSAGES: Record<LoadErrorKind, string> = {
  photo:
    "We couldn't read the words in this photo. Try a clearer photo in good light, or use the sample letter.",
  scan: "We couldn't find any words in this PDF. Try taking a photo of the letter instead, or use the sample letter.",
  empty: "This file has no words in it. Try a different file, or use the sample letter.",
  type: "We can't read this kind of file. Choose a PDF, a photo, a Word file or a text file, or use the sample letter.",
  big: "This file is too big. Try a smaller file or a photo of one page, or use the sample letter.",
  long: "This letter is too long for this prototype. Try one page at a time, or use the sample letter.",
  open: "We couldn't open this file. Try a different file, or use the sample letter.",
  offline:
    "You are not connected to the internet. Check your connection and try again, or use the sample letter.",
  ai: "We couldn't make this letter easier to read right now. Your letter is still here. Try again, or use the sample letter.",
};

export function messageFor(error: unknown): string {
  return ERROR_MESSAGES[error instanceof LoadError ? error.kind : "ai"];
}
