import { SECTIONS, STEP_NAMES } from "./content";
import { hasTerms, splitTerms, type DifficultWord } from "./glossary";
import { icon, type IconName } from "./icons";
import type { Letter } from "./letter";
import { TIP_TEXT, sentenceLineId, simpleLineId, termIdFor } from "./reading";

export type Step = 1 | 2 | 3 | 4;

export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Text with each difficult word turned into a real button inside the sentence,
 * so Tab reaches it in reading order and Enter, Space or a tap opens the meaning.
 */
function rich(text: string, lineId: string, words: readonly DifficultWord[]): string {
  let n = 0;
  return splitTerms(text, words)
    .map((part) => {
      if (!part.word) return esc(part.text);
      const shown = esc(part.text);
      return `<button type="button" class="term" data-term="${esc(part.word.term)}" data-term-id="${termIdFor(lineId, n++)}" aria-label="${shown}, show meaning"><span>${shown}</span></button>`;
    })
    .join("");
}

type ButtonStyle = "primary" | "secondary" | "link";

function button(action: string, label: string, iconName: IconName, style: ButtonStyle): string {
  return `<button type="button" class="btn btn-${style}" data-action="${action}">${icon(iconName)}<span>${esc(label)}</span></button>`;
}

function subHeading(text: string): string {
  return `<h2 class="screen-heading" tabindex="-1" data-focus>${esc(text)}</h2>`;
}

function tip(): string {
  return `<p class="tip" id="tip" data-line="tip">${icon("info")}<span>${esc(TIP_TEXT)}</span></p>`;
}

// ---------- Header (same on every step) ----------

export function stepHeader(step: Step): string {
  const segments = [1, 2, 3, 4]
    .map((n) => `<span${n <= step ? ' class="on"' : ""}></span>`)
    .join("");
  return `
    <div class="segments" aria-hidden="true">${segments}</div>
    <h1 id="page-title" tabindex="-1">
      <span class="step-count">Step ${step} of 4:</span>
      <span class="step-name">${esc(STEP_NAMES[step - 1])}</span>
    </h1>`;
}

// ---------- Read aloud pieces shared by Steps 2, 3 and 4 ----------

export type ReadingStatus = "playing" | "paused" | "finished" | "error";

export const READING_LABELS: Record<ReadingStatus, string> = {
  playing: "Reading aloud…",
  paused: "Paused",
  finished: "Finished reading",
  error: "Read aloud isn't available on this browser",
};

export function pauseButtonContent(status: ReadingStatus): string {
  return status === "playing"
    ? `${icon("pause")}<span>Pause</span>`
    : `${icon("play")}<span>Play</span>`;
}

function readingStatus(status: ReadingStatus | null): string {
  if (!status) return "";
  return `
    <p class="reading-status${status === "playing" ? "" : " stopped"}" id="reading-status">
      <span class="sound-bar" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
      <span id="reading-label" aria-live="polite">${esc(READING_LABELS[status])}</span>
    </p>`;
}

function readingControls(status: ReadingStatus): string {
  return `
    <div class="actions">
      <button type="button" class="btn btn-primary" data-action="toggle-pause" id="pause-button">${pauseButtonContent(status)}</button>
      ${button("play-again", "Play again", "replay", "secondary")}
      ${button("done-listening", "Done listening", "check", "secondary")}
    </div>`;
}

function explainToggle(show: boolean, on: boolean): string {
  if (!show) return "";
  return `
    <label class="option-row" for="explain-words">
      <input type="checkbox" id="explain-words"${on ? " checked" : ""} />
      <span>Explain words while reading</span>
    </label>`;
}

// ---------- Text blocks ----------

function originalText(letter: Letter): string {
  let index = 0;
  const paragraphs = letter.paragraphs
    .map((sentences) => {
      const spans = sentences
        .map((sentence) => {
          const lineId = sentenceLineId(index++);
          return `<span class="sentence" data-line="${lineId}">${rich(sentence, lineId, letter.words)}</span>`;
        })
        .join(" ");
      return `<p>${spans}</p>`;
    })
    .join("");
  return `<div class="soft-box letter-text" role="group" aria-label="Your letter" aria-describedby="tip">${paragraphs}</div>`;
}

function simpleText(letter: Letter): string {
  const lines = letter.simple
    .map((sentence, i) => {
      const lineId = simpleLineId(i);
      return `<p><span class="sentence" data-line="${lineId}">${rich(sentence, lineId, letter.words)}</span></p>`;
    })
    .join("");
  return `<div class="soft-box letter-text simple-text" role="group" aria-label="Simple version of your letter" aria-describedby="tip">${lines}</div>`;
}

function checklist(letter: Letter, checked: ReadonlySet<string>): string {
  const sections = SECTIONS.filter(({ key }) => letter.checklist[key].length > 0)
    .map(({ key, title }) => {
      const rows = letter.checklist[key]
        .map((text, i) => {
          const id = `${key}-${i}`;
          const isChecked = checked.has(id);
          return `<li class="check-row${isChecked ? " checked" : ""}" data-row="${id}" data-line="${id}">
            <input type="checkbox" id="cb-${id}" aria-label="${esc(text)}"${isChecked ? " checked" : ""} />
            <span class="check-text">${rich(text, id, letter.words)}</span>
          </li>`;
        })
        .join("");
      return `<section class="check-section" aria-labelledby="sec-${key}">
        <h2 class="section-title" id="sec-${key}"><span data-line="sec-${key}">${esc(title)}</span></h2>
        <ul class="check-list">${rows}</ul>
      </section>`;
    })
    .join("");
  return sections || `<p class="soft-box">This letter does not ask you to send anything.</p>`;
}

