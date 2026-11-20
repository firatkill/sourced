# Sourced v2.2–v2.3: the app redesign (integration plan)

Status: **approved by the owner on 2026-11-20** with the recommended answers in section 9 (D-140 to D-145). The tasks in section 8 are milestones M10 and M11 in `docs/IMPLEMENTATION_PLAN.md`.

Visual reference: the "Sourced v2 chat redesign" canvas (https://claude.ai/artifact/GkqjE78k4J4R7e7KRDVyWa). It has 11 artboards: empty state, chat with sources, phone, rename and projects, example first run, setup steps 1–4, Settings › Models and keys, and Settings › Appearance.

This plan extends `docs/REDESIGN.md` (v1.1) and overrides it where they differ:
- the rail becomes a chat and project sidebar;
- chats are stored (v1.1 section 8 listed this as out of scope);
- the theme toggle moves into Settings;
- `/eval` and `/how-it-works` move into the same shell.

Everything else in the PRD and TRD stays in force:
- the `/api/ask` request and SSE contracts;
- retrieval, citation verification, rate limits and CSP;
- the CLI and its JSON schemas;
- every NFR.

## 1. Goals

1. **Your own documents come first.** The PostgreSQL corpus is a quick-start example, not the product.
   - The UI never shows the corpus title ("My documents").
   - The UI shows facts from the index instead: "128 documents · updated 2 h ago".
2. **A real chat app.**
   - Chats are saved, listed in the sidebar, renamed and grouped into projects.
   - Follow-up questions work (FR-91).
3. **No terminal after the clone.**
   - `./sourced dev` opens a browser setup flow that covers: example or own documents, provider and key, adding documents, then confirming the cost and indexing.
   - The CLI stays complete for agents and scripts.
4. **Settings instead of `.env`.**
   - Keys, models and prices, the library, chat data and appearance are managed in the app.
   - There are five themes plus "Match my system".
5. **One coherent app.** Every page uses the same shell, tokens and copy rules.

## 2. Profiles decide what exists

| Feature | `local` | `private` | `public-demo` |
|---|---|---|---|
| New shell, themes, empty-state rules | yes | yes | yes |
| Saved chats and projects | yes | yes (one shared space) | no: chats stay in the tab, as today |
| Follow-up questions (FR-91) | yes | yes | yes (turns sent from the browser, not stored) |
| `/setup` | yes | no | no |
| `/settings` (keys, models, library, chat data) | yes | no | no |
| `/settings/appearance` | yes | yes | yes (browser only) |
| Open the original file from a source | yes | yes | no (sources link to their URL) |

The public demo keeps its promise that questions are not stored on the server. The routes for setup and settings do not exist outside `local`: they return 404 in middleware, not just a hidden link.

## 3. Copy rules (replaces the corpus-title templates)

These rules fix the doubled copy seen in `lib/kit/copy.ts`: "Ask My documents", "Answers come only from Answers from your own documents".

1. **Own documents.** When the configuration has no `copy` block, which is the case after `reset` and for any user corpus, the UI uses fixed generic copy and never interpolates `corpus.title` or `corpus.description`:
   - H1: "What do you want to know?"
   - Lead: "Answers come only from your documents. Every claim links to the passage it came from, checked before you see it."
   - Placeholder: "Ask about your documents"; after the first turn, "Ask a follow-up".
   - No suggested-questions block.
2. **Example and hosted demo.** The example corpus (and the hosted demo) keeps its `copy` block: hero, suggestions, scope lines. In `local` with the example loaded, a banner explains how to switch to your own documents (Example artboard).
3. **Library facts** come from the database, not from config:
   - document count;
   - top-level folders, or hosts for URLs;
   - time of the last successful ingest.
   They are shown as a pill in the header and as one line under the composer.
4. `document.title` is "Sourced", or the chat title on a chat page.

## 4. Data model (local and private profiles)

New migration, additive only:

```
projects (id uuid pk, name text not null, description text, created_at, updated_at)
chats    (id uuid pk, project_id uuid null references projects on delete set null,
          title text not null, title_source text check in ('auto','user'),
          created_at, updated_at, pinned boolean default false)
turns    (id uuid pk, chat_id uuid references chats on delete cascade, position int,
          question text not null, standalone_question text,
          answer jsonb not null,      -- final answer text, citations, passages snapshot, meta, cost
          status text check in ('done','not_found','stopped','error'),
          created_at)
```

Design choices:
- **Snapshots.** Turns store the passages they cited. A chat therefore still reads correctly after a re-ingest or `reset`. If the document is gone, the source viewer shows "This document is no longer in your library" instead of an "Open file" button.
- **Titles.** A chat's title is the first question, cut to 60 characters (`title_source = 'auto'`). Renaming sets `'user'`. No model call is used to generate titles.
- **Search.** "Search chats" is `ILIKE` over titles and questions. Full-text search can come later.
- **What `reset` keeps.** `reset` keeps chats and projects. A new `reset --chats` removes them, and Settings › Chats and data has "Delete all chats". `query_log` and its privacy rules are unchanged.

## 5. Server surface

All new routes are local-profile only (private where section 2 says so), same-origin, and JSON or SSE. They live in route handlers so the CLI and the app share the `lib/` functions.

| Route | Purpose | Reuses |
|---|---|---|
| `GET/POST /api/chats`, `GET/PATCH/DELETE /api/chats/:id` | list (grouped by day on the client), create, rename, move, pin, delete | new `lib/chats/*` |
| `GET/POST /api/projects`, `PATCH/DELETE /api/projects/:id` | projects | `lib/chats/*` |
| `POST /api/ask` | unchanged contract plus optional `chatId` and `history` (last 4 turns: question and answer text). When `chatId` is set, the finished turn is saved server-side. | `lib/generation/*` |
| `GET /api/library` | library facts for the header, empty state and Settings › Library | `documents`, `ingest_runs` |
| `GET /api/files/:documentId` | streams the original local file (PDF opens at `#page=n`) | path containment under the configured source roots; no symlink escape |
| `POST /api/setup/*`, `/api/settings/*` | see section 6 | `provider-checks.ts`, `saveConfig`, `runAdd`, `runReset`, ingest |
| `GET /api/ingest/:runId/events` | SSE progress for the setup and Settings flows | `ingest_runs`, `ingest_items` |

Follow-ups (FR-91): when `history` is present, one extra chat-model call rewrites the question into a standalone question before retrieval. The rewrite is shown under the turn as "Searched for: …". Retrieval, the answer prompt and citation checks still run on that single question. This is a prompt change, so it needs a new eval run with the golden-set floors unchanged, plus a follow-up subset (6 to 10 two-turn cases) added to the golden set.

## 6. Setup and Settings mechanics

**Boot without a key.**
- `./sourced dev` no longer needs `.env.local`. The launcher creates an empty one (mode 0600), generates `SOURCED_SETUP_TOKEN` and prints the one-time link.
- `scripts/app-startup.ts` and `getEnv()` accept a missing provider key in `local`. The app then starts in setup mode: every page redirects to `/setup` until a key check passes and an index exists.
- `./sourced setup` prints a new link at any time.

**Security** (the setup and settings APIs can spend money and write secrets):
1. The port is already bound to `127.0.0.1`. The app also rejects requests whose `Host` is not `localhost:<port>` or `127.0.0.1:<port>`, which blocks DNS-rebinding attacks.
2. The one-time token is exchanged for an `HttpOnly`, `SameSite=Strict` cookie. Every mutating request also needs a matching `Origin`.
3. Keys:
   - are written atomically to `.env.local`;
   - are set in `process.env` of the running server, followed by `resetEnvForTests()`-style cache resets (made a public `reloadEnv()`);
   - are never returned to the browser, where they are masked as `sk-…a91F`;
   - are redacted from logs.
4. Nothing goes to a provider before an explicit confirm. The only exception is the key check, which uses the free list-models call.
5. `DATABASE_URL` and the ports stay in `.env.local` and are not editable in the UI.

**Models and prices.**
- Settings writes through the existing `saveConfig()`. It rewrites `sourced.config.ts` and the snapshot exactly as `add` and `reset` do, then calls `setCliKitConfig`/cache resets so the running app picks up the change without a restart.
- Changing the embedding model triggers the CORPUS_MISMATCH flow as a button: dry-run estimate, then confirm, then rebuild. Until the rebuild finishes, the old index keeps answering.

**Documents.**
- **Upload.** Files arrive by multipart upload to `my-docs/<relative path>`.
- **Limits.** Uploads must fit the existing parser types (PDF, DOCX, MD, HTML, TXT) and the existing size limits. Unsupported files are listed as skipped.
- **Registering the folder.** The first upload adds `my-docs/` as a source through `runAdd`. URLs go through `runAdd` too.
- **Large folders.** For these the UI points to `./sourced add <path>`. The browser cannot hand the app a host path.

**Ingest from the browser.**
- The server runs the CLI in-process via the same `runIngest` path the CLI uses, with `--yes` semantics, and records the run in `ingest_runs`.
- Progress is read from `ingest_runs` and `ingest_items`, so closing the tab does not stop the run and reopening shows its state.
- One run at a time: a second request returns the running run's id.

**Themes.**
- Five token sets: Graphite (today's dark), Paper (today's light), Midnight, Linen and High contrast. They live under `[data-theme=…]` in `app/globals.css`, plus "system", which maps to Paper or Graphite.
- Code-block and SQL colours get a value per theme.
- The choice is stored in `localStorage` (`sourced-theme`, same key as today), and the inline head script is extended to the new values.
- Text size (S, M, L) is a root `font-size` step.
- Every theme passes a contrast unit test over the token table: text tokens (`ink`, `ink-2`, `ink-3`) on `ground`, `rail` and `surface`, and every foreground/background token pair (`accent-ink`/`accent`, `accent-soft-ink`/`accent-soft`, `user-bubble-ink`/`user-bubble`, `ink`/`quote`, `ok`, `warn`, `danger` on their `-soft`, `--code-ink` and every `--sql-*` colour on `--code-bg`) at 4.5:1, and `accent` on `ground` at 3:1. Borders (`rule`, `rule-strong`) are not in the test: Paper and Graphite keep their current values (about 1.45:1), and raising input-border contrast is a separate decision.

## 7. Pages and components

| Route | Artboard | Main components (new or reworked) |
|---|---|---|
| `/` | Empty state / Example | `AppShell`, `Sidebar` (projects, grouped chats, search, inline rename, context menu with Move to project), `EmptyState`, `ExampleBanner`, `Composer` (scope pill hidden until project scope ships) |
| `/c/[chatId]` | Chat with sources | `Thread` (restores turns from the DB), `SourceList` (file name, page, section), `SourceViewer` ("Open at page n" for files, "Open on …" for URLs), `NotFoundNote` |
| `/p/[projectId]` | Rename and projects | `ProjectPage` (title, description, New chat in project, chat list) |
| `/setup` | Setup 1–4 | `SetupStepper`, `DataChoice`, `ProviderKey`, `DocumentDrop`, `CostConfirm`, `IngestProgress` |
| `/settings`, `/settings/library`, `/settings/appearance`, `/settings/data` | Settings, Appearance | `SettingsNav`, `ProviderRow`, `ModelSelect`, `RebuildNotice`, `SaveBar`, `ThemePicker`, `TextSize` |
| `/eval`, `/how-it-works` | — | move into `AppShell`. `/eval` shows "No evaluation for your documents yet. Run `./sourced eval generate`" when the results belong to another corpus. `/how-it-works` copy gets the same no-title rule. |

The phone layout follows the Phone artboard: the sidebar sits behind the menu button, sources are a horizontal chip row, and the source viewer is a bottom sheet (as in v1.1). First-load JS for `/` stays ≤ 180 KB gzip, so Settings and Setup are separate route chunks.

## 8. Tasks

One task is one branch and one pull request. Codex writes the code; each PR passes `verify-fresh.sh` before push.

**M10: the chat app (release v2.2.0)**

| Task | What | Acceptance |
|---|---|---|
| T-79 | Themes: five token sets plus system, the text-size step, the head script and contrast unit test; Settings › Appearance page and its link from the sidebar | Contrast test passes for all themes; `theme.spec` covers switching and persistence; no visual change in the default theme |
| T-80 | Copy rules of section 3 and `GET /api/library`; empty state without suggestions; example banner; fix `/how-it-works` copy | E2E: own-docs corpus shows no corpus title anywhere (grep the rendered HTML for `config.corpus.title`); example shows banner and suggestions |
| T-81 | Migration plus `lib/chats` (projects, chats, turns) with integration tests; `reset --chats` | IT: create, rename, move, delete cascade; snapshots survive `reset` |
| T-82 | `/api/chats`, `/api/projects`; `/api/ask` gains `chatId` (saved turns) and profile gating | Contract tests: 404 in public-demo; ask schema unchanged without the new fields |
| T-83 | `AppShell` and `Sidebar` (groups, search, inline rename, menu, move, delete with confirm), routes `/c/[id]`, `/p/[id]` | E2E: create, rename, move and delete a chat; reload keeps it; keyboard-only path; axe clean |
| T-84 | Thread restore, `SourceList` with file metadata, `GET /api/files/:id` and "Open at page n"; missing-document state | E2E with a fixture PDF; path-traversal unit tests for the file route |
| T-85 | Follow-ups (FR-91): `history` in the request, standalone rewrite, "Searched for" line, follow-up golden cases | Eval run passes floors (owner approves the run's cost first); E2E two-turn chat |
| T-86 | `/eval` and `/how-it-works` in the shell; eval empty state for other corpora | Existing eval and how-it-works specs updated and passing |
| T-87 | Docs and release: PRD §9 copy, TRD sections, D-rows, README screenshots, CHANGELOG, demo GIF; public demo smoke test | v2.2 release checklist |

**M11: setup and settings in the browser (release v2.3.0)**

| Task | What | Acceptance |
|---|---|---|
| T-88 | Boot without a key: launcher writes an empty `.env.local` and a setup token and prints the link; setup mode in `app-startup.ts` and `getEnv`; `./sourced setup`; Host and Origin checks | Contract tests for both launchers; a request with a foreign `Host` is rejected |
| T-89 | Setup APIs: token cookie, data choice (example or own → `runReset`), key check and save (`reloadEnv`), upload to `my-docs/`, add URL, estimate (dry run), start ingest, SSE progress | Contract tests per route; the key never appears in any response or log line (test greps logs) |
| T-90 | `/setup` UI, steps 1–4 | E2E on a fresh mock checkout: dev → setup → cited answer without touching the terminal again |
| T-91 | Settings › Models and keys: provider rows (OpenAI, Anthropic, Gemini, Ollama), model selects with prices, save bar, embedding change → rebuild flow | E2E: switching the chat model takes effect without restart; embedding change shows the estimate and rebuilds |
| T-92 | Settings › Library (sources, add, remove, re-ingest, remove example) and Chats and data (export as Markdown, delete all) | E2E per action |
| T-93 | Docs, skills and release: README quick start becomes "`./sourced dev`, then follow the browser"; `sourced-setup` skill offers the browser path first and keeps the CLI path; newcomer rehearsal on a clean machine | v2.3 release checklist; newcomer transcript reaches a cited answer |

## 9. Decisions (approved, D-140 to D-145)

1. **Release split.** Ship the chat app as v2.2 and setup and settings as v2.3 (recommended), or both together as one release.
2. **Public demo.** It gets the new shell and themes, with no saved chats, setup or settings (recommended).
3. **Follow-ups.** They are part of the chat flow (T-85) and change the prompt path, so they need an eval run on the live provider. The cost estimate will be shown before the run.
4. **Project search scope** (search only some folders). Not in this plan; propose it after v2.3.
5. **`reset` and chats.** `reset` keeps chats by default; `reset --chats` and Settings delete them (recommended).
6. **Model-written chat titles.** None for now (first question as title, no extra model call).

## 10. Risks

- **Secrets through a web UI.** Mitigated by the localhost-only binding, Host and Origin checks, the one-time token and local-profile-only routes. It needs its own security review before v2.3 ships.
- **Hot-reloading env and config inside a running Next server.** Module caches must all reset. T-88 adds a test that changes the chat model through the API and asserts the next answer's `meta` uses it.
- **Copy assertions.** Many E2E specs assert PRD §9 strings. T-80 and T-87 update them together with the PRD, so CI stays the source of truth.
- **Bundle size.** The sidebar and the persistence code add to `/`. Settings and Setup must be separate chunks; the 180 KB check runs in every M10 PR.
