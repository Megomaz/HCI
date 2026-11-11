# PLAN.md — "Translate" working prototype (Medical Card renewal)

Build a working, mobile-first web prototype for a university HCI project (SDG 10, Reduced Inequalities).
It will be opened on a phone and screen-recorded for a 5-minute video, so it must look polished, work
reliably every time, and need no explanation to use.

Work through the milestones in order. After each milestone, run the app, check the acceptance
criteria, and stop to show me before moving on.

---

## 1. Who it's for

- **Persona (synthetic):** Patrick, 62, self-employed plumber in Ireland. Low literacy, limited tech
  confidence, does paperwork on his phone. Gives up on dense official text and forwards it to his sister.
- **User group:** adults with low literacy and people with limited English.
- **Critical interaction:** Patrick simplifies the "documents you need" section of his Medical Card
  renewal so he knows exactly what to send — and can listen to it instead of reading it.

## 2. Features (all six must be demonstrable)

| Feature | Behaviour |
|---|---|
| Simplify | Turns the dense renewal paragraph into a plain-English checklist. |
| Document checklist | Three sections: **Must have**, **Optional**, **Only if needed**. |
| Read aloud | Real speech (browser Web Speech API) for the checklist, the original text, and word meanings. Current line highlighted while speaking. |
| Explain difficult words | Tap an underlined word **or** highlight (select) any word → bottom sheet with a one-sentence meaning, "Read meaning aloud" and "Close". |
| Original instructions | "See the original text" / "Back to simple version" toggle so Patrick can compare. |
| Error handling | Plain-language error that says what happened and what to do next, with "Try again" and "Read the original aloud". |

## 3. Tech stack and constraints

- **Vite + vanilla TypeScript** (no framework needed), plain CSS with custom properties.
- Single-page app with a small state machine for screens (no router library).
- **Must run with zero setup in "demo mode"** — no API key, no backend. This is the mode used for the video.
- Optional **"live mode"** (Milestone 5) adds real AI simplification through a serverless function.
  Never put an API key in front-end code.
- Deploy as a static site (Vercel or Netlify) so it has a public link that opens on a phone.
- Font: **Atkinson Hyperlegible** (Google Fonts) — one typeface only.
- `<html lang="en-IE">`.

## 4. Design tokens

