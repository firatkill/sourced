# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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

[1.0.0]: https://github.com/firatkill/sourced/releases/tag/v1.0.0
