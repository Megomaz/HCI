import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./style.css";

import { DEMO_CHECKLIST, ORIGINAL_SENTENCES, type Checklist } from "./content";
import { explainLive, simplifyLive } from "./live";
import { checklistLines, originalLines, type ReadLine } from "./reading";
import {
  READING_LABELS,
  checklistScreen,
  doneScreen,
  errorScreen,
  noticeHtml,
  originalScreen,
  pauseButtonContent,
  readingScreen,
  renewalScreen,
  simplifyingScreen,
  type ReadingStatus,
} from "./screens";
import { watchSelection } from "./selection";
import { createSheet } from "./sheet";
import {
  NO_SPEECH_MESSAGE,
  createReader,
  speechAvailable,
  stopSpeech,
  type Reader,
} from "./speech";

type Screen =
  | "renewal"
  | "simplifying"
  | "error"
  | "checklist"
  | "original"
  | "reading"
  | "done";

interface Reading {
  source: "checklist" | "original";
  /** Screen to go back to when the user is done listening to the original. */
  returnTo: Screen;
  status: ReadingStatus;
  lines: ReadLine[];
}

interface State {
  screen: Screen;
  simplifyAttempts: number;
  /** The text being simplified, one sentence per entry. */
  original: readonly string[];
  /** Live mode only: what the user typed into "Paste your own letter". */
  letter: string;
  checklist: Checklist;
  checked: Set<string>;
  reading: Reading | null;
}

// ---------- Modes ----------

const params = new URLSearchParams(location.search);

/** Live mode (?live=1) uses the real AI through /api. Everything else is demo mode. */
const liveMode = params.get("live") === "1";

/**
 * Demo mode: the first Simplify fails on purpose so the error state can be shown.
 * ?demoError=0 turns that off; in live mode it is off unless ?demoError=1 is given.
 */
const demoError =
  params.get("demoError") === null ? !liveMode : params.get("demoError") !== "0";

/** How long the "Simplifying" feedback state shows in demo mode. Not a time limit. */
const SIMPLIFY_MS = 2000;

const state: State = {
  screen: "renewal",
  simplifyAttempts: 0,
  original: ORIGINAL_SENTENCES,
  letter: "",
  checklist: DEMO_CHECKLIST,
  checked: new Set(),
  reading: null,
};

const screenEl = document.querySelector<HTMLElement>("#screen")!;
const announcerEl = document.querySelector<HTMLElement>("#announcer")!;
const pageTitleEl = document.querySelector<HTMLElement>("#page-title")!;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let reader: Reader | null = null;
/** Bumped on every screen change so a slow Simplify can't land on the wrong screen. */
let simplifyRun = 0;

// ---------- Rendering ----------

function render(): void {
  screenEl.dataset.screen = state.screen;
  switch (state.screen) {
    case "renewal":
      screenEl.innerHTML = renewalScreen(liveMode, state.letter);
      break;
    case "simplifying":
      screenEl.innerHTML = simplifyingScreen();
      break;
    case "error":
      screenEl.innerHTML = errorScreen(state.original);
      break;
    case "checklist":
      screenEl.innerHTML = checklistScreen(state.checklist, state.checked);
      break;
    case "original":
      screenEl.innerHTML = originalScreen(state.original);
      break;
    case "reading": {
      const reading = state.reading!;
      screenEl.innerHTML = readingScreen(
        reading.source,
        reading.status,
        state.checklist,
        state.checked,
        state.original,
        reading.lines.some((line) => line.lineId === "tip"),
      );
      break;
    }
    case "done":
      screenEl.innerHTML = doneScreen();
      break;
  }
}

function announce(message: string): void {
  announcerEl.textContent = "";
  if (message) window.setTimeout(() => (announcerEl.textContent = message), 50);
}

/** Show a plain-language message under the current screen's buttons. */
function notify(message: string): void {
  const actions = screenEl.querySelector(".actions");
  if (!actions) return;
  let notice = actions.querySelector<HTMLElement>(".notice");
  if (!notice) {
    notice = document.createElement("p");
    notice.className = "notice";
    notice.setAttribute("role", "status");
    actions.append(notice);
  }
  notice.innerHTML = noticeHtml(message);
  announce(message);
}

/** Change screen, then move focus to the new screen's heading. Leaving a screen stops speech. */
function go(screen: Screen): void {
  simplifyRun += 1;
  stopSpeech();
  reader = null;
  state.screen = screen;
  if (screen !== "reading") state.reading = null;
  render();
  window.scrollTo(0, 0);
  const target = screenEl.querySelector<HTMLElement>("[data-focus]") ?? pageTitleEl;
  target.focus({ preventScroll: true });
  announce(
    screen === "simplifying" ? "Making this easier to read. This takes a few seconds." : "",
  );
}

// ---------- Simplify ----------

function toSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  return (clean.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Live mode: use the pasted letter, if there is one, as the text to work on. */
function useLetterIfPasted(): void {
  const field = screenEl.querySelector<HTMLTextAreaElement>("#letter");
  if (!field) return;
  state.letter = field.value;
  const sentences = toSentences(field.value);
  state.original = sentences.length > 0 ? sentences : ORIGINAL_SENTENCES;
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function simplify(): Promise<void> {
  useLetterIfPasted();
  state.simplifyAttempts += 1;
  const failOnPurpose = demoError && state.simplifyAttempts === 1;

  go("simplifying");
  const run = simplifyRun;

  let result: Checklist | null = null;
  try {
    if (failOnPurpose || !liveMode) await wait(SIMPLIFY_MS);
    if (!failOnPurpose) {
      result = liveMode ? await simplifyLive(state.original.join(" ")) : DEMO_CHECKLIST;
    }
  } catch {
    result = null;
  }

  if (run !== simplifyRun) return; // the user has moved on
  if (!result) {
    go("error");
    return;
  }
  state.checklist = result;
  state.checked.clear();
  go("checklist");
}

// ---------- Read aloud ----------

function highlight(line: ReadLine | undefined): void {
  for (const el of screenEl.querySelectorAll(".speaking")) el.classList.remove("speaking");
  if (!line?.lineId) return;
  const lineEl = screenEl.querySelector<HTMLElement>(`[data-line="${line.lineId}"]`);
  const termEl = line.termId
    ? screenEl.querySelector<HTMLElement>(`[data-term-id="${line.termId}"]`)
    : null;
  lineEl?.classList.add("speaking");
  termEl?.classList.add("speaking");
  (termEl ?? lineEl)?.scrollIntoView({
    block: "nearest",
    behavior: reducedMotion.matches ? "auto" : "smooth",
  });
}

function setReadingStatus(status: ReadingStatus): void {
  const reading = state.reading;
  if (!reading) return;
  reading.status = status;
  // Update in place so keyboard focus stays where it is.
  screenEl.querySelector("#pause-button")!.innerHTML = pauseButtonContent(status);
  screenEl.querySelector("#reading-status")!.classList.toggle("stopped", status !== "playing");
  screenEl.querySelector("#reading-label")!.textContent = READING_LABELS[status];
  if (status === "finished" || status === "error") highlight(undefined);
}

function startReading(source: Reading["source"]): void {
  if (!speechAvailable()) {
    notify(NO_SPEECH_MESSAGE);
    return;
  }
  if (source === "original") useLetterIfPasted();

  const lines =
    source === "checklist" ? checklistLines(state.checklist) : originalLines(state.original);
  state.reading = { source, returnTo: state.screen, status: "playing", lines };
  go("reading");

  reader = createReader(
    lines.map((line) => line.text),
    {
      onLine: (index) => highlight(lines[index]),
      onFinish: () => setReadingStatus("finished"),
      onError: () => setReadingStatus("error"),
    },
  );
  // Still inside the tap that asked for it, which is what lets speech start on phones.
  reader.start();
}

function togglePause(): void {
  if (!state.reading || !reader) return;
  if (state.reading.status === "playing") {
    reader.pause();
    setReadingStatus("paused");
  } else {
    reader.resume();
    setReadingStatus("playing");
  }
}

function playAgain(): void {
  if (!reader) return;
  highlight(undefined);
  reader.start();
  setReadingStatus("playing");
}

function doneListening(): void {
  const reading = state.reading;
  if (!reading) return;
  go(reading.source === "checklist" ? "done" : reading.returnTo);
}

// ---------- Word meanings ----------

const sheet = createSheet({
  explain: liveMode ? (word) => explainLive(word, state.original.join(" ")) : undefined,
  onOpen: () => {
    // Opening a meaning while the page is being read aloud pauses the reading.
    if (state.reading?.status === "playing" && reader) {
      reader.interrupt();
      setReadingStatus("paused");
    }
  },
});

watchSelection(
  screenEl,
  (word) => sheet.open(word, null),
  () => sheet.isOpen(),
);

// ---------- Events ----------

const actions: Record<string, () => void> = {
  simplify: () => void simplify(),
  "read-original": () => startReading("original"),
  "read-checklist": () => startReading("checklist"),
  "see-original": () => go("original"),
  "back-to-simple": () => go("checklist"),
  "toggle-pause": togglePause,
  "play-again": playAgain,
  "done-listening": doneListening,
  "back-to-checklist": () => go("checklist"),
};

function toggleRow(row: HTMLElement, clickedBox: boolean): void {
  const box = row.querySelector<HTMLInputElement>("input[type=checkbox]")!;
  // A click on the box itself has already toggled it; anywhere else in the row toggles it here.
  if (!clickedBox) box.checked = !box.checked;
  const id = row.dataset.row!;
  if (box.checked) state.checked.add(id);
  else state.checked.delete(id);
  row.classList.toggle("checked", box.checked);
}

screenEl.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;

  const term = target.closest<HTMLElement>(".term");
  if (term) {
    sheet.open(term.dataset.term!, term);
    return;
  }

  const actionEl = target.closest<HTMLElement>("[data-action]");
  if (actionEl) {
    actions[actionEl.dataset.action!]?.();
    return;
  }

  const row = target.closest<HTMLElement>("[data-row]");
  if (row) toggleRow(row, target instanceof HTMLInputElement);
});

render();
