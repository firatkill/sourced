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
3. Explain `UNKNOWN_ERROR` and the next action.
4. Run `pnpm sourced init --chat openai:example --embed openai:example:1536 --json`.

## Never

Expose secrets.

## Done when

Checks pass.
