# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.4.0] - 2026-11-20

Project search scope, a Library link in the example banner, and dependency updates.

### Added

- A project can limit its chats to some library sources (**Search in** on the project page); the server applies the limit to both search rankers (D-150, migration `0005_project_scope`).

### Changed

- The example banner links to Settings › Library instead of showing terminal commands (D-151).
- `next` 15.5.29, plus pnpm overrides for development-only `hono`, `@hono/node-server`, `minimatch`, `esbuild` and `body-parser`; `pnpm audit` reports no known vulnerabilities.

## [2.3.0] - 2026-11-20

Setup and Settings in the browser, on top of v2.2 (saved chats, projects, follow-up questions, themes) and v2.1 (one-key local first run). v2.1 and v2.2 were not released on their own, so their changes are listed here too; the `v2.2.0` tag marks the chat app.

### Added

- Setup in the browser: `./sourced dev` starts without `.env.local` and prints a one-time setup link. The browser walks through the data choice, the provider key (checked with one free request, saved in `.env.local`), your documents (upload files or a folder, or add a web page) and a cost confirm, then shows indexing progress. An **Advanced settings** section on the provider step picks the answer, quality-check and embedding models before anything is indexed. `./sourced setup` prints a new link.
- Settings, in the local profile: **Models and keys** (replace or remove keys, check Ollama, switch the answer and quality-check models without a restart, and change the embedding model with a rebuild estimate first), **Library** (sources, add, remove, re-index, remove the example) and **Chats and data** (download a chat as Markdown, delete all chats).
- Saved chats: the sidebar lists your chats by day with search, rename, pin, delete and projects; a chat reopens exactly as it was answered, even after a re-ingest. `./sourced reset --chats` removes them. The hosted demo keeps chats in the tab only.
- Follow-up questions: a question that refers back ("Can it also be unique?") is rewritten into a standalone question before searching, and the answer shows what was searched for.
- Citations of your own files open the original document, PDFs at the cited page.
- Five themes (Graphite, Paper, Midnight, Linen, High contrast) plus "Match my system", and a text size, under Appearance.
- `GET /api/library` and the header line "{n} documents · updated …".

### Changed

- The local app answers only `localhost`, `127.0.0.1` and `[::1]` hosts (plus `ALLOWED_ORIGINS`), and refuses a mutating request whose `Origin` names another host. Setup and Settings also need the cookie the setup link sets.
- A local app with nothing indexed opens setup instead of an empty chat.
- With your own documents the app no longer shows the corpus title ("My documents") anywhere and shows no empty suggestions block; the PostgreSQL example explains how to switch to your own documents.
- `/eval`, `/how-it-works` and Appearance use the same sidebar as the chat. `/eval` reads `eval/<corpus>/results`, so your own documents never show the example's evaluation.
- The golden set has six follow-up cases (46 questions); the latest live run passes every floor.

- Simpler first run: copy `.env.example` to `.env.local`, paste one API key, then `./sourced ingest` and `./sourced dev`. The shipped configuration uses the `local` profile, and every other setting has a default.
- The PostgreSQL example stays the default source, but the database starts empty; `./sourced reset` removes the example and everything indexed so you can add your own documents.
- The README is short and covers running locally; architecture, evaluation, the Node path and the hosted example's operation moved to `docs/GUIDE.md`.

### Removed

- The `/deploy` agent command and its skill. Hosting is left to the user; the `deploy:check` command remains.

### Fixed

- Two checkouts on one machine no longer share a database: each checkout records its own Docker Compose project in `.env` (an upgraded checkout keeps its existing data).
- `ingest --dry-run` warns when the existing index was built with a different embedding model and estimates the rebuild; `ingest` asks before rebuilding instead of stopping with raw JSON.
- `./sourced dev` reports why the app did not start and what to run next, instead of exiting with no output.
- Hints on the Docker path name `./sourced` (or `sourced.cmd`), never `pnpm sourced`.

## [2.0.0] - 2026-11-14

The document chatbot kit. Live at https://sourced.firatkil.com (the example corpus).

### Added

- Validated `sourced.config.ts` for corpus copy, sources, language, models, pricing, retrieval settings and deployment profiles. Separate chat and embedding providers: OpenAI, Google Gemini, Anthropic (chat only) and Ollama.
- Folder/glob, URL-list, sitemap, same-origin crawl and local Git sources; Markdown/MDX, HTML, PDF, `.docx` and text parsers. Resumable ingestion, boilerplate removal and cost previews without embedding calls.
- A shared CLI with versioned `--json` results, documented exit codes, prerequisite checks, initialization, source management, ingestion, traced questions and deployment checks. Existing script names remain aliases.
- Docker path with macOS/Linux and Windows launchers, persistent database data, read-only mounts for external folders and configurable localhost ports.
- Corpus health reports, generated and user-reviewed golden questions, evaluation and baseline comparisons.
- Seven portable agent skills and command pointers: setup, add-docs, ingest, check-quality, tune, troubleshoot and deploy.
- `private` profile with a shared access token, a first-party access cookie and rate-limited failed access attempts; `local` and `public-demo` profiles remain available.

### Changed

