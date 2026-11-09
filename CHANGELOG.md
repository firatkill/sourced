# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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