```css
--text: #1B2A41;        /* navy, body + headings */
--accent: #00695C;      /* teal, primary buttons and links */
--accent-soft: #E6F2EF; /* highlights, reading-aloud line, info boxes */
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

## 5. Screens and states

Top of every screen: "Step 2 of 4: Documents" with a 4-segment progress bar (2 filled), then the title
**"Medical Card – Renewal"**. Footer: "Prototype – synthetic content".

1. **Renewal page**
   - Tip above the text: "Tip: tap any underlined word to see what it means."
   - Original paragraph (see §6) in a soft box, difficult words with a dotted underline.
   - Primary button: **Simplify this**. Secondary: **Read the original aloud**.
2. **Simplifying (feedback state)**
   - Progress bar animating, "Making this easier to read…", "This takes a few seconds."
   - Announced to screen readers (`aria-live="polite"`). Lasts ~2 seconds. Not a time limit.
3. **Error state**
   - Red-bordered box: heading "Sorry, we couldn't simplify this right now", text
     "Your page is still here. Nothing is lost."
   - Buttons: **Try again** (primary), **Read the original aloud** (secondary).
   - Announced with `role="alert"`.
   - In demo mode, the **first** Simplify always fails so the error state can be shown; Try again succeeds.
     Controlled by `?demoError=1` (default on) / `?demoError=0`.
   - No hidden "skip to result" or test links.
4. **Checklist ("What you need to send")**
   - Sections and items from §6. Each item is a full-width row: checkbox + text, whole row tappable,
     checkbox labelled by its text.
   - Difficult words underlined here too (e.g. "tax return").
   - Buttons: **Read checklist aloud** (primary), link-styled button **See the original text**.
   - "See the original text" shows the original paragraph with **Back to simple version**.
5. **Reading aloud**
   - Same checklist, line currently being spoken highlighted in `--accent-soft`, small animated sound bar,
     label "Reading aloud…".
   - Buttons: **Pause** (toggles to **Play**), **Play again**, **Done listening**.
   - **Done listening** shows a confirmation: "You have everything you need to know. Gather these
     documents, then continue." with a **Back to checklist** button.
6. **Word meaning (bottom sheet dialog)**
   - Opens from any underlined word (tap/click/Enter/Space) or from a text selection.
   - Shows word in bold, one-sentence meaning, **Read meaning aloud**, **Close**.
   - If a selected word isn't in the glossary: "We don't have a simple meaning for this word yet."
     (In live mode, ask the AI instead.)

## 6. Content (use exactly)

**Original paragraph**
> Applicants must furnish documentary evidence of all means, including self-employment income for the
> preceding 12-month period, together with proof of residency. Where the applicant's circumstances have
> materially altered since the previous assessment, supplementary documentation may be required.

**Checklist**
- **Must have**
  - Proof of your income for the last 12 months (for example, your tax return)
  - Proof of your address (for example, a recent bill)
- **Optional**
  - A letter from your accountant, if you have one
- **Only if needed**
  - If your income or home changed since last year, send proof of the change

**Glossary** (store in `src/glossary.ts`; match case-insensitively, including multi-word phrases)

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

## 7. Read aloud details

- Use `window.speechSynthesis`. Prefer an `en-IE` voice, then `en-GB`, then any English voice. Rate 0.9.
- Speak sentence by sentence (one utterance per checklist item / sentence) so the current line can be
  highlighted reliably; don't depend on `boundary` events.
- Pause/Play uses `pause()`/`resume()`; Play again cancels and restarts; leaving the screen cancels speech.
- If speech synthesis is unavailable, show "Read aloud isn't available on this browser" instead of failing silently.

## 8. Accessibility requirements (from our audit — all must pass)

- Every action is a single tap or a key press; no drag, swipe or hover needed. Text selection is optional
  because tapping a word does the same thing.
- All buttons are real `<button>` elements; underlined words are buttons with accessible names like
  "furnish, show meaning".
- Every button/link name is unique and makes sense on its own (no two "Read aloud", no bare "Done").
- Logical Tab order top-to-bottom; clearly visible focus ring (3px, high contrast) on everything.
- Bottom sheet is a proper dialog: focus moves into it, Tab stays inside, Esc and Close dismiss it,
  focus returns to the word that opened it.
- When the screen changes, move focus to the new screen's heading.
- Text contrast at least 4.5:1; error is not shown by colour alone (icon + wording).
- Works at 200% browser zoom with no horizontal scrolling.
- Respect `prefers-reduced-motion` (no progress/sound-bar animation).
- No time limits anywhere.

## 9. Milestones

1. **Scaffold + screens** — Vite project, tokens, all screens with demo data, state machine,
   demo-mode error on first Simplify. *Accept:* click through Renewal → Simplifying → Error → Try again
   → Checklist → See original → Back on a 390px viewport.
2. **Read aloud** — speech for checklist, original text, and word meanings; reading-aloud screen with
   highlight, Pause/Play, Play again, Done listening. *Accept:* real audio plays and highlight follows.
3. **Explain difficult words** — glossary, underlined word buttons, selection support, bottom sheet dialog.
   *Accept:* every glossary word opens the right meaning by tap, keyboard, and selection.
4. **Accessibility pass** — add `@axe-core/playwright` and Playwright tests for the full keyboard-only flow.
   *Accept:* zero axe violations on every screen; keyboard-only test passes; manual 200% zoom check.
5. **Live mode (optional)** — serverless function `/api/simplify` that calls the Anthropic API
   (fast model, e.g. `claude-haiku-5-5`, key in `ANTHROPIC_API_KEY` env var) and returns JSON
   `{ mustHave: [], optional: [], onlyIfNeeded: [] }` in plain English (reading age ~9). Add a
   "Paste your own letter" textarea on screen 1 in live mode only. On any failure, show the error state.
   Demo mode must keep working without the key.
6. **Deploy + README** — deploy to Vercel/Netlify, README with how to run locally, the public link, and
   the list of simulated elements below.

## 10. Simulated / non-functional elements (keep this list in the README)

- Demo mode uses pre-written simplification; the first Simplify fails on purpose.
- Only the glossary words have meanings in demo mode.
- Only step 2 of 4 of the renewal exists; it is not connected to any real service.
- Checkbox ticks are not saved.
- All content and the persona are synthetic.
