---
name: sourced-tune
description: Try one evidence-backed Sourced configuration change, compare evaluation with a baseline, and keep or revert it when the user wants better answer quality.
---

Read [shared rules](../_shared/rules.md), [CLI reference](../_shared/cli-reference.md) and [unknown prices](../_shared/pricing.md) first.

## When to use

Use after `/check-quality` has identified a concrete quality problem. This is a configuration experiment, not permission to change prompts or application code.

## Before you start

Work in the repository root on the established Docker path (`./sourced`, or `sourced.cmd` on Windows) or chosen Node path (`pnpm sourced`, same arguments). Preserve the exact pre-edit contents of `sourced.config.ts`, including the user's uncommitted changes. Never read `.env.local`.

Require one JSON envelope with `$.schemaVersion` 1 and matching `$.command`. Explain `$.warnings[].message`. Missing/malformed JSON stops the flow: report command/exit and fix the launcher prerequisite. Exit 0 and `$.ok` mean command success, not proof of quality. Exit 1 stops dependent work except reading a completed failed eval report; exit 2 needs user action; exit 130 means interrupted, stop and offer recovery.

Throughout: `CONFIG_INVALID` or `VALIDATION_FAILED` means correct the named setting, argument or golden-set problem, never weaken a check. `CORPUS_EMPTY` routes to `/ingest`; `CORPUS_MISMATCH` requires the restore-or-rebuild decision in `/ingest`, never an automatic rebuild. `NEEDS_CONFIRMATION` requires the named prerequisite or cost approval before retrying with `--yes`; a missing setting is not fixed by that flag. `PROVIDER_ERROR` or `PROVIDER_TIMEOUT` needs a separately approved paid retry. `RETRIEVAL_ERROR` routes to `/troubleshoot`. `INTERNAL_ERROR` or an unknown code stops: explain it and suggest opening an issue with the command, exit and code (no secrets). `CHECKS_FAILED` on eval follows step 4. Any failed experiment must reach the rollback decision in step 5.

## Steps

1. **Establish evidence and a baseline before editing.** Read the quality report and its health findings; if needed run `./sourced inspect --json`, explaining that it writes a local report without provider calls.

   <!-- sourced-command: inspect -->

   Read `result.path`, `result.findings[].code`, `result.findings[].affects` and `result.findings[].fix`. For example, `tiny_chunks` supports a chunking experiment; it does not prove the cause.

   <!-- sourced-command: eval -->

   Use `result.failures[].likelyCause` from the prior eval as a hypothesis (null means unknown). Ask for an existing full eval results file, normally `eval/<corpus-name>/results/<YYYY-MM-DD>[-N].json` (date with a collision suffix, not the timestamp run ID), or the literal selector `baseline` (latest committed result with Git; newest valid on-disk result without Git). Prefer an explicit file so the reference cannot move. It must cover the same corpus, golden questions and provider mode. An envelope or its summary is not a full baseline: the saved file includes per-question records.

   If none exists, use `/check-quality` to obtain a valid user-reviewed set, run `./sourced eval --validate-only --json`, then disclose embedding/chat/rerank/judge providers, what questions/passages/reference answers they receive and estimated cost; wait for a yes before `./sourced eval --json`. Resolve missing prices through the shared pricing guide first; there is no eval dry-run. Keep the resulting report even if floors fail. A seven-document mixed-folder example cannot generate the required 20 answerable questions at two per document; add substantive documents, never duplicate questions or lower minimums.

   Mock rehearsals require `./sourced eval --no-write --json`; they save no results file. A mock summary cannot be reused directly with comparison. Require a valid full baseline fixture supplied for the rehearsal, or report that baseline creation is blocked; never invent per-question records or claim mock metrics measure model quality.

2. **Propose exactly one setting and get a yes.** Choose from `overrides.chunking`, `overrides.retrieval`, `overrides.contextualEmbedding`, or a configured model role such as `models.rerank`, using the evidence. Respect TRD §29 bounds and cross-field rules. Chunking or embedding changes require re-ingestion plus eval; retrieval candidate counts and reranker changes require eval only. Explain the old/new value, expected effect, providers, data exposure, estimated cost (unknown is not free), and possible rollback ingestion cost. Offer all-local Ollama if required. Resolve pricing as a separate approved prerequisite before capturing the experiment baseline; do not bundle pricing and tuning changes. Ask for a yes, default wait. Then edit only the agreed setting in `sourced.config.ts` and show the diff. Leave prompt version and prompt-related copy unchanged.

3. **Re-index only when needed.** For changed chunks or embeddings, follow `/ingest`: run `./sourced ingest --dry-run --json`, explain the preview and get a fresh yes before `./sourced ingest --json`. A mismatch/rebuild uses that skill's explicit destructive approval and whole-corpus preview, not a silent flag. If any documents fail, stop the experiment and explain recovery.

   <!-- sourced-command: ingest -->

   Read `result.mode`, `result.totals.documents.failed`, `result.totals.chunks`, `result.totals.embeddingTokens` and `result.totals.estimatedCostUsd`; null cost follows the shared pricing guide. Preserve identical source scope between preview and run. Retrieval-only changes skip ingestion.

<!-- sourced-command: eval -->

4. **Compare after separate eval approval.** Restate providers, data sent and estimate, preserving the budget guard; wait for a yes. Run `./sourced eval --compare "<baseline-file-or-baseline>" --json`. In a confirmed mock rehearsal retain `--no-write` on this and any retry.

   <!-- sourced-command: eval -->

   Read `result.baseline.file`, `result.baseline.runId`, `result.pass`, `result.metrics`, `result.failures[].kind`, `result.failures[].metric`, `result.failures[].value`, `result.failures[].limit` and optional `result.failures[].likelyCause`. The optional `result.comparison` is a record: validate its `deltas` numeric map, `changedQuestions` string array and `regressions` array of metric/value/limit objects before using them. Changed question IDs can reflect timing differences, not just changed answers. Do not invent other fields. Missing baseline or comparison means no comparison was established, even with exit 0.

   D-131: exit 1 with `CHECKS_FAILED` and a completed result means floors, ceilings or regressions failed; explain each. Validation failure is `VALIDATION_FAILED`; an unexpected failure is `INTERNAL_ERROR` naming the stage. Neither supplies evidence to keep a change. Unknown costs leave the cost ceiling unevaluated, not passed.

5. **Keep or restore.** Keep only a completed passing comparison with the expected baseline, no regression entries and no regression failures under the unchanged thresholds. Otherwise restore exactly the edit made by this experiment; preserve unrelated user changes. If the file changed concurrently, stop and resolve the overlapping edit with the user instead of overwriting it. If ingestion ran or partially changed the index, restore the configuration and repeat `/ingest`'s dry-run, disclosure and yes to restore matching indexed data; a rebuild may be needed. A declined or failed rollback ingest leaves recovery incomplete: say so explicitly. Never describe a reverted file as a restored index.

   Explain the setting tried, metric deltas and changed question IDs, remaining failures, estimated costs and whether configuration and index were kept or restored. Mock results demonstrate only the workflow.

## Never

Never change code, prompt text/version, floors, ceilings, regression allowances or budgets; combine experiments; fabricate a baseline; or keep an unmeasured change after an interrupted comparison.

## Done when

One experiment has a verified comparison and a keep/restore decision, or its exact blocker and recovery state are reported. The user knows whether the index matches the restored configuration.
