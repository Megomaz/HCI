import { ORIGINAL_SENTENCES, SECTIONS, type Checklist } from "./content";
import { splitTerms } from "./glossary";
import { icon, type IconName } from "./icons";
import { TIP_TEXT, sentenceLineId, termIdFor } from "./reading";

export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Text with each difficult word turned into a real button that Tab can reach.
 * Enter, Space or a tap opens the meaning.
 */
function rich(text: string, lineId: string): string {
  let n = 0;
  return splitTerms(text)
    .map((part) => {
      if (!part.isTerm) return esc(part.text);
      const word = esc(part.text);
      const key = esc(part.text.toLowerCase().replace(/\s+/g, " "));
      return `<button type="button" class="term" data-term="${key}" data-term-id="${termIdFor(lineId, n++)}" aria-label="${word}, show meaning"><span>${word}</span></button>`;
    })
    .join("");
}

type ButtonStyle = "primary" | "secondary" | "link";

function button(action: string, label: string, iconName: IconName, style: ButtonStyle): string {
  return `<button type="button" class="btn btn-${style}" data-action="${action}">${icon(iconName)}<span>${esc(label)}</span></button>`;
}

function heading(text: string): string {
  return `<h2 class="screen-heading" tabindex="-1" data-focus>${esc(text)}</h2>`;
}

function tip(): string {
  return `<p class="tip" data-line="tip">${icon("info")}<span>${esc(TIP_TEXT)}</span></p>`;
}

function originalBox(sentences: readonly string[]): string {
  const spans = sentences
    .map((sentence, i) => {
      const lineId = sentenceLineId(i);
      return `<span class="sentence" data-line="${lineId}">${rich(sentence, lineId)}</span>`;
    })
    .join(" ");
  return `<div class="soft-box"><p class="original">${spans}</p></div>`;
}

function checklist(list: Checklist, checked: ReadonlySet<string>): string {
  return SECTIONS.filter(({ key }) => list[key].length > 0)
    .map(({ key, title }) => {
      const rows = list[key]
        .map((text, i) => {
          const id = `${key}-${i}`;
          const isChecked = checked.has(id);
          return `<li class="check-row${isChecked ? " checked" : ""}" data-row="${id}" data-line="${id}">
            <input type="checkbox" id="cb-${id}" aria-label="${esc(text)}"${isChecked ? " checked" : ""} />
            <span class="check-text">${rich(text, id)}</span>
          </li>`;
        })
        .join("");
      return `<section class="check-section" aria-labelledby="sec-${key}">
        <h3 id="sec-${key}"><span data-line="sec-${key}">${esc(title)}</span></h3>
        <ul class="check-list">${rows}</ul>
      </section>`;
    })
    .join("");
}

// ---------- Screens ----------

export function renewalScreen(liveMode: boolean, letter: string): string {
  const letterField = liveMode
    ? `<div class="field">
        <label for="letter">Paste your own letter</label>
        <p class="hint" id="letter-hint">Leave this empty to use the text above.</p>
        <textarea id="letter" rows="5" maxlength="4000" aria-describedby="letter-hint">${esc(letter)}</textarea>
      </div>`
    : "";
  return `
    ${tip()}
    ${originalBox(ORIGINAL_SENTENCES)}
    ${letterField}
    <div class="actions">
      ${button("simplify", "Simplify this", "simplify", "primary")}
      ${button("read-original", "Read the original aloud", "speaker", "secondary")}
    </div>`;
}

export function simplifyingScreen(): string {
  return `
    <div class="card status-card">
      ${heading("Making this easier to read…")}
      <div class="loader" aria-hidden="true"><span></span></div>
      <p>This takes a few seconds.</p>
    </div>`;
}

export function errorScreen(original: readonly string[]): string {
  return `
    <div class="card error-card" role="alert">
      <div class="error-title">
        ${icon("warning", 28)}
        ${heading("Sorry, we couldn't simplify this right now")}
      </div>
      <p>Your page is still here. Nothing is lost.</p>
      <div class="actions">
        ${button("simplify", "Try again", "retry", "primary")}
        ${button("read-original", "Read the original aloud", "speaker", "secondary")}
      </div>
    </div>
    ${originalBox(original)}`;
}

export function checklistScreen(list: Checklist, checked: ReadonlySet<string>): string {
  return `
    ${heading("What you need to send")}
    ${checklist(list, checked)}
    <div class="actions">
      ${button("read-checklist", "Read checklist aloud", "speaker", "primary")}
      ${button("see-original", "See the original text", "document", "link")}
    </div>`;
}

export function originalScreen(original: readonly string[]): string {
  return `
    ${heading("The original text")}
    ${originalBox(original)}
    <div class="actions">
      ${button("back-to-simple", "Back to simple version", "back", "primary")}
      ${button("read-original", "Read the original aloud", "speaker", "secondary")}
    </div>`;
}

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

export function readingScreen(
  source: "checklist" | "original",
  status: ReadingStatus,
  list: Checklist,
  checked: ReadonlySet<string>,
  original: readonly string[],
  showTip: boolean,
): string {
  const body =
    source === "checklist"
      ? checklist(list, checked)
      : `${showTip ? tip() : ""}${originalBox(original)}`;
  return `
    ${heading(source === "checklist" ? "What you need to send" : "The original text")}
    <p class="reading-status${status === "playing" ? "" : " stopped"}" id="reading-status">
      <span class="sound-bar" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
      <span id="reading-label" aria-live="polite">${esc(READING_LABELS[status])}</span>
    </p>
    ${body}
    <div class="actions">
      <button type="button" class="btn btn-primary" data-action="toggle-pause" id="pause-button">${pauseButtonContent(status)}</button>
      ${button("play-again", "Play again", "replay", "secondary")}
      ${button("done-listening", "Done listening", "check", "secondary")}
    </div>`;
}

export function doneScreen(): string {
  return `
    <div class="card done-card">
      <span class="done-icon">${icon("check", 32)}</span>
      ${heading("You have everything you need to know.")}
      <p>Gather these documents, then continue.</p>
      <div class="actions">
        ${button("back-to-checklist", "Back to checklist", "back", "primary")}
      </div>
    </div>`;
}

export function noticeHtml(message: string): string {
  return `${icon("info")}<span>${esc(message)}</span>`;
}
