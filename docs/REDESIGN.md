# Sourced v1.1 redesign (normative)

Status: approved by the owner on 2026-11-09 (D-91). Visual reference: the "Sourced redesign" canvas (six artboards: chat with source viewer, new chat, phone, answer states, `/eval`, `/how-it-works`).

This document overrides PRD §9 (layout and the strings listed in section 7), TRD §15.2 (tokens and fonts) and the layout parts of TRD §15.4–§15.8. Everything else in the PRD and TRD stays in force: the API and SSE contracts, retrieval, prompts, citation verification, rate limits, privacy, CSP, logging, the error matrix and every NFR (accessibility, 360–1920 px, first-load JS ≤ 180 KB gzip for `/`). Strings not listed in section 7 keep their current text in `lib/copy.ts`, `components/eval/copy.ts` and the components.

## 1. Principles

1. The visitor should not need to open the PostgreSQL documentation: the answer, its SQL and the passages behind it are readable in place, and the official page is one click away.
2. A chat, not a form: questions and answers stack in one conversation; the input stays at the bottom.
3. Every claim stays checkable: citation numbers in the text, source cards under the answer, and a source viewer that shows the passage with the quoted sentence highlighted.
4. No backend change. `POST /api/ask`, the SSE events, prompts and retrieval are unchanged, so no eval run is needed for this work. Each question is still answered on its own; earlier turns are not sent to the model.
5. No new runtime dependency. SQL highlighting is an in-house tokenizer.

## 2. Tokens and type (replaces TRD §15.2)

Fonts: Inter (400, 500, 600, 700) for text and JetBrains Mono (400, 500) for code, numbers in code-like labels and citation numbers, both through `next/font/google` (self-hosted at build). Base size 16 px, line height 1.6 (answers 1.7). H1 40/46 px weight 700, letter-spacing −0.02em (32/38 px below 640 px). H2 20–22 px weight 600.

```css
:root {
  --ground: #fafaf8;      /* page */
  --rail: #f3f3ef;        /* side rail, muted panels */
  --surface: #ffffff;     /* cards, composer, source viewer */
  --ink: #16181d;
  --ink-2: #3e434c;
  --ink-3: #5b616c;       /* secondary text; >= 4.5:1 on --ground */
  --rule: #e6e6e1;
  --rule-strong: #d6d6d0;
  --accent: #2155d6;
  --accent-ink: #ffffff;
  --accent-soft: #eef3ff; /* citation chip background */
  --accent-soft-ink: #1c47b8;
  --user-bubble: #16181d;
  --user-bubble-ink: #ffffff;
  --quote: #ffefb0;       /* highlighted quote in the source viewer */
  --ok: #1f7a4d;
  --ok-soft: #e7f4ec;
  --warn: #8a4b08;
  --warn-soft: #fff1e0;
  --danger: #7a1414;
  --danger-soft: #fdecec;
  --code-bg: #14161b;
  --code-bar: #1b1e25;
  --code-ink: #e4e6eb;
  --radius-sm: 6px;
  --radius: 10px;
  --radius-lg: 16px;
  color-scheme: light;
}
```

Dark theme (same `prefers-color-scheme` and `data-theme` mechanism as today): `--ground #111317`, `--rail #16191e`, `--surface #1b1e24`, `--ink #eceef2`, `--ink-2 #c3c8d1`, `--ink-3 #9097a3`, `--rule #262a31`, `--rule-strong #343943`, `--accent #7d9cff`, `--accent-ink #0b0d12`, `--accent-soft #1d2840`, `--accent-soft-ink #b5c8ff`, `--user-bubble #2a2f38`, `--user-bubble-ink #eceef2`, `--quote #5a4a12` with text `--ink`, `--ok #5cc28f`, `--ok-soft #15291f`, `--warn #f0a35d`, `--warn-soft #2e2114`, `--danger #ff9b9b`, `--danger-soft #301617`. Code block colours are the same in both themes.

SQL token colours on `--code-bg`: keyword `#7aa2f7`, function `#e0af68`, string `#9ece6a`, number `#ff9e64`, comment `#8a93a8` italic, operator and punctuation `#c0caf5`, identifier `--code-ink`. All ≥ 4.5:1 on `--code-bg`.

No shadows, no gradients. Focus ring stays: 2 px `--accent` outline, 2 px offset. Touch targets ≥ 44 × 44 px for primary controls, ≥ 24 × 24 px for inline citation chips.

## 3. Ask page layout (`/`)

Three regions on wide screens; at < 1024 px the source viewer becomes a bottom sheet; at < 768 px the rail collapses behind a menu button in a top bar.

