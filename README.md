# Translate — Medical Card renewal prototype

A working, mobile-first prototype for a university HCI project (SDG 10, Reduced Inequalities).
It takes one dense paragraph from a Medical Card renewal and turns it into a plain-English
checklist that can be read aloud, with tap-to-explain for difficult words.

**Persona (synthetic):** Patrick, 62, a self-employed plumber in Ireland with low literacy and
limited tech confidence, who does his paperwork on his phone.

**Public link:** https://megomaz.github.io/HCI/ — demo mode. It goes live once the one-time
steps under [Deploy](#deploy) have been run; it has not been published yet.

## Run it locally

Needs Node 20.19 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173. To open it on a phone on the same Wi-Fi, run
`npm run dev -- --host` and use the "Network" address it prints.

No API key or backend is needed. This is **demo mode**, the mode used for the video.

## What to show (all six features)

1. **Explain difficult words** — tap an underlined word such as "furnish". A sheet slides up with
   a one-sentence meaning, **Read meaning aloud** and **Close**. Selecting (highlighting) a word
   does the same.
2. **Simplify** — tap **Simplify this**. "Making this easier to read…" shows for about 2 seconds.
3. **Error handling** — the first Simplify fails on purpose: "Sorry, we couldn't simplify this
   right now. Your page is still here. Nothing is lost." Tap **Try again**.
4. **Document checklist** — "What you need to send", in three sections: Must have, Optional,
   Only if needed. Tap a row to tick it.
5. **Read aloud** — tap **Read checklist aloud**. The line being spoken is highlighted.
   **Pause** / **Play**, **Play again**, **Done listening**.
6. **Original instructions** — tap **See the original text**, then **Back to simple version**.

Reload the page to start again from the top (the on-purpose error comes back).

### Page options

| Address | What it does |
|---|---|
| `/` | Demo mode. The first Simplify fails on purpose. |
| `/?demoError=0` | Demo mode without the on-purpose failure. |
| `/?live=1` | Live mode: real AI simplification (needs the setup below). |

## Live mode (optional)

Live mode sends the text to a serverless function, which asks the Anthropic API
(`claude-haiku-5-5`) for the checklist. It also adds a **Paste your own letter** box to the first
screen, and asks the AI about selected words that are not in the glossary. Any failure shows the
normal error state. The API key stays on the server and is never in front-end code.

To try it locally:

```bash
cp .env.example .env.local     # then put your key after ANTHROPIC_API_KEY=
npm run dev
```

Open http://localhost:5173/?live=1. Demo mode keeps working with or without the key.

The live path has been tested with the AI's answers mocked. It has **not** been run against the
real Anthropic API yet, because no key was available when it was built.

## Deploy

**Demo mode (the public link above)** is set up for GitHub Pages. One-time steps to publish it:

```bash
git commit -m "Add Translate prototype"
git push -u origin main
gh api -X POST repos/Megomaz/HCI/pages -f build_type=workflow   # turn Pages on
gh workflow run deploy.yml                                       # publish
```

(The third step can also be done on github.com: Settings → Pages → Source → GitHub Actions.)
After that, every push to `main` rebuilds and republishes the site through
`.github/workflows/deploy.yml`.

GitHub Pages only serves static files, so **live mode does not work on that link** — `?live=1`
there goes to the normal error state. To host live mode, deploy the same repository to Vercel,
which also runs the two functions in `api/`:

```bash
npx vercel login
npx vercel --prod
```

Or import the GitHub repository at vercel.com (framework preset: Vite). Then add
`ANTHROPIC_API_KEY` under Project Settings → Environment Variables.

## Tests

```bash
npx playwright install chromium   # first time only
npm test
```

51 Playwright tests, run at a 390 × 844 phone viewport:

- **Flow** — the whole click-through, the on-purpose error, exact wording of the content.
- **Read aloud** — one utterance per line, highlight follows each line, Pause / Play / Play
  again, stopping when you leave the screen, voice choice (en-IE, then en-GB, then any English),
  and the "Read aloud isn't available on this browser" message. These use a silent stand-in for
  the browser's speech engine so they are repeatable.
- **Word meanings** — every glossary word by tap, by keyboard (Enter and Space) and by selection.
- **Accessibility** — zero axe violations on every screen and state; the whole journey with the
  keyboard alone; no sideways scrolling at 200% zoom; tap-target sizes and spacing; unique button
  names; reduced motion.
- **Live mode** — success, every kind of failure, and the function's input checks.

Read aloud was also checked once against the real speech engine in Chromium on macOS (Irish
voice "Moira"): the highlight followed every line and Pause / Play worked. It has not yet been
checked by ear on a phone.

## Accessibility

Requirements from our audit, and how each is met:

| Requirement | How |
|---|---|
| Every action is one tap or key press | No drag, swipe or hover anywhere. Selecting text is optional. |
| Real buttons | Every control is a `<button>`; underlined words are buttons named like "furnish, show meaning". |
| Unique, meaningful button names | Checked by a test on every screen. |
| Logical Tab order and visible focus | Tab runs top to bottom; 3px navy focus ring on everything. |
| Proper dialog | The word sheet is a modal `<dialog>`: focus moves in, Tab stays inside, Esc and Close dismiss it, focus returns to the word. |
| Focus on screen change | Focus moves to the new screen's heading. |
| Contrast and not colour alone | All text is at least 4.5:1; the error has an icon and wording as well as a red border. |
| 200% zoom | No sideways scrolling, tested at half-width layouts down to 195px. |
| Reduced motion | No progress, sound-bar or sheet animation when the device asks for less motion. |
| No time limits | Nothing times out on the user. |

### Barriers found in our lab audit — now fixed

| Barrier | Fix |
|---|---|
| Keyboard only: Tab skipped the underlined words, so their meanings could not be opened. | Each underlined word is a real button. Tab reaches it; Enter or Space opens the meaning. |
| Operable (POUR O3): underlined words had no visible highlight when selected. | A focused word gets a 3px navy outline. |
| Robust (POUR R1): read aloud said the underlined words as plain text, so a listener never found out the meanings existed. | Read aloud says the tip first ("Tip: tap any underlined word to see what it means."), then after each sentence says each underlined word and its meaning ("furnish. In simple words: Give or send."), marking the word on screen as it does. Screen readers hear each word as "furnish, show meaning, button". |

One limit to know about: the underlined words sit inside a sentence, so their tap area is 48px
tall but only as wide as the word, and tap areas on neighbouring lines overlap slightly in the
gap between lines. Tapping the word itself always opens the right meaning.

## Simulated / non-functional elements

- Demo mode uses pre-written simplification; the first Simplify fails on purpose.
- Only the glossary words have meanings in demo mode.
- Only step 2 of 4 of the renewal exists; it is not connected to any real service.
- Checkbox ticks are not saved.
- All content and the persona are synthetic.

## How it is built

Vite + vanilla TypeScript, plain CSS with custom properties, no framework and no router.
The font is Atkinson Hyperlegible, bundled with the app so it loads without a network request.

| File | What it holds |
|---|---|
| `src/main.ts` | The screen state machine and event handling. |
| `src/screens.ts` | The markup for each screen. |
| `src/content.ts`, `src/glossary.ts` | The synthetic content and the glossary. |
| `src/speech.ts`, `src/reading.ts` | Read aloud: the speech queue, and which lines are spoken. |
| `src/sheet.ts`, `src/selection.ts` | The word-meaning sheet, and opening it from a text selection. |
| `src/live.ts`, `api/` | Live mode: the browser side and the serverless functions. |
| `src/style.css` | Design tokens and all styles. |
| `tests/` | Playwright tests. |
| `PLAN.md` | The original build plan. |