- Root `AGENTS.md` now guides kit users. Contributor rules live in `docs/contributing/AGENTS.md`, linked from `CONTRIBUTING.md`.
- Existing deployments must apply `0003_kit.sql` before using the kit: it adds corpus metadata, source and PDF-page fields, ingestion checkpoints and the CLI query-log source, and scopes chunk hash uniqueness to each document. Embedding dimensions and full-text configuration are managed by the kit; a changed embedding model or dimensions requires re-ingestion. In v2.0, migrate and ingest hosted databases from the Node path with both database URL variables set in `.env.local`; the Docker CLI uses its local database (D-135).

### Notes

- The newcomer release check passed in Claude Code 2.1.322 and Codex CLI 0.166.0 on fresh clones with only Docker (`qa/release-v2/`). Cursor and other agents that read `AGENTS.md` and Agent Skills are best effort (NFR-24). Codex's default sandbox cannot reach the Docker socket; Codex asks to run `./sourced` outside it.
- The Docker path is verified on macOS only; the Windows launcher, Linux and container access to host Ollama are not verified yet. Live provider checks for Google Gemini, Anthropic and Ollama remain pending.
- Known follow-ups: the first Node CLI command in a fresh folder can fail on missing `CHAT_MODEL`/`PRICE_*` settings before a configuration snapshot exists; MongoDB HTML can retain navigation icon names and produce many tiny chunks; broad full-text queries at scale have not met the search latency target. Source discovery request spacing also needs follow-up. See `docs/PROGRESS.md` for evidence.
- Known issue: on some corpora the default chat model (`gpt-6-luna`) answers out-of-scope questions with "The passages do not describe …" followed by a cited answer instead of refusing (correct refusal 0.57 on the Flask docs; 1.0 on the example corpus). A stronger chat model is the configuration-level workaround. The live evaluation comparison for contextual embedding (FR-75) has not been run.
- Mock evaluation cannot write a baseline results file, so a full tuning comparison needs live evaluation. Follow-up conversation, an MCP server, a documented HTTP API/widget and dedicated rerankers are deferred to v2.1.

## [1.1.0] - 2026-11-09

Chat redesign (D-91, `docs/REDESIGN.md`). Backend, prompts, retrieval and the SSE contract are unchanged.

### Added

- Chat layout for the ask page: a rail with the questions asked in this tab and New chat, a conversation column, and a composer fixed to the bottom. History lives only in the open tab; nothing new is stored.
- Source viewer: a side panel (a bottom sheet below 1024 px) that shows the cited passage with every verified quote marked, previous and next across the answer's sources, and a one-click "Open on postgresql.org" link to the exact section.
- SQL highlighting in answers with an in-house tokenizer (no new dependency), code blocks with a language bar and Copy code.
- Verification badge on each answer ("n of n citations checked against the docs") and a summary line with candidate counts, passages read and total time.
- Welcome block with six topic-labelled suggested questions.

### Changed

- New colour tokens for light and dark themes, Inter and JetBrains Mono fonts.
- Citation chips show the number only; source cards replace the old sources panel.
- `/eval` redesigned with run chips, grouped metric cards with floor and ceiling bars, and a Misses only filter; `/how-it-works` redesigned with a four-step pipeline and Privacy and Limits cards.
- Demo GIF recorded again on the redesigned production app.

## [1.0.0] - 2026-11-09

First public release. Live at https://sourced.firatkil.com.

### Added

- Ask page: a question about the PostgreSQL 17 documentation (35 pages) gets a streamed answer in which every claim cites a passage.
- Hybrid retrieval in one SQL statement: pgvector cosine top 40 and Postgres full-text top 40, merged with Reciprocal Rank Fusion (k = 60), top 20 reranked by the chat model, top 6 passages used for the answer.
- Server-side citation checks: each `[P#]` must point to a retrieved passage and its supporting quote must appear in that passage after normalization. Invalid citations are removed; with none left, the visitor sees "I couldn't find this in the PostgreSQL docs."
- Custom SSE endpoint `POST /api/ask` with `meta`, `token`, `citations` and `done` events, heartbeat, stop, and the error, network, rate-limited, not-found and demo-mode states.
- Sources panel with highlighted quotes, citation chips that move focus to their source, "How this was answered" disclosure with the ranking table, and copy as Markdown.
- Precomputed answers for the six suggested questions, served from the database without LLM calls or quota use.
- Per-visitor and global daily rate limits in Postgres with salted, daily-rotating IP hashes; no cookies, no analytics, no stored question text.
- Evaluation harness: 40 golden questions (32 answerable, 5 unanswerable, 3 injection), retrieval, citation, faithfulness (LLM judge), refusal, injection, latency and cost metrics, floors and regression checks, a budget guard, and the `eval.yml` workflow.
- `/eval` page with metric cards, trends and per-question results, and `/how-it-works` page with the pipeline diagram, privacy and limits.
- Light and dark themes, keyboard operation, visible focus, reduced motion, WCAG 2.2 AA checks with axe, layouts from 360 px to 1920 px.
- Security: per-request CSP nonce, strict headers, Zod at every boundary, enforced module boundaries, origin checks.
- Deployment on Vercel Hobby (`fra1`) and Supabase free (Frankfurt), with `migrate.yml` and a `keepalive.yml` health ping every third day.
- Mock mode (`pnpm dev:mock`) so the app runs locally without an API key.

[1.1.0]: https://github.com/firatkill/sourced/releases/tag/v1.1.0
[1.0.0]: https://github.com/firatkill/sourced/releases/tag/v1.0.0
