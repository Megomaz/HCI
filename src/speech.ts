/**
 * Read aloud, built on the browser's Web Speech API.
 *
 * Each line is its own utterance, and the whole queue is handed to the browser
 * inside the tap that started it (iOS only allows speech that starts from a tap).
 * The highlight follows each utterance's `start` event, never `boundary` events.
 */

export const NO_SPEECH_MESSAGE = "Read aloud isn't available on this browser";

const synth: SpeechSynthesis | undefined =
  typeof SpeechSynthesisUtterance !== "undefined" && window.speechSynthesis
    ? window.speechSynthesis
    : undefined;

export function speechAvailable(): boolean {
  return synth !== undefined;
}

// ---------- Voice: en-IE first, then en-GB, then any English voice ----------

let voices: SpeechSynthesisVoice[] = [];

function refreshVoices(): void {
  voices = synth?.getVoices() ?? [];
}

if (synth) {
  refreshVoices();
  // Chrome loads voices late; old Safari has no addEventListener here.
  synth.addEventListener?.("voiceschanged", refreshVoices);
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  if (voices.length === 0) refreshVoices();
  const lang = (voice: SpeechSynthesisVoice) => voice.lang.replace("_", "-").toLowerCase();
  return (
    voices.find((v) => lang(v) === "en-ie") ??
    voices.find((v) => lang(v) === "en-gb") ??
    voices.find((v) => lang(v).startsWith("en"))
  );
}

// ---------- Queue ----------

interface QueueEvents {
  onLine(index: number): void;
  onFinish(): void;
  onError(): void;
}

/** Bumped whenever speech is stopped or restarted, so stale events and timers are ignored. */
let generation = 0;
/** Chrome can garbage-collect queued utterances and drop their events unless we hold them. */
let keepAlive: SpeechSynthesisUtterance[] = [];

function isBusy(): boolean {
  return !!synth && (synth.speaking || synth.pending || synth.paused);
}

/** Stop everything that is being read aloud. */
export function stopSpeech(): void {
  generation += 1;
  keepAlive = [];
  // Only cancel when something is queued: Safari can drop a speak() that follows a cancel().
  if (isBusy()) synth?.cancel();
}

function queueLines(texts: readonly string[], from: number, events: QueueEvents): void {
  if (!synth) {
    events.onError();
    return;
  }
  const engine = synth;
  const wasBusy = isBusy();
  generation += 1;
  keepAlive = [];
  const mine = generation;

  if (from >= texts.length) {
    if (wasBusy) engine.cancel();
    events.onFinish();
    return;
  }

  const run = () => {
    if (mine !== generation) return;
    engine.resume(); // clears a leftover paused state; does nothing otherwise
    const voice = pickVoice();
    for (let i = from; i < texts.length; i++) {
      const utterance = new SpeechSynthesisUtterance(texts[i]);
      utterance.lang = voice?.lang.replace("_", "-") ?? "en-IE";
      if (voice) utterance.voice = voice;
      utterance.rate = 0.9;
      utterance.onstart = () => {
        if (mine === generation) events.onLine(i);
      };
      utterance.onend = () => {
        if (mine === generation && i === texts.length - 1) events.onFinish();
      };
      utterance.onerror = (event) => {
        if (mine !== generation) return;
        if (event.error === "interrupted" || event.error === "canceled") return;
        generation += 1;
        engine.cancel();
        events.onError();
      };
      keepAlive.push(utterance);
      engine.speak(utterance);
    }
  };

  if (wasBusy) {
    // Safari drops a speak() that comes straight after cancel(), so wait a moment.
    engine.cancel();
    window.setTimeout(run, 80);
  } else {
    run();
  }
}

/** Read one short piece of text, such as a word meaning. */
export function speakOnce(text: string, onError: () => void): void {
  queueLines([text], 0, { onLine: () => {}, onFinish: () => {}, onError });
}

// ---------- Reader: a list of lines with pause, play and play again ----------

export interface ReaderEvents {
  /** A line has started. Use this to move the highlight. */
  onLine(index: number): void;
  onFinish(): void;
  onError(): void;
}

export interface Reader {
  /** Start (or start again) from the first line. */
  start(): void;
  pause(): void;
  resume(): void;
  /** Stop for something else (a word meaning); resume() picks the current line up again. */
  interrupt(): void;
}

export function createReader(texts: readonly string[], events: ReaderEvents): Reader {
  let index = 0;
  let paused = false;
  let finished = false;
  /** True when the browser could not really pause, so Play must re-read the current line. */
  let needsRestart = false;
  let mine = -1;

  const isCurrent = () => mine === generation;

  const hardPause = () => {
    stopSpeech();
    needsRestart = true;
  };

  const startFrom = (from: number) => {
    paused = false;
    finished = false;
    needsRestart = false;
    index = from;
    queueLines(texts, from, {
      onLine: (i) => {
        index = i;
        if (paused) {
          // The browser kept talking after pause() (some Android browsers do).
          hardPause();
          return;
        }
        events.onLine(i);
      },
      onFinish: () => {
        finished = true;
        events.onFinish();
      },
      onError: events.onError,
    });
    mine = generation;
  };

  return {
    start: () => startFrom(0),

    pause() {
      if (finished || paused) return;
      paused = true;
      if (!isCurrent() || !synth) {
        needsRestart = true;
        return;
      }
      synth.pause();
      window.setTimeout(() => {
        if (paused && isCurrent() && synth && !synth.paused) hardPause();
      }, 250);
    },

    resume() {
      if (finished) {
        startFrom(0);
        return;
      }
      if (needsRestart || !isCurrent() || !synth) {
        startFrom(index);
        return;
      }
      paused = false;
      synth.resume();
      const engine = synth;
      window.setTimeout(() => {
        // If resume() did nothing, read the current line again rather than stay silent.
        if (paused || finished || !isCurrent()) return;
        if (engine.paused || !(engine.speaking || engine.pending)) startFrom(index);
      }, 500);
    },

    interrupt() {
      if (finished) return;
      paused = true;
      hardPause();
    },
  };
}

// Chrome keeps talking across a reload unless speech is cancelled on the way out.
window.addEventListener("pagehide", () => synth?.cancel());
