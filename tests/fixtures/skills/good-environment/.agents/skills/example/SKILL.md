---
name: example
description: Guide the user through CLI checks.
---

## When to use

For checking setup.

## Before you start

Read the shared rules.

## Steps

<!-- sourced-command: doctor -->

1. Run `./sourced doctor --json --no-network`.
2. Read `result.checks[].ok` and `result.checks[].fix`.
3. Explain `CHECKS_FAILED` and the next action.
4. Run `pnpm sourced init --chat openai:example --embed openai:example:1536 --json`.

## Never

Expose secrets.

## Done when

Checks pass.

Fill `OPENAI_API_KEY=` in `.env.local`; review `LLM_MODE`, `SOURCED_ACCESS_TOKEN`,
`INGEST_CONFIRM_ABOVE_USD`, `SOURCED_DOCKER`, `SOURCED_PORT`, `SOURCED_UID`,
`VERCEL_BRANCH_URL`, `PROMPT_VERSION` and `RETRIEVAL.VECTOR_CANDIDATES`.
Run `pnpm install --frozen-lockfile` or `docker compose up --build`.
In prose, --not-a-sourced-flag belongs to another tool.
Run `pnpm install --frozen-lockfile` too.
Use `--no-network` or `--json` for the diagnostic command.

```text
`--literal-in-a-fence`
```
