---
name: sourced-ingest
description: Run or resume Sourced ingestion, refresh changed documents or explain an index rebuild, with a dry run, provider and cost approval, and a plain-language health report.
---

Read [shared rules](../_shared/rules.md) and [CLI reference](../_shared/cli-reference.md) first. They govern every step below.

## When to use

Use for “index my docs”, “resume ingestion” or “refetch the docs” on an initialized installation with registered sources. Use `/add-docs` for new sources.

## Before you start

Work in the repository root. Use the established launcher: `./sourced` on macOS/Linux, `sourced.cmd` on Windows, or `pnpm sourced` with identical arguments on the chosen Node path. Read provider roles and source IDs from configuration, never secrets from `.env.local`.

For every command, require one JSON envelope with `$.schemaVersion` 1, matching `$.command`, `$.ok` and exit 0; explain `$.warnings[].message`. Missing/malformed JSON means stop, report command and exit, and fix the launcher prerequisite. Exit 1 stops dependent work; exit 2 requires the named user action; exit 130 means interrupted: preserve completed work and offer resumption, default stay stopped.

Apply these branches throughout: `CONFIG_INVALID` or `VALIDATION_FAILED` means correct the named setting, source, argument or connection; missing secrets are entered by the user only in the named `.env.local` line. Robots refusal means select an allowed source. `CORPUS_EMPTY` means add usable documents before retrying. `CORPUS_MISMATCH` and `NEEDS_CONFIRMATION` follow the steps below. `PROVIDER_ERROR` or `PROVIDER_TIMEOUT` means the model service failed: explain it and offer a retry only after renewed cost approval. `INTERNAL_ERROR` or an unexpected code means stop and report a possible CLI bug, including command, exit and code; never patch application code.

## Steps

1. **Choose scope and recovery mode.** Default to all registered sources; use `--source "<id>"` on both preview and run only when the user requests one source.

   <!-- sourced-command: ingest -->

   A normal rerun resumes the latest compatible interrupted/failed run and preserves completed documents. Do not add `--restart` automatically: explain that it abandons the checkpoint for resumption and starts a new run considering all discovered documents; it does not mean deleting source files. Use it only after the user's yes. When the user wants fresh web content, add `--refresh` to preview and run; it uses conditional requests and robots rules. For cached-only work use `--offline`; missing cached documents are failures, not permission to fetch.

   On `CORPUS_MISMATCH`, explain that indexed model, dimensions or language differs from configuration. Offer restoring the matching configuration or a rebuild. A rebuild replaces the index and re-embeds every document, costing again. Wait for a yes to that action before adding `--rebuild`; do not combine a whole-corpus rebuild with a source-only promise. After that yes, preview with `./sourced ingest --dry-run --rebuild --yes --json`: the CLI requires the confirmation flag even for this preview. Obtain separate approval for its estimated cost before the real run. If preview fails, stop rather than attempting a paid rebuild without an estimate.

2. **Always preview, including before resumption.** Say: “I’ll preview the documents and embedding work without sending text to a model provider; website sources may be fetched.” Run `./sourced ingest --dry-run --json`, adding only the scope/mode flags agreed above.

   <!-- sourced-command: ingest -->

   Require `result.mode` to be `dry-run`. Report `result.totals.documents.discovered`, `result.totals.documents.done`, `result.totals.documents.skipped`, `result.totals.documents.failed`, `result.totals.chunks.new`, `result.totals.chunks.changed`, `result.totals.chunks.unchanged`, `result.totals.chunks.deleted`, `result.totals.embeddingTokens` and `result.totals.estimatedCostUsd`. Identify affected sources through `result.sources[].id` and `result.sources[].skipped[].reason`. Null cost means unknown: follow [unknown prices](../_shared/pricing.md) before the approval question. Non-OpenAI token estimates are approximate. If nothing is usable, stop and fix the source.

   Name the embedding provider receiving document text (and questions during later search), and the chat/rerank providers that receive questions and passages during later answers. Explain this estimate covers embedding, not future questions; offer all-local Ollama if required. In an explicitly confirmed mock session say no provider is contacted and quality is not representative, retaining any unknown estimate as unknown. Ask: “May I index these documents at this estimate with these providers? Default: wait.” Wait for a yes even when the CLI itself would not ask.

3. **Run or resume.** Run `./sourced ingest --json` with the same approved scope/mode flags. For an approved destructive rebuild use `./sourced ingest --rebuild --yes --json` after step 2's approval.

   <!-- sourced-command: ingest -->

   If `NEEDS_CONFIRMATION` names a cost threshold or unknown price, explain that reason and ask for another yes before repeating with `--yes`. If it names a missing database setting, have that setting corrected instead; an approval flag cannot fix it. Changed sources/settings require a new preview and cost approval. Apply all failure branches above. After interruption offer the same command without `--restart`, preceded by another preview and yes.

   Require `result.mode` to be `run`. Explain `result.runId`, `result.corpusVersion`, the document/chunk/token/cost totals from step 2 and `result.totals.boilerplateRemoved`. An estimate is not a bill. Summarize per-source failures and skips even when the command exits 0; do not call incomplete indexing complete.

4. **Inspect the first ingest and any run with failures or skips.** Say the health check writes a local report and makes no provider calls. Run `./sourced inspect --json` (add the same source scope when appropriate).

   <!-- sourced-command: inspect -->

   Give `result.path`; summarize `result.sources[].id`, `result.sources[].documents`, `result.sources[].chunks`, `result.sources[].smallestChunkTokens` and `result.sources[].largestChunkTokens`. For each `result.findings[].code` and `result.findings[].severity`, explain `result.findings[].affects` and `result.findings[].fix` in plain words: what search, citations or cost suffers, and what the user can do. Attribute source-specific issues using `result.findings[].sourceId`. OCR means a scanned PDF needs text extraction outside Sourced. Diagnostic findings can accompany exit 0; explain them rather than claiming “all clear.” Apply the common failure branches. Offer `/check-quality` after findings are resolved or explicitly accepted.

## Never

Do not discard checkpoints, rebuild, raise cost limits or ignore failed documents to get a successful-looking run. Never treat a retry as free or as already approved if its cost/scope changed.

## Done when

The approved run finished or its interruption/blocker is clearly reported; counts, cost and required health findings are explained, with remaining work identified.
