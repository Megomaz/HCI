import { LoadError } from "./errors";

/**
 * Reads the words out of an uploaded letter, entirely in the browser.
 * The file never leaves the device; only the extracted text is later sent for simplifying.
 * Each reader is loaded on demand, so the sample-letter path stays small and works offline.
 */

const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Same limit as the serverless function. Longer letters are rejected, never cut short. */
export const MAX_LETTER_LENGTH = 8000;

/** A photo with fewer letters than this, or lower OCR confidence, counts as unreadable. */
const MIN_LETTERS = 40;
const MIN_OCR_CONFIDENCE = 45;
/** Phone photos are scaled down to this before OCR: faster, and just as readable. */
const MAX_PHOTO_SIDE = 2200;

/** In a PDF, a jump of more than this many line-heights between lines starts a new paragraph. */
const PARAGRAPH_GAP = 1.8;

/** In a photo, a gap between lines taller than this many line-heights starts a new paragraph. */
const PHOTO_PARAGRAPH_GAP = 1.0;

type Kind = "pdf" | "image" | "docx" | "txt";

function kindOf(file: File): Kind | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.type.startsWith("image/")) return "image";
  if (
    name.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (file.type === "text/plain" || name.endsWith(".txt")) return "txt";
  return null;
}

const countLetters = (text: string) => (text.match(/\p{L}/gu) ?? []).length;

async function readPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      // Rebuild lines from each piece's position, and leave a blank line wherever
      // the gap to the next line is clearly bigger than normal: a new paragraph.
      let text = "";
      let lineY: number | null = null;
      let lineHeight = 0;
      for (const item of content.items) {
        if (!("str" in item) || item.str === "") continue;
        const y = item.transform[5] as number;
        const height = item.height || lineHeight || 12;
        if (lineY !== null && Math.abs(y - lineY) > height * 0.5) {
          text += Math.abs(y - lineY) > Math.max(height, lineHeight) * PARAGRAPH_GAP ? "\n\n" : "\n";
        }
        text += item.str;
        lineY = y;
        lineHeight = height;
      }
      pages.push(text);
    }
    return pages.join("\n\n");
  } finally {
    await task.destroy();
  }
}

async function readPhoto(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new LoadError("open");
  }
  const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const { createWorker } = await import("tesseract.js");
  // OCR engine files are served from this site (see scripts/copy-ocr-assets.mjs).
  const base = new URL("ocr", document.baseURI).href;
  const worker = await createWorker("eng", 1, {
    workerPath: `${base}/worker.min.js`,
    corePath: base,
    langPath: base,
  });
  try {
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    if (countLetters(data.text) < MIN_LETTERS || data.confidence < MIN_OCR_CONFIDENCE) {
      throw new LoadError("photo");
    }
    // Rebuild the text line by line, leaving a blank line wherever the gap between
    // two lines is clearly bigger than normal: a new paragraph.
    const lines = (data.blocks ?? []).flatMap((block) =>
      block.paragraphs.flatMap((paragraph) => paragraph.lines),
    );
    let text = "";
    let previous: (typeof lines)[number] | null = null;
    for (const line of lines) {
      const words = line.text.trim();
      if (!words) continue;
      if (previous) {
        const height = previous.bbox.y1 - previous.bbox.y0;
        const gap = line.bbox.y0 - previous.bbox.y1;
        text += gap > height * PHOTO_PARAGRAPH_GAP ? "\n\n" : "\n";
      }
      text += words;
      previous = line;
    }
    return text || data.text;
  } finally {
    await worker.terminate();
  }
}

async function readDocx(file: File): Promise<string> {
  const { default: mammoth } = await import("mammoth/mammoth.browser.min.js");
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

export async function extractText(file: File): Promise<string> {
  const kind = kindOf(file);
  if (!kind) throw new LoadError("type");
  if (file.size > MAX_FILE_BYTES) throw new LoadError("big");
  if (file.size === 0) throw new LoadError("empty");

  let text: string;
  try {
    if (kind === "pdf") text = await readPdf(file);
    else if (kind === "image") text = await readPhoto(file);
    else if (kind === "docx") text = await readDocx(file);
    else text = await file.text();
  } catch (error) {
    if (error instanceof LoadError) throw error;
    // The reader itself could not be downloaded, or the file is damaged.
    throw new LoadError(navigator.onLine === false ? "offline" : "open");
  }

  text = text.trim();
  if (countLetters(text) === 0) throw new LoadError(kind === "pdf" ? "scan" : "empty");
  if (text.length > MAX_LETTER_LENGTH) throw new LoadError("long");
  return text;
}
