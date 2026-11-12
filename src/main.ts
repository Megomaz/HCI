import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./style.css";

import { analyseLetter } from "./ai";
import { STEP_NAMES } from "./content";
import { LoadError, messageFor } from "./errors";
import { extractText } from "./extract";
import { findWord } from "./glossary";
import { letterFromAi, plainText, sampleLetter, toParagraphs, type Letter } from "./letter";
import { checklistLines, letterLines, simpleLines, type ReadLine } from "./reading";
import {
  READING_LABELS,
  checklistScreen,
  doneScreen,
  loadingScreen,
  noticeHtml,
  pauseButtonContent,
  simpleScreen,
  stepHeader,
  uploadErrorScreen,
  uploadScreen,
  wordsScreen,
  type ReadingStatus,
  type Step,
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

/** Where a letter comes from. Kept so "Try again" can repeat the right thing. */
type Source = { kind: "sample" } | { kind: "file"; file: File } | { kind: "text"; text: string };

type Upload =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string; retry: Source | "choose" };

interface State {
  step: Step;
  /** The letter being worked on. In memory only: never saved, gone on reload. */
  letter: Letter | null;
  upload: Upload;
  attempts: number;
  /** Step 3: showing the original letter instead of the simple version. */
  showOriginal: boolean;
  /** Step 4: showing the "you have everything" confirmation. */
  done: boolean;
  explainWords: boolean;
  checked: Set<string>;
  reading: { status: ReadingStatus; lines: ReadLine[] } | null;
}

/** ?demoError=1 makes the first attempt to load a letter fail on purpose, for the video. */
const demoError = new URLSearchParams(location.search).get("demoError") === "1";

/** How long "Reading your letter…" shows for the sample letter. Not a time limit. */
const SAMPLE_MS = 1500;

const state: State = {
  step: 1,
  letter: null,
  upload: { status: "idle" },
  attempts: 0,
  showOriginal: false,
  done: false,
  explainWords: true,
  checked: new Set(),
  reading: null,
};

const headerEl = document.querySelector<HTMLElement>("#header")!;
const screenEl = document.querySelector<HTMLElement>("#screen")!;
const announcerEl = document.querySelector<HTMLElement>("#announcer")!;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let reader: Reader | null = null;
/** Bumped whenever loading is started or abandoned, so a slow result can't land later. */
let loadRun = 0;

// ---------- Rendering ----------

function screenHtml(): string {
  const reading = state.reading?.status ?? null;
  if (state.step === 1 || !state.letter) {
    if (state.upload.status === "loading") return loadingScreen();
    if (state.upload.status === "error") return uploadErrorScreen(state.upload.message);
    return uploadScreen(state.letter !== null);
  }
  if (state.step === 2) return wordsScreen(state.letter, reading, state.explainWords);
  if (state.step === 3) {
    return simpleScreen(state.letter, state.showOriginal, reading, state.explainWords);
  }
  if (state.done) return doneScreen();
  return checklistScreen(state.letter, state.checked, reading, state.explainWords);
}

type FocusTarget = "heading" | "sub-heading" | string;

