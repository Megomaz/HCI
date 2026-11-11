/**
 * Optional second way to ask for a word's meaning: highlight (select) it.
 * Tapping an underlined word does the same thing, so nobody has to select text.
 */

const MAX_WORDS = 3;
const MAX_LENGTH = 40;
/** Wait for the selection to settle (long-press, then dragging the handles). */
const SETTLE_MS = 600;

export function watchSelection(
  root: HTMLElement,
  onWord: (word: string) => void,
  isBlocked: () => boolean,
): void {
  let pointerDown = false;
  let timer: number | undefined;

  const check = () => {
    if (pointerDown || isBlocked()) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;

    const text = selection
      .toString()
      .replace(/\s+/g, " ")
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (!text || text.length > MAX_LENGTH || text.split(" ").length > MAX_WORDS) return;

    // Selecting part of an underlined phrase means the whole phrase.
    const start = range.startContainer;
    const startEl = start instanceof Element ? start : start.parentElement;
    const term = startEl?.closest<HTMLElement>(".term")?.dataset.term;

    selection.removeAllRanges();
    onWord(term ?? text);
  };

  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(check, SETTLE_MS);
  };

  document.addEventListener("selectionchange", schedule);
  document.addEventListener("pointerdown", () => {
    pointerDown = true;
  });
  for (const type of ["pointerup", "pointercancel"] as const) {
    document.addEventListener(type, () => {
      pointerDown = false;
      schedule();
    });
  }
}