// ---------- Step 1: Upload your letter ----------

export const FILE_ACCEPT = "application/pdf,image/*,.txt,.docx";

export function uploadScreen(hasLetter: boolean): string {
  return `
    <p class="lead">Take a photo of your letter, or choose a file. We will help you understand it.</p>
    <p class="tip">${icon("info")}<span>This is a prototype. Use the sample letter, or a letter with your personal details removed.</span></p>
    <input type="file" id="file-input" accept="${FILE_ACCEPT}" hidden />
    <div class="actions">
      ${hasLetter ? button("go-2", "Next: understand the words", "next", "primary") : ""}
      ${button("choose-letter", "Choose a letter", "upload", hasLetter ? "secondary" : "primary")}
      ${button("use-sample", "Use the sample letter", "document", "secondary")}
    </div>`;
}

export function loadingScreen(): string {
  return `
    <div class="card status-card">
      ${subHeading("Reading your letter…")}
      <div class="loader" aria-hidden="true"><span></span></div>
      <p>This can take a little while, especially for a photo.</p>
      <div class="actions">
        ${button("stop-loading", "Stop and go back", "close", "secondary")}
      </div>
    </div>`;
}

export function uploadErrorScreen(message: string): string {
  return `
    <div class="card error-card" role="alert">
      <div class="error-title">
        ${icon("warning", 28)}
        ${subHeading("Sorry, that didn't work")}
      </div>
      <p>${esc(message)}</p>
      <input type="file" id="file-input" accept="${FILE_ACCEPT}" hidden />
      <div class="actions">
        ${button("try-again", "Try again", "retry", "primary")}
        ${button("use-sample", "Use the sample letter", "document", "secondary")}
      </div>
    </div>`;
}

// ---------- Step 2: Understand the words ----------

export function wordsScreen(letter: Letter, reading: ReadingStatus | null, explain: boolean): string {
  const anyWords = hasTerms(letter.paragraphs.flat(), letter.words);
  const actions = reading
    ? readingControls(reading)
    : `<div class="actions">
        ${button("read-aloud", "Read the letter aloud", "speaker", "secondary")}
        ${explainToggle(anyWords, explain)}
        ${button("go-3", "Next: simple version", "next", "primary")}
        ${button("go-4", "Skip to checklist", "skip", "secondary")}
        ${button("go-1", "Back: upload your letter", "back", "link")}
      </div>`;
  return `
    ${readingStatus(reading)}
    ${tip()}
    ${originalText(letter)}
    ${actions}`;
}

// ---------- Step 3: Simple version ----------

export function simpleScreen(
  letter: Letter,
  showOriginal: boolean,
  reading: ReadingStatus | null,
  explain: boolean,
): string {
  if (showOriginal) {
    return `
      ${tip()}
      <h2 class="screen-heading">The original letter</h2>
      ${originalText(letter)}
      <div class="actions">
        ${button("toggle-original", "Back to simple version", "back", "secondary")}
        ${button("go-4", "Next: checklist", "next", "primary")}
        ${button("go-2", "Back: understand the words", "back", "link")}
      </div>`;
  }
  const anyWords = hasTerms(letter.simple, letter.words);
  const actions = reading
    ? readingControls(reading)
    : `<div class="actions">
        ${button("read-aloud", "Read simple version aloud", "speaker", "secondary")}
        ${explainToggle(anyWords, explain)}
        ${button("go-4", "Next: checklist", "next", "primary")}
        ${button("toggle-original", "See the original letter", "document", "secondary")}
        ${button("go-2", "Back: understand the words", "back", "link")}
      </div>`;
  return `
    ${readingStatus(reading)}
    ${tip()}
    ${simpleText(letter)}
    <p class="small-note">Not sure? Check it against the original letter.</p>
    ${actions}`;
}

// ---------- Step 4: Your checklist ----------

export function checklistScreen(
  letter: Letter,
  checked: ReadonlySet<string>,
  reading: ReadingStatus | null,
  explain: boolean,
): string {
  const items = SECTIONS.flatMap(({ key }) => letter.checklist[key]);
  const actions = reading
    ? readingControls(reading)
    : `<div class="actions">
        ${items.length > 0 ? button("read-aloud", "Read checklist aloud", "speaker", "primary") : ""}
        ${explainToggle(hasTerms(items, letter.words), explain)}
        ${button("start-again", "Start again with another letter", "retry", "secondary")}
        ${button("go-3", "Back: simple version", "back", "link")}
      </div>`;
  return `
    ${readingStatus(reading)}
    ${checklist(letter, checked)}
    ${actions}`;
}

export function doneScreen(): string {
  return `
    <div class="card done-card">
      <span class="done-icon">${icon("check", 32)}</span>
      ${subHeading("You have everything you need to know.")}
      <p>Gather these documents, then continue.</p>
      <div class="actions">
        ${button("back-to-checklist", "Back to checklist", "back", "primary")}
      </div>
    </div>`;
}

export function noticeHtml(message: string): string {
  return `${icon("info")}<span>${esc(message)}</span>`;
}