/** Draw the current state, then put keyboard focus somewhere sensible. */
function render(focus: FocusTarget): void {
  headerEl.innerHTML = stepHeader(state.step);
  screenEl.innerHTML = screenHtml();
  document.title = `Step ${state.step} of 4: ${STEP_NAMES[state.step - 1]} – Translate`;

  const target =
    focus === "heading"
      ? headerEl.querySelector<HTMLElement>("#page-title")
      : focus === "sub-heading"
        ? screenEl.querySelector<HTMLElement>("[data-focus]")
        : screenEl.querySelector<HTMLElement>(focus);
  (target ?? headerEl.querySelector<HTMLElement>("#page-title"))?.focus({ preventScroll: true });
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

function stopReading(): void {
  stopSpeech();
  reader = null;
  state.reading = null;
}

/** Go to a step and move focus to its heading. Leaving a step stops any speech. */
function go(step: Step): void {
  if (step > 1 && !state.letter) step = 1;
  loadRun += 1;
  stopReading();
  state.step = step;
  state.showOriginal = false;
  state.done = false;
  if (state.upload.status === "loading") state.upload = { status: "idle" };
  render("heading");
  window.scrollTo(0, 0);
  announce("");
}

// ---------- Step 1: loading a letter ----------

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function buildLetter(source: Source, failOnPurpose: boolean): Promise<Letter> {
  if (source.kind === "sample") {
    await wait(SAMPLE_MS);
    if (failOnPurpose) throw new LoadError("ai");
    return sampleLetter();
  }
  // Clean the text up once, so what is shown in Step 2 is exactly what the AI was given.
  const raw = source.kind === "file" ? await extractText(source.file) : source.text;
  const text = plainText(toParagraphs(raw));
  try {
    if (failOnPurpose) {
      await wait(SAMPLE_MS);
      throw new LoadError("ai");
    }
    return letterFromAi(text, await analyseLetter(text));
  } catch (error) {
    // The words were read fine, so "Try again" should not need the file to be read again.
    throw Object.assign(error instanceof LoadError ? error : new LoadError("ai"), { text });
  }
}

async function load(source: Source): Promise<void> {
  state.attempts += 1;
  const failOnPurpose = demoError && state.attempts === 1;

  stopReading();
  state.step = 1;
  state.upload = { status: "loading" };
  const run = ++loadRun;
  render("sub-heading");
  window.scrollTo(0, 0);
  announce("Reading your letter. This can take a little while.");

  try {
    const letter = await buildLetter(source, failOnPurpose);
    if (run !== loadRun) return; // the user stopped or moved on
    state.letter = letter;
    state.checked.clear();
    state.upload = { status: "idle" };
    go(2);
  } catch (error) {
    if (run !== loadRun) return;
    const text = (error as { text?: string }).text;
    // If the words were read but simplifying failed, retry with the same words.
    // If the file itself was the problem, "Try again" asks for another file.
    const retry: Source | "choose" =
      source.kind === "sample" ? source : text ? { kind: "text", text } : "choose";
    state.upload = { status: "error", message: messageFor(error), retry };
    render("sub-heading");
    announce("");
  }
}

function chooseFile(): void {
  screenEl.querySelector<HTMLInputElement>("#file-input")?.click();
}

function tryAgain(): void {
  if (state.upload.status !== "error") return;
  const { retry } = state.upload;
  if (retry === "choose") chooseFile();
  else void load(retry);
}

function stopLoading(): void {
  loadRun += 1;
  state.upload = { status: "idle" };
  render("heading");
  announce("");
}

function startAgain(): void {
  state.letter = null;
  state.checked.clear();
  state.upload = { status: "idle" };
  go(1);
}

// ---------- Read aloud ----------

const READ_BUTTON = '[data-action="read-aloud"]';

/**
 * Whether the page should scroll to keep up with the line being read.
 * It follows only while the reader has the spoken line fully in view. Once they
 * scroll away (down to the buttons, say), the page stays exactly where they put
 * it; scrolling back to the highlighted line picks the following up again.
 */
let followReading = true;

function isFullyOnScreen(el: Element): boolean {
  const box = el.getBoundingClientRect();
  const slack = 2;
  if (box.height > window.innerHeight) return box.top >= -slack && box.top < window.innerHeight;
  return box.top >= -slack && box.bottom <= window.innerHeight + slack;
}

function highlight(line: ReadLine | undefined): void {
  const outgoing = [...screenEl.querySelectorAll(".speaking")];
  if (outgoing.length > 0) followReading = outgoing.some(isFullyOnScreen);
  for (const el of outgoing) el.classList.remove("speaking");
  if (!line?.lineId) return;

  const lineEl = screenEl.querySelector<HTMLElement>(`[data-line="${line.lineId}"]`);
  const termEl = line.termId
    ? screenEl.querySelector<HTMLElement>(`[data-term-id="${line.termId}"]`)
    : null;
  lineEl?.classList.add("speaking");
  termEl?.classList.add("speaking");
  if (followReading) {
    (termEl ?? lineEl)?.scrollIntoView({
      block: "nearest",
      behavior: reducedMotion.matches ? "auto" : "smooth",
    });
  }
}

function setReadingStatus(status: ReadingStatus): void {
  if (!state.reading) return;
  state.reading.status = status;
  // Update in place so keyboard focus stays where it is.
  screenEl.querySelector("#pause-button")!.innerHTML = pauseButtonContent(status);
  screenEl.querySelector("#reading-status")!.classList.toggle("stopped", status !== "playing");
  screenEl.querySelector("#reading-label")!.textContent = READING_LABELS[status];
  if (status === "finished" || status === "error") highlight(undefined);
}

function startReading(): void {
  const letter = state.letter;
  if (!letter) return;
  if (!speechAvailable()) {
    notify(NO_SPEECH_MESSAGE);
    return;
  }

  const lines =
    state.step === 2
      ? letterLines(letter, state.explainWords)
      : state.step === 3
        ? simpleLines(letter, state.explainWords)
        : checklistLines(letter, state.explainWords);

  state.reading = { status: "playing", lines };
  render("#pause-button");
  window.scrollTo(0, 0);
  followReading = true;

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

/** Reading is about to start again from the top: follow it only if the top is in view. */
function prepareRestart(): void {
  highlight(undefined);
  const first = state.reading?.lines.find((line) => line.lineId);
  const firstEl = first ? screenEl.querySelector(`[data-line="${first.lineId}"]`) : null;
  followReading = firstEl ? isFullyOnScreen(firstEl) : false;
}

function togglePause(): void {
  if (!state.reading || !reader) return;
  if (state.reading.status === "playing") {
    reader.pause();
    setReadingStatus("paused");
  } else {
    if (state.reading.status === "finished") prepareRestart();
    reader.resume();
    setReadingStatus("playing");
  }
}

function playAgain(): void {
  if (!reader) return;
  prepareRestart();
  reader.start();
  setReadingStatus("playing");
}

function doneListening(): void {
  stopReading();
  if (state.step === 4) {
    state.done = true;
    render("sub-heading");
  } else {
    render(READ_BUTTON);
  }
  window.scrollTo(0, 0);
}

// ---------- Word meanings ----------

const sheet = createSheet({
  lookup: (word) => (state.letter ? findWord(state.letter.words, word) : undefined),
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
  () => sheet.isOpen() || state.step === 1,
);

// ---------- Events ----------

const actions: Record<string, () => void> = {
  "choose-letter": chooseFile,
  "use-sample": () => void load({ kind: "sample" }),
  "try-again": tryAgain,
  "stop-loading": stopLoading,
  "go-1": () => go(1),
  "go-2": () => go(2),
  "go-3": () => go(3),
  "go-4": () => go(4),
  "toggle-original": () => {
    state.showOriginal = !state.showOriginal;
    render('[data-action="toggle-original"]');
    window.scrollTo(0, 0);
  },
  "read-aloud": startReading,
  "toggle-pause": togglePause,
  "play-again": playAgain,
  "done-listening": doneListening,
  "back-to-checklist": () => {
    state.done = false;
    render("heading");
  },
  "start-again": startAgain,
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

screenEl.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.id === "explain-words") {
    state.explainWords = target.checked;
  } else if (target.id === "file-input") {
    const file = target.files?.[0];
    target.value = ""; // so choosing the same file again still counts as a change
    if (file) void load({ kind: "file", file });
  }
});

headerEl.innerHTML = stepHeader(state.step);
screenEl.innerHTML = screenHtml();
