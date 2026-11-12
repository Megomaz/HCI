# PLAN.md — "Translate" working prototype (understand an official letter)

Build a working, mobile-first web prototype for a university HCI project (SDG 10, Reduced Inequalities).
It will be opened on a phone and screen-recorded for a 5-minute video, so it must look polished, work
reliably every time, and need no explanation to use.

Build in the order of §10. After each part, run the app, check the acceptance criteria, and stop so it
can be tested on a phone before moving on.

---

## 1. Who it's for

- **Persona (synthetic):** Patrick, 62, self-employed plumber in Ireland. Low literacy, limited tech
  confidence, does paperwork on his phone. Gives up on dense official text and forwards it to his sister.
- **User group:** adults with low literacy and people with limited English.
- **Critical interaction:** Patrick uploads an official letter (or uses the sample Medical Card renewal
  letter), finds out what the hard words mean, reads or listens to a plain-English version, and leaves
  with a checklist of exactly what to send.

## 2. Features (all must be demonstrable)

| Feature | Behaviour |
|---|---|
| Upload a letter | Choose a PDF, photo, .docx or .txt, or use the built-in sample letter. Text is read in the browser. |
| Explain difficult words | Difficult words are underlined. Tap one (or Tab to it and press Enter/Space, or select it) → bottom sheet with a one-sentence meaning, "Read meaning aloud" and "Close". |
| Simple version | The whole letter rewritten in plain English, with the original always one tap away. |
| Document checklist | Three sections: **Must have**, **Optional**, **Only if needed**. |
| Read aloud | Real speech (browser Web Speech API) for the letter, the simple version, the checklist and word meanings. Current line highlighted while speaking. Word meanings spoken too (can be turned off). |
| Error handling | Plain-language errors that say what happened and what to do next, with "Try again" and "Use the sample letter". |

## 3. Tech stack and constraints

- **Vite + vanilla TypeScript** (no framework), plain CSS with custom properties.
- Single-page app with a small state machine for the steps (no router library).
- **The sample letter must work with zero setup and offline** — no API key, no backend, no network.
  This is what the video uses.
- Uploaded letters use one AI call through a serverless function (§6). Never put an API key in
  front-end code or in git.
- Text extraction libraries (`pdfjs-dist`, `tesseract.js`, `mammoth`) load only when a file is chosen,
  so the sample-letter path stays small and offline.
- Deploy to **Vercel or Netlify** (the serverless function needs one of them) so there is a public link
  that opens on a phone.
- Font: **Atkinson Hyperlegible** — one typeface only, bundled with the app.
- `<html lang="en-IE">`.

## 4. Design tokens

```css
--text: #1B2A41;        /* navy, body + headings */
--accent: #00695C;      /* teal, primary buttons and links */
--accent-soft: #E6F2EF; /* highlights, reading-aloud line, info boxes, focused word */
--error: #B3261E;       /* error state only */
--bg: #F7F9F8;
--surface: #FFFFFF;
--space: 8px;           /* spacing unit; use multiples */
--radius: 12px;
```

- Body text 18px minimum, line-height 1.5. Headings 26–28px bold.
- Primary buttons: full width, **min-height 56px**, teal fill, white text, always icon **plus** text label.
- Secondary buttons: full width, min-height 56px, teal outline.
- Every tappable thing at least **48×48px**, with at least 8px between neighbours.
- Lay out for a 390px-wide phone; centre in a max-width 480px column on desktop.

## 5. Flow: four steps, in order

The app works on a letter the user provides. Every screen shows **"Step X of 4: <name>"** and a
4-segment progress bar (X segments filled). The step name is the page heading, and focus moves to it
when the step changes. Footer on every screen: "Prototype – synthetic content".

Every step except Step 1 has a **Back** button; every step that has a next step has a primary **Next**
button. The order is 1 → 2 → 3 → 4, but Step 2 can skip straight to Step 4.

Button names must be unique and make sense on their own, so Back and Next say where they go
(e.g. "Back: understand the words", "Next: simple version").

### Step 1 — Upload your letter

- Big primary button **Choose a letter**
  (`<input type="file" accept="application/pdf,image/*,.txt,.docx">`; on phones this also offers the
  camera). No drag-and-drop; tapping the button is enough.
- Secondary button **Use the sample letter** — loads the Medical Card renewal text in §7 with its
  pre-written words, meanings, simple version and checklist. No AI call. Must always work, including
  offline.
- Short notice: "This is a prototype. Use the sample letter, or a letter with your personal details
  removed."
- While the letter is being read and the AI call runs: "Reading your letter…" with a progress bar,
  announced with `aria-live="polite"`. Not a time limit.
- When the letter is ready, go to Step 2. If the user comes back to Step 1 with a letter already
  loaded, show a primary **Next: understand the words** button as well.
- **Errors** are plain language and say what to do next, e.g. "We couldn't read the words in this
  photo. Try a clearer photo in good light, or use the sample letter." Buttons: **Try again**,
  **Use the sample letter**. Announced with `role="alert"`; shown with an icon and wording, not colour
  alone.
