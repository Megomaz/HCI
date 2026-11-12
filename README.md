# Translate — understand an official letter

A working, mobile-first prototype for a university HCI project (SDG 10, Reduced Inequalities).
You give it an official letter. It explains the difficult words, rewrites the letter in plain
English, and ends with a checklist of what to send. Everything can be read aloud.

**Persona (synthetic):** Patrick, 62, a self-employed plumber in Ireland with low literacy and
limited tech confidence, who does his paperwork on his phone.

**Public link:** https://t-21co8tvij-megomaz.vercel.app — deployed on Vercel, but at the moment it
asks visitors to log in to Vercel. See [Deploy](#deploy) for how to make it public.

## Run it locally

Needs Node 20.19 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173. To open it on a phone on the same Wi-Fi, run
`npm run dev -- --host` and use the "Network" address it prints.

**The sample letter needs no setup**: no API key, no backend, and once the page is open it works
with no internet. This is what the video uses.

## The four steps

| Step | What happens |
|---|---|
| **1. Upload your letter** | **Choose a letter** (PDF, photo, Word .docx or .txt; on a phone this also offers the camera) or **Use the sample letter**. |
| **2. Understand the words** | The original letter with difficult words underlined. Tap a word for a one-sentence meaning. **Skip to checklist** jumps to Step 4. |
| **3. Simple version** | The whole letter in plain English. **See the original letter** switches back and forth. |
| **4. Your checklist** | Must have / Optional / Only if needed, with tick boxes. **Start again with another letter** returns to Step 1. |

Steps 2, 3 and 4 each have a read-aloud button. While reading, the line being spoken is
highlighted, with **Pause** / **Play**, **Play again** and **Done listening**.
**Explain words while reading** (on by default) also speaks each underlined word's meaning.

### Showing the error state in the video

Open the page as `/?demoError=1`. The first attempt to load a letter fails on purpose with a
plain-language message; **Try again** then works. Without `?demoError=1` nothing fails on purpose.

## Uploaded letters (needs an OpenRouter key)

The sample letter is pre-written. Any other letter is read in the browser and then sent, as text
only, to one serverless function (`/api/simplify`), which asks DeepSeek through OpenRouter for the
difficult words, the simple version and the checklist.

To try it locally:

```bash
cp .env.example .env.local     # then put your key after OPENROUTER_API_KEY=
npm run dev
```

- The key is used only in the serverless function. It is never in front-end code, and `.env` and
  `.env.local` are ignored by git.
- `OPENROUTER_MODEL` is optional; the default is `deepseek/deepseek-chat`.
- If the AI's answer is not valid JSON it is asked once more. If that fails too, or the network
  fails, Step 1 shows an error with **Try again** and **Use the sample letter**.
- The letter is never stored: the file stays on the device, the text is held in memory only, and
  the function does not log it. Reloading the page forgets it.
- Letters longer than 8,000 characters are refused rather than cut short.

**Tried once against the real AI.** A photo of a short synthetic letter went through OCR and the
real DeepSeek model locally in about 14 seconds, and came back with sensible meanings, a simple
version and a checklist. That is one letter; answers on other letters have not been reviewed.
The automated tests use a stand-in that answers in the same format, not the real AI.

How each file type is read, all in the browser:

| File | How |
|---|---|
| PDF | `pdfjs-dist` text layer. A scanned PDF with no text layer shows an error asking for a photo instead. |
| Photo | `tesseract.js` OCR, English. The OCR files are served from this site, not a third-party CDN. |
| Word .docx | `mammoth` |
| .txt | Read directly |

## Deploy

The site is on Vercel, which also runs the serverless function (a static host such as GitHub
Pages is not enough). `OPENROUTER_API_KEY` is set under Project Settings → Environment Variables.

To publish a new version:

```bash
npx vercel --prod
```

**Making the link public.** Vercel protects deployment addresses by default, so people who are
not logged in to the Vercel account see a login page. Either share the project's production
domain (Vercel dashboard → the project → Domains), or turn the protection off under
Project Settings → Deployment Protection → Vercel Authentication. Then open the link in a private
browser window to check, and update the link at the top of this file.

## Tests

```bash
npx playwright install chromium   # first time only
npm test
```

96 Playwright tests at a 390 × 844 phone viewport. They start their own dev server and a stand-in
for OpenRouter, so they use no real key and send nothing to the real AI service.

- **Flow** — the four steps in order, Back, Skip to checklist, Start again, the sample letter
  offline, `?demoError=1`.
- **Read aloud** — the spoken tip, one utterance per sentence, the highlight on each line and on
  each explained word, the Explain words switch, Pause / Play / Play again, voice choice, and that
  the page does not jump back once the reader scrolls away from the spoken line.
- **Word meanings** — every sample word by tap, by keyboard and by selection; the dialog.
- **Upload** — every file type end to end, each error message, the retry on invalid JSON, and that
  the key never reaches the browser.
- **Function** — input checks and the rules for accepting the AI's answer.
- **Accessibility** — zero axe violations on every step and state, a keyboard-only run through all
  four steps (including opening a word meaning with Enter), the keyboard-only skip path, 200% zoom,
  tap-target sizes and spacing, unique button names, reduced motion.

Read aloud was also run once against the real speech engine in Chromium on macOS (Irish voice):
the highlight followed every line. It has not yet been checked by ear on a phone.

## Accessibility

### Fixes from our lab audit

| Barrier found | Fix |
|---|---|
| **Keyboard (POUR O3):** Tab skipped the underlined words, and they had no visible highlight. | Every underlined word is a real `<button>` inside the sentence, reached with Tab in reading order. A focused word has a 3px navy outline, 2px offset, and a soft teal background. Enter and Space open the meaning; Esc closes it and focus returns to the word. |
| **Screen readers (POUR R1):** nothing said the words could be opened. | Each word button is named "furnish, show meaning". The tip "Tip: tap any underlined word to see what it means." is real text at the top of Steps 2 and 3, linked to the text with `aria-describedby`. |
| **The app's own Read aloud** said the words as plain text, so a listener never found out the meanings existed. | Read aloud starts with "Tip: tap any underlined word to hear what it means." After each sentence it says "furnish means: give or send." for each underlined word, highlighting that word's button as it does. **Explain words while reading** turns this off. |

### Standing requirements

| Requirement | How |
|---|---|
| One tap or key press for everything | No drag, swipe or hover anywhere. Selecting text is optional. |
| Real buttons, big enough | Every control is a `<button>` (or a checkbox). Buttons are at least 56px tall, every target at least 48×48px, with 8px gaps. |
| Unique, meaningful button names | Back and Next say where they go ("Back: understand the words"). Checked by a test on every screen. |
| Focus | Tab runs top to bottom; 3px navy focus ring; focus moves to each new step's heading. |
| Proper dialog | The word sheet is a modal `<dialog>`: focus moves in, Tab stays inside, Esc and Close dismiss it, focus returns to the word. |
| Contrast and not colour alone | All text is at least 4.5:1; errors have an icon and wording as well as a red border. |
| 200% zoom | No sideways scrolling, tested at half-width layouts down to 195px. |
| Reduced motion | No progress, sound-bar or sheet animation when the device asks for less motion. |
| No time limits | Nothing times out on the user; "Reading your letter…" can be stopped. |
| Language, type, colour | `lang="en-IE"`, Atkinson Hyperlegible only, the colours in PLAN.md. |

One limit to know about: the underlined words sit inside a sentence, so their tap area is 48px
tall but only as wide as the word, and tap areas on neighbouring lines overlap slightly in the
gap between lines. Tapping the word itself always opens the right meaning.

## Simulated / non-functional elements

- The sample letter uses pre-written words, meanings, simple version and checklist.
- `?demoError=1` makes the first attempt fail on purpose.
- OCR and AI output can be wrong; the original letter is always available to compare.
- Checkbox ticks are not saved; nothing is sent to a real renewal service.
- All content and the persona are synthetic.

## How it is built

Vite + vanilla TypeScript, plain CSS with custom properties, no framework and no router.
The font is bundled with the app. The PDF, OCR and Word readers load only when a file is chosen.

| File | What it holds |
|---|---|
| `src/main.ts` | The step state machine and event handling. |
| `src/screens.ts` | The markup for each step. |
| `src/content.ts`, `src/glossary.ts` | The sample letter, its difficult words, and word matching. |
| `src/letter.ts` | The letter model; turning raw text into paragraphs and sentences. |
| `src/extract.ts` | Reading PDFs, photos, Word and text files in the browser. |
| `src/ai.ts`, `api/` | The call to the serverless function, and the function itself. |
| `src/speech.ts`, `src/reading.ts` | Read aloud: the speech queue, and which lines are spoken. |
| `src/sheet.ts`, `src/selection.ts` | The word-meaning sheet, and opening it from a text selection. |
| `src/errors.ts` | The plain-language error messages. |
| `src/style.css` | Design tokens and all styles. |
| `scripts/copy-ocr-assets.mjs` | Copies the OCR engine into the site before dev and build. |
| `tests/` | Playwright tests, test letters, and the stand-in for OpenRouter. |
| `PLAN.md` | The build plan. |
