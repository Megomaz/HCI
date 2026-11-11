import { lookup } from "./glossary";
import { icon } from "./icons";
import { NO_SPEECH_MESSAGE, speakOnce, speechAvailable, stopSpeech } from "./speech";

const UNKNOWN_MESSAGE = "We don't have a simple meaning for this word yet.";
const LOOKING_MESSAGE = "Finding a simple meaning…";

export interface SheetOptions {
  /** Live mode only: ask the AI about a word that is not in the glossary. */
  explain?: (word: string) => Promise<string>;
  /** Called just before the sheet opens (used to pause the checklist reading). */
  onOpen?: () => void;
}

export interface Sheet {
  open(word: string, opener: HTMLElement | null): void;
  isOpen(): boolean;
}

/**
 * Word-meaning bottom sheet. A native modal <dialog>, so the browser keeps Tab
 * inside it, makes the page behind it inert, and closes it on Esc.
 */
export function createSheet(options: SheetOptions = {}): Sheet {
  const dialog = document.createElement("dialog");
  dialog.className = "sheet";
  dialog.id = "word-sheet";
  dialog.setAttribute("aria-labelledby", "sheet-word");
  dialog.setAttribute("aria-describedby", "sheet-meaning");
  dialog.innerHTML = `
    <div class="sheet-body">
      <h2 class="sheet-word" id="sheet-word" tabindex="-1"></h2>
      <p class="sheet-meaning" id="sheet-meaning" aria-live="polite"></p>
      <p class="notice" id="sheet-notice" role="status" hidden></p>
      <div class="actions">
        <button type="button" class="btn btn-primary" id="sheet-read">${icon("speaker")}<span>Read meaning aloud</span></button>
        <button type="button" class="btn btn-secondary" id="sheet-close">${icon("close")}<span>Close</span></button>
      </div>
    </div>`;
  document.body.append(dialog);

  const wordEl = dialog.querySelector<HTMLElement>("#sheet-word")!;
  const meaningEl = dialog.querySelector<HTMLElement>("#sheet-meaning")!;
  const noticeEl = dialog.querySelector<HTMLElement>("#sheet-notice")!;
  const readButton = dialog.querySelector<HTMLButtonElement>("#sheet-read")!;
  const closeButton = dialog.querySelector<HTMLButtonElement>("#sheet-close")!;

  let returnFocusTo: HTMLElement | null = null;
  let spokenText = "";
  let lookupRun = 0;
  let needsCleanup = false;

  function showMeaning(word: string, meaning: string | undefined): void {
    meaningEl.textContent = meaning ?? UNKNOWN_MESSAGE;
    spokenText = meaning ? `${word}. ${meaning}` : "";
    readButton.hidden = !meaning;
  }

  function showNotice(message: string): void {
    noticeEl.textContent = message;
    noticeEl.hidden = false;
  }

  readButton.addEventListener("click", () => {
    if (!spokenText) return;
    if (!speechAvailable()) {
      showNotice(NO_SPEECH_MESSAGE);
      return;
    }
    noticeEl.hidden = true;
    speakOnce(spokenText, () => showNotice(NO_SPEECH_MESSAGE));
  });

  /** Runs once per closing: stop any speech and put focus back on the word that opened the sheet. */
  function afterClose(): void {
    if (!needsCleanup) return;
    needsCleanup = false;
    lookupRun += 1;
    stopSpeech();
    const target = returnFocusTo;
    returnFocusTo = null;
    if (target && document.contains(target)) target.focus();
  }

  function closeSheet(): void {
    if (dialog.open) dialog.close();
    afterClose();
  }

  closeButton.addEventListener("click", closeSheet);

  // A tap on the dimmed page behind the sheet also closes it.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeSheet();
  });

  // Esc
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSheet();
  });

  // Safety net for any other way the browser closes a dialog.
  dialog.addEventListener("close", afterClose);

  return {
    isOpen: () => dialog.open,

    open(word, opener) {
      if (dialog.open) return;
      options.onOpen?.();

      const active = document.activeElement;
      returnFocusTo =
        opener ?? (active instanceof HTMLElement && active !== document.body ? active : null);

      wordEl.textContent = word;
      noticeEl.hidden = true;
      const meaning = lookup(word);

      if (meaning || !options.explain) {
        showMeaning(word, meaning);
      } else {
        const run = ++lookupRun;
        meaningEl.textContent = LOOKING_MESSAGE;
        spokenText = "";
        readButton.hidden = true;
        options.explain(word).then(
          (answer) => {
            if (run === lookupRun) showMeaning(word, answer);
          },
          () => {
            if (run === lookupRun) showMeaning(word, undefined);
          },
        );
      }

      needsCleanup = true;
      dialog.showModal();
      wordEl.focus();
    },
  };
}