- `?demoError=1` makes the first attempt (sample or upload) fail on purpose, so the error state can be
  shown in the video. Off by default.
- No hidden "skip" or test links.

### Step 2 — Understand the words

- Tip as real text at the top: "Tip: tap any underlined word to see what it means." It is linked to
  the letter text with `aria-describedby`.
- The original letter text, with difficult words underlined (dotted underline). Each underlined word
  is a button inside the sentence.
- Tapping a word opens the **word meaning bottom sheet**: the word in bold, a one-sentence meaning,
  **Read meaning aloud**, **Close**.
- Selecting (highlighting) a word does the same. If the selected word has no meaning: "We don't have a
  simple meaning for this word yet."
- Buttons: **Read the letter aloud**, **Next: simple version** (primary),
  **Skip to checklist** (secondary), **Back**.

### Step 3 — Simple version

- The same tip at the top, linked to the text with `aria-describedby`.
- The whole letter rewritten in plain English: short sentences, one idea per sentence, reading age
  about 9. Difficult words that remain are still underlined and tappable.
- A small line: "Not sure? Check it against the original letter."
- Buttons: **Read simple version aloud**, **Next: checklist** (primary),
  **See the original letter** (toggles to **Back to simple version**), **Back**.

### Step 4 — Your checklist

- Sections **Must have**, **Optional**, **Only if needed**. Each item is a full-width row: checkbox +
  text, whole row tappable, checkbox labelled by its text. Difficult words are underlined here too.
- **Read checklist aloud** starts the reading-aloud state (below).
- **Start again with another letter** returns to Step 1 and forgets the current letter.
- **Back**.

### Reading aloud (state inside Steps 2, 3 and 4)

- The text stays on screen; the line being spoken is highlighted in `--accent-soft`, with a small
  animated sound bar and the label "Reading aloud…".
- Buttons: **Pause** (toggles to **Play**), **Play again**, **Done listening**.
- Toggle **Explain words while reading** (on by default), available wherever read aloud is offered.
- In Step 4, **Done listening** shows the confirmation "You have everything you need to know. Gather
  these documents, then continue." with a **Back to checklist** button. In Steps 2 and 3 it returns to
  the step.

### Word meaning (bottom sheet dialog)

- Opens from any underlined word (tap, click, Enter, Space) or from a text selection.
- Shows the word in bold, a one-sentence meaning, **Read meaning aloud**, **Close**.

## 6. AI: DeepSeek via OpenRouter (uploaded letters only)

- OpenRouter's OpenAI-compatible API: `POST https://openrouter.ai/api/v1/chat/completions`.
  Model from env `OPENROUTER_MODEL` (default `deepseek/deepseek-chat`), key from env
  `OPENROUTER_API_KEY`.
- The key is **only** used in a serverless function, `/api/simplify` (Vercel or Netlify). Never in
  front-end code, never committed. Keep `.env.example`; `.env` and `.env.local` stay in `.gitignore`.
