# Sourced

A small, production-quality RAG app and starter kit: every claim in the answer cites a passage, and every citation is checked on the server before you see it.

Implementation follows [the project specs](docs/PRD.md) and [progress ledger](docs/PROGRESS.md).

## Versions

Dependencies pinned on 2026-10-21. Node.js 22 or newer; pnpm 10.18.3.

## License

MIT. Copyright (c) 2026 Fırat Kıl.

## Local logs

For readable local JSON logs, run `pnpm dev | pnpm exec pino-pretty`.

## Corpus

The pinned PostgreSQL 17 corpus contains 35 pages and produces 201 chunks. Local mock ingestion is verified; live embedding validation is pending T-17. Raw pages and attribution are in `corpus/`.