1. **Rail** (`nav` labelled "Main", 264 px): logo mark and "Sourced" with "PostgreSQL 17 docs" under it; **New chat** button; "This session" list of the questions asked in this tab (newest last; activating one scrolls its turn into view and moves focus to it); the privacy note (section 7); links Evaluation, How it works, Source on GitHub; theme toggle with a visible label; the corpus attribution line in small text at the bottom.
2. **Conversation** (`main#content`): a 60 px header with the first question of the chat as the title (the hero text when empty) and the scope note; the turns, max width 760 px, centred; the **composer** fixed to the bottom of the column.
3. **Source viewer** (`aside` labelled "Source viewer", 380–440 px): closed until a citation or source card is activated; then shows "Source {n} of {total}", previous and next buttons, close button, the passage's chapter (`headingPath` without the last item, or the document title) and section title, a primary link **Open on postgresql.org** to `officialUrl` (`target="_blank"`, `rel="noopener noreferrer"`, an accessible name ending "(opens in a new tab)"), the full passage text with every verified quote for that passage marked with `<mark>`, and the line "Highlighted: the sentence the answer quotes." when a quote is present. Esc closes it and returns focus to the control that opened it. As a bottom sheet it is a modal dialog with a focus trap.

Empty chat (no turns): the welcome block replaces the turns: H1, lead, a large composer (2 rows), the limit line, the six suggested questions as cards in a 2-column grid (1 column below 640 px), each with a topic label above the question, and the scope line with a link to `/eval`.

## 4. Turns

A turn is the visitor's question (right-aligned bubble, `--user-bubble`) followed by the answer article. State per turn comes from the existing `useAsk` reducer; the page keeps an array of finished turns in React state only (no storage), plus the active turn. Only one request runs at a time: while one streams, the composer's submit is disabled and Enter does nothing. **New chat** clears all turns (after a stream is stopped or finished) and shows the welcome block.

Answer article, top to bottom:

1. Header: "Sourced", then the verification badge once `citations` arrives: all valid → `--ok-soft` badge "{valid} of {total} citations checked against the docs" (singular "1 of 1 citation checked against the docs"); some removed → `--warn-soft` badge "{valid} of {total} citations checked · {removed} removed"; cached answers add the existing "Answered in advance" label next to the badge.
2. While streaming: the status steps as pills (section 7), the text with a blinking caret (`prefers-reduced-motion`: no blink), and the Stop button. Tokens are never announced; the live region rules of TRD §15.6 stay.
3. Body: Markdown through the existing safe renderer. Citation markers render as chips showing the number only ("1", not "P1"), accessible name unchanged ("Source P1: {title}, {heading}"). Activating a chip opens the source viewer on that passage. Code blocks: see section 5.
4. Removed citations: the badge plus a `details` element "Why {n} citations were removed" (singular "Why 1 citation was removed") listing the existing per-citation reasons (D-81).
5. Source cards: one card per cited passage (verified citations only, in label order), 2-column grid (1 column below 640 px): number tile, section title (last `headingPath` item), parent heading or document title; activating the card opens the source viewer. The card for the passage open in the viewer is marked selected (`aria-current="true"`).
6. Actions row: **Copy as Markdown** (existing copy format), **How this was answered** (existing disclosure and its table, unchanged copy), and a monospace summary "{vector} + {fts} candidates · {passages} passages read · {total} s" from `meta.retrieval.vectorCandidates`, `meta.retrieval.ftsCandidates`, the number of `meta.passages` and `done.latencyMs.total` (seconds, 1 decimal), with " · search order" appended when `meta.retrieval.rerankFallback` is true (cached: "Answered in advance · served from the cache"). The SSE stream has no reranked or merged count, so none is shown.

Not-found, rate-limited, readonly, offline, provider, network, server and stopped states render inside the turn (or, for page-level demo modes, in place of the welcome block) with the existing copy and the colours of section 2; not-found related reading items become link cards with the section title, "postgresql.org/docs/17" under it and an external-link icon, linking to `officialUrl`.

## 5. Code and SQL

1. Fenced code blocks render in a `figure` with a 40 px bar: language label on the left ("SQL" for `sql`, `psql`, `pgsql`, `postgresql` or an unlabeled block, else the given label in upper case, else "Code") and a **Copy** button (accessible name "Copy code"; after copying, the label reads "Copied" for 2 s and the live region says "Code copied").
2. `lib/highlight/sql.ts` (new, pure, no dependencies, framework-free): `tokenizeSql(source): Array<{ type: 'keyword' | 'function' | 'string' | 'number' | 'comment' | 'operator' | 'identifier' | 'space'; text: string }>`. Handles `--` and `/* */` comments, single-quoted strings with `''` escapes, dollar-quoted strings (`$$…$$`, `$tag$…$tag$`), double-quoted identifiers, numbers, `$1` parameters (number colour), operators and punctuation, and a keyword list covering the SQL in the corpus (DML, DDL, transaction, `EXPLAIN` options, types). Concatenating the tokens' text returns the input unchanged. Highlighting applies to SQL blocks only; other languages render as plain monospace. Unit tests cover each token type, round-trip on every SQL block in `corpus/raw` (extracted from `<pre class="programlisting">`), and an input of 10,000 characters in under 20 ms.
3. Inline code: monospace, `--rail` background, 1 px `--rule` border, 5 px radius.
4. Long lines scroll inside the block (`overflow-x: auto`); the page never scrolls sideways (unchanged NFR-10 rule).

## 6. Content pages