- **One call after upload**, returning JSON only, validated with `zod`:
  ```json
  {
    "difficultWords": [{ "term": "furnish", "meaning": "Give or send." }],
    "simpleVersion": ["Short sentence.", "Another short sentence."],
    "checklist": { "mustHave": [], "optional": [], "onlyIfNeeded": [] }
  }
  ```
  - `term` must appear exactly in the original text (terms that don't are dropped).
  - Meanings: one sentence, under 12 words, everyday words, no jargon.
  - The model is told not to add or remove any requirement from the letter.
- If the JSON is invalid, retry once. If it still fails, or the network fails, show the Step 1 error
  state.
- DeepSeek models are text-only: always send the extracted text, never the image.
- Don't store uploaded files or extracted text anywhere — memory only, in the browser and in the
  function. The function does not log letter text.
- The sample letter never calls the AI.

### Text extraction (in the browser)

| File | How |
|---|---|
| PDF | `pdfjs-dist` text layer. |
| Image / photo | `tesseract.js` OCR, English. |
| .docx | `mammoth`. |
| .txt | Read directly. |

Each failure has its own plain-language message (unreadable photo, empty file, file type not
supported, letter too long, no internet).

## 7. Sample letter content (use exactly)

**Original text**
> Applicants must furnish documentary evidence of all means, including self-employment income for the
> preceding 12-month period, together with proof of residency. Where the applicant's circumstances have
> materially altered since the previous assessment, supplementary documentation may be required.

**Difficult words** (store in `src/glossary.ts`; match case-insensitively, including multi-word phrases)

| Word | Meaning |
|---|---|
| furnish | Give or send. |
| documentary evidence | Papers that prove something, like a bill or a letter. |
| means | All the money you get, like wages or payments. |
| residency | Where you live. |
| preceding | The one before. |
| materially altered | Changed in a big way. |
| assessment | The last time they checked if you could get the card. |
| supplementary documentation | Extra papers. |
| tax return | The form you send to Revenue each year showing what you earned. |

**Simple version** (new — draft, to be confirmed)
1. You must send papers that show all the money you get.
2. This includes money from your own work in the last 12 months.
3. You must also send proof of where you live.
4. Has anything big changed since your last check?
5. If so, you may need to send extra papers.

**Checklist**
- **Must have**
  - Proof of your income for the last 12 months (for example, your tax return)
  - Proof of your address (for example, a recent bill)
- **Optional**
  - A letter from your accountant, if you have one
- **Only if needed**
  - If your income or home changed since last year, send proof of the change

## 8. Read aloud details

- Use `window.speechSynthesis`. Prefer an `en-IE` voice, then `en-GB`, then any English voice. Rate 0.9.
- Speak sentence by sentence (one utterance per sentence / checklist item) so the current line can be
  highlighted reliably; don't depend on `boundary` events.
- **Start by speaking the tip:** "Tip: tap any underlined word to hear what it means."
- **Explain words while reading** (on by default): after each sentence finishes, say the meaning of
  each underlined word in it — "furnish means: give or send." — and highlight that word's button
  while its meaning is spoken. With the toggle off, only the sentences are read.
- Pause/Play uses `pause()`/`resume()`; Play again cancels and restarts; leaving the step cancels speech.
- If speech synthesis is unavailable, show "Read aloud isn't available on this browser" instead of
  failing silently.

## 9. Accessibility requirements (from our audit — all must pass)

**Fixes from the lab audit**

1. **Keyboard (POUR O3):** every underlined word is a real `<button>` inside the sentence, reachable
   with Tab in reading order. Focus style is thick and obvious: 3px solid navy outline, 2px offset,
   plus the soft teal background. **Enter** and **Space** open the meaning; **Esc** closes it and focus
   returns to the word.
2. **Screen readers (POUR R1):** each word button has the accessible name "furnish, show meaning"
   (screen readers add "button" themselves). The tip is real text at the top of Steps 2 and 3, linked
   with `aria-describedby` to the text area.
3. **The app's own Read aloud:** speaks the tip first, highlights each underlined word's button and
   says its meaning after the sentence, with the **Explain words while reading** toggle (§8).

**Standing requirements**

- Every action is a single tap or a key press; no drag, swipe or hover needed. Text selection is
  optional because tapping a word does the same thing.
- All buttons are real `<button>` elements. Buttons at least 56px tall; every target at least 48×48px
  with 8px gaps.
- Every button name is unique on its screen and makes sense on its own (no two "Read aloud", no bare
  "Done", no bare "Back" or "Next").
- No hidden test or skip links.
- Logical Tab order top-to-bottom; clearly visible focus ring (3px, high contrast) on everything.
- Bottom sheet is a proper dialog: focus moves into it, Tab stays inside, Esc and Close dismiss it,
  focus returns to the word that opened it.
- When the step changes, move focus to the new step's heading.
- Text contrast at least 4.5:1; errors are not shown by colour alone (icon + wording).
- Works at 200% browser zoom with no horizontal scrolling.
- Respect `prefers-reduced-motion` (no progress, sound-bar or sheet animation).
- No time limits anywhere.
- `lang="en-IE"`, Atkinson Hyperlegible, the colours in §4.

## 10. Build order

1. **Four-step flow with the sample letter only** — step header and progress bar, Steps 1–4, Back,
   Next and Skip to checklist, "See the original letter" toggle, "Start again with another letter".
   No upload, no AI. *Accept:* on a 390px viewport, go 1 → 2 → 3 → 4 and back again with the sample
   letter; skip from Step 2 to Step 4; works offline.
2. **Accessibility fixes 1–3 and the updated Read aloud** — word-button focus style, tip linked with
   `aria-describedby`, spoken tip, "furnish means: …" after each sentence, the Explain words toggle,
   read aloud in Steps 2, 3 and 4. *Accept:* every underlined word opens by Tab + Enter/Space and
   closes with Esc back to the word; real audio plays and the highlight follows; the toggle turns the
   meanings off.
3. **File upload and text extraction** — PDF, image OCR, .docx, .txt, the "Reading your letter…"
   state and every error state. *Accept:* each file type's text appears in Step 2 (no underlined words
   yet); a blurry photo, an empty file and an unsupported file each show the right message with
   Try again and Use the sample letter.
4. **OpenRouter serverless function** — `/api/simplify`, zod validation, one retry, connecting real
   letters to Steps 2–4, `?demoError=1`. Remove the Anthropic code and dependency. *Accept:* an
   uploaded letter gets underlined words, a simple version and a checklist; bad JSON twice or no
   network shows the Step 1 error; the key appears nowhere in the built site.
5. **Tests, deploy, README** — Playwright + `@axe-core/playwright`: keyboard-only run through all four
   steps with the sample letter (including opening a word meaning with Enter), the skip-to-checklist
   path, zero axe violations on every step. Then deploy to Vercel or Netlify and update the README,
   including the list of simulated elements below.

## 11. Simulated / non-functional elements (keep this list in the README)

- The sample letter uses pre-written words, meanings, simple version and checklist.
- `?demoError=1` makes the first attempt fail on purpose.
- OCR and AI output can be wrong; the original letter is always available to compare.
- Checkbox ticks are not saved; nothing is sent to a real renewal service.
- All content and the persona are synthetic.