`/eval` and `/how-it-works` use a top bar (logo, nav Ask, Evaluation, How it works, GitHub, theme toggle) instead of the rail, and a footer with the attribution line.

1. `/eval`: H1, lead, a row of run chips (date, chat model, judge model, "{n} questions · ${cost}"), then three sections: "Can you trust the answer?" (citation validity, faithfulness, injection resistance, correct refusal), "Does it find the right passage?" (recall@5, recall@10, MRR, each showing the without-rerank value or the rerank delta), "Speed, cost and misses" (latency p95, cost per answer, false refusal). Each card: label, value, a bar with the floor marker for gated ratios, and the caption "Floor {x} · {meaning}" or "Ceiling {x} · {meaning}"; a value past its gate shows the existing "Below floor" / "Above ceiling" text in `--danger`. The trend line (FR-46) stays under each card when there are two or more runs. Then the questions table with a segmented filter "All {n}" / "Misses only ({m})" and the existing columns and row expansion, and the results-file link.
2. `/how-it-works`: H1, lead, the four pipeline steps as a 4-column ordered list (2 columns below 1024 px, 1 below 640 px) with the step label in monospace, a title and one paragraph; then the existing sections as prose on the left and Privacy (`#privacy`) and Limits as cards on the right (stacked below 1024 px). Numbers still come from `lib/config.ts`.

## 7. Copy changes (byte-exact)

| Where | New text |
|---|---|
| Home H1 (welcome block) | `Ask the PostgreSQL docs.` |
| Home lead | `Get a direct answer with working SQL. Every sentence links to the passage it comes from, and every quote is checked before you see it.` |
| Composer placeholder, empty chat | `e.g. How do I find slow queries with EXPLAIN ANALYZE?` |
| Composer placeholder, after the first turn | `Ask another question about PostgreSQL 17` |
| Limit line under the composer | `{limit} questions per visitor per day. Suggested questions are answered instantly and do not count.` |
| Suggested questions heading | `Start with one of these` |
| Suggested question topic labels (in `lib/suggested.ts` order) | `Transactions`, `Indexes`, `Performance`, `Data types`, `Security`, `Maintenance` |
| Scope line under the suggestions | `Answers come only from 35 pages of the PostgreSQL 17 documentation. If the answer is not there, Sourced says so.` followed by the link `See how it is measured` to `/eval` |
| Header scope note | `Answers only from 35 pages of the PostgreSQL 17 docs` |
| Rail subtitle | `PostgreSQL 17 docs` |
| Rail button | `New chat` |
| Rail section label | `This session` |
| Rail privacy note | `Kept in this tab only. Reload or close it and the chat is gone; nothing is stored on the server.` |
| Rail empty state | `Your questions will appear here.` |
| Status pills | `Searching the docs…` → done `Searched 35 pages`; `Reading {n} passages…` → done `Read {n} passages`; `Writing the answer…`; `Checking citations…` |
| Source viewer counter | `Source {n} of {total}` |
| Source viewer link | `Open on postgresql.org` |
| Source viewer note | `Highlighted: the sentence the answer quotes.` |
| Answer actions | `Copy as Markdown`, `How this was answered` |
| `/eval` H1 | `How good are the answers?` |
| `/eval` lead | `Every change to search or prompts is tested against {n} hand-written questions: {answerable} the docs can answer, {unanswerable} they cannot, and {injection} that try to hijack the model. A run that falls below a floor fails CI.` |
| `/eval` section titles | `Can you trust the answer?`, `Does it find the right passage?`, `Speed, cost and misses`, `Every question` |
| `/eval` filter | `All {n}`, `Misses only ({m})` |
| `/how-it-works` H1 | `What happens when you ask` |
| `/how-it-works` lead | `Four steps run on the server for every question. The documentation itself was split, embedded and stored once, ahead of time.` |
| `/how-it-works` steps | `01 · SEARCH` "Two searches, one list"; `02 · RERANK` "The model picks six"; `03 · WRITE` "An answer with receipts"; `04 · CHECK` "Every quote is verified"; bodies as on the canvas, numbers from `lib/config.ts` |

The page `<title>`s stay as they are. Corpus-specific strings (35 pages, PostgreSQL 17, topic labels) live in `lib/copy.ts` or `lib/suggested.ts` (FR-74).

## 8. Out of scope for v1.1

"Ask next" follow-up suggestions (they need a model call or a prompt change and an eval run), a remaining-questions counter (the API does not return it), and storing the chat across reloads.

## 9. Acceptance

- Every artboard state of the canvas exists in the app in light and dark themes.
- E2E: the copy assertions follow section 7; new specs cover the chat history and New chat, the source viewer (open from chip and card, prev/next, Esc returns focus, external link attributes), the bottom sheet below 1024 px, SQL highlighting and Copy code. E2E-17 to E2E-20 and the T-40 specs pass in both themes.
- Unit: `tokenizeSql` as in section 5.
- First-load JS for `/` ≤ 180 KB gzip (TRD §22 command).
- Lint, typecheck, unit, integration and the full E2E suite pass; coverage thresholds hold.
- The demo GIF is recorded again on production after release.
