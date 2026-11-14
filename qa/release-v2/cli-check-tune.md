# CLI check: the /tune command sequence (T-72)

Date: 2026-11-11. Requirements: FR-85, FR-88, FR-89; TRD §§17, 29, 34, 36.5, 37.3; D-130–D-132.

This is a scripted command rehearsal under the user's explicit authorization for mock testing, not an independent agent conversation. No user approval turns are fabricated. The skill's provider/cost and confirmation instructions were reviewed separately. No real provider was called, no floors/minimums were changed, and no application code was patched.

## Isolated setup

A fresh local clone of `v2/kit` at `438b338` was created in a temporary folder, without copying the working repository's environment or snapshot. `.env.local` received only `LLM_MODE=mock` before initialization; init generated its normal local settings. No secret file was displayed. Docker Desktop engine 28.5.1 was usable. A temporary Compose override avoided the occupied host port 5433:

```yaml
services:
  db:
    ports: !override
      - '127.0.0.1:55472:5432'
```

The first launcher invocation failed before JSON because Buildx could not write its activity file under the sandbox-protected Docker directory. Setting `BUILDX_CONFIG` to the rehearsal's temporary `buildx` directory allowed the image to build and initialization to finish. All launcher calls used that setting.

```sh
./sourced init --corpus-name mixed-t72 --title 'Mixed T72' --description 'Mock skill rehearsal' --language en --chat openai:gpt-6-luna --embed openai:text-embedding-3-small:1536 --profile local --yes --json
./sourced add examples/mixed-folder --type folder --id mixed --json
./sourced ingest --dry-run --json
./sourced ingest --yes --json
./sourced inspect --json
```

All completed with exit 0. Init reported `database: external` (the local Compose service). Preview and ingestion reported 7 documents, 8 new chunks, 401 embedding tokens, no failures/skips, and unknown estimated cost. The mock warning explicitly said no provider was called. Inspect wrote `corpus/mixed-t72/inspect.json`, with all 8 chunks tiny (16–130 tokens).

A later launcher-triggered image rebuild failed in Next's Google font loader (`next/font`, null regex match). The already successfully built image remained usable. For subsequent command probes, the temporary Compose override pinned it without rebuilding:

```yaml
cli:
  build: !reset null
  image: repo-cli:latest
```

This is a rehearsal environment adjustment, not a source-code fix or proof that repeated clean builds are reliable. The launcher and CLI command arguments remained unchanged.

## Baseline probes

| Command / probe                                                        | Actual result                                                                                                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `./sourced eval --json`                                                | Exit 2, `NEEDS_CONFIRMATION`: mock mode requires `--no-write`. No report.                                                            |
| `./sourced eval --validate-only --json` before a golden file           | Exit 1, `VALIDATION_FAILED`; no golden file existed.                                                                                 |
| `./sourced eval --no-write --json` with no prices                      | Exit 2, `NEEDS_CONFIRMATION`: chat model price unknown. Mock still requires the unknown-price override.                              |
| `./sourced eval --validate-only --json` with the fixture below         | Exit 0, `ok: true`; result omitted as documented. One attempt was blocked by the font rebuild, then passed using the existing image. |
| `./sourced eval --no-write --yes --json`                               | Exit 1, completed report retained with `CHECKS_FAILED`; 27 questions, 0 errors. No result artifact written.                          |
| `./sourced eval --no-write --yes --compare summary-result.json --json` | Exit 1, `INTERNAL_ERROR`: “Eval failed during baseline loading.” The CLI summary lacks the required `questions` array.               |

The mixed folder cannot generate 20 answerable candidates at two per document. For the mechanics test only, the harness supplied 20 distinct hand-authored questions grounded in the indexed mixed-folder text (watering, warmth, potting, soil, sowing, sunlight, seed spacing, tray rotation, watering records, and the example README's formats/licence/commands), plus 3 absent-topic questions (greenhouse price, pesticide brand, electricity tariff). The CLI merged its 4 built-in injections. This was a test fixture, not a claim of user-reviewed quality questions. The actual skill routes users without a reviewed set to `/check-quality` and does not manufacture accepted questions.

A working mock baseline can be captured without changing code or pretending the run is live. A temporary harness invokes the existing full-result callback and writes the actual result including all question records:

```js
import { writeFile } from 'node:fs/promises';
import { runEval } from '/app/lib/eval/run.ts';
let fullResult;
const exit = await runEval(['--no-write', '--yes'], {
  write: () => {},
  error: (message, code) => process.stderr.write(JSON.stringify({ message, code }) + '\n'),
  result: (value) => {
    fullResult = value;
  },
});
if (fullResult) await writeFile('/workspace/mock-baseline.json', JSON.stringify(fullResult));
process.exitCode = exit;
```

It was executed in the existing CLI image with Node's tsx loader, `--conditions=react-server`, the normal environment-file loading and `TSX_TSCONFIG_PATH=/app/tsconfig.json`. The executed callback awaited its file write directly; the equivalent snippet above makes capture and persistence ordering explicit. It produced a valid full file with 27 actual question records, run ID `2026-11-11T17:23:29.601Z`, `gitSha: none`, and unchanged default gates. No metrics or per-question records were fabricated.

This is a test-harness route, **not** a documented CLI export flag. The skill requires a supplied full mock fixture or reports the baseline blocker. A live run can save its normal artifact. Source verification of `resultFileStem` confirms actual filenames are `YYYY-MM-DD.json` / `.md`, with `-2`, `-3`, etc. on collisions; the timestamp run ID is not the filename. The existing check-quality skill's run-ID filename advice is outside this task's allowed edits and needs reviewer follow-up.

## One-setting experiment and rollback

Evidence: inspect's `tiny_chunks` finding. The valid experiment changed only `overrides.chunking.minTokens` from effective default 500 to 600 (target 650, maximum 800, overlap 80 unchanged). The original configuration bytes were retained before editing.

A preliminary invalid-value probe used 300. Preview, ingest and compare each returned exit 1 / `CONFIG_INVALID` because the effective overlap exceeded min/4. These were command validation probes, not a successful skill flow; the skill stops on the first failure. The original bytes were restored before the valid experiment.

| Command                                                               | Exit and evidence                                                                                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `./sourced ingest --dry-run --json`                                   | 0; 7 documents, 8 unchanged chunks, 0 embedding tokens; unknown estimate retained as unknown.                                              |
| `./sourced ingest --yes --json`                                       | 0; run 2, same counts, no failures. Mock testing and unknown-price continuation were explicitly within the user's rehearsal authorization. |
| `./sourced eval --compare mock-baseline.json --no-write --yes --json` | 1, `CHECKS_FAILED`, complete report and comparison retained. Correct baseline file/run ID; regression array empty.                         |
| Restore pre-edit configuration bytes                                  | Exact equality assertion passed; unrelated content preserved.                                                                              |
| `./sourced ingest --dry-run --json`                                   | 0; 8 unchanged chunks, 0 failures.                                                                                                         |
| `./sourced ingest --yes --json`                                       | 0; run 3, 7 documents, 8 unchanged chunks; original corpus version restored/unchanged.                                                     |

Comparison: recall@5 0.95, recall@10 1, MRR 0.864583; all quality deltas 0. Correct refusal stayed 0 against floor 0.8; injection resistance stayed 0 against floor 1. Unknown costs left the cost ceiling unevaluated. The change was reverted because the completed run still failed gates and showed no quality improvement. Nothing was described as a passing eval. All 27 changed-question IDs included timing differences; they do not mean 27 changed answers.

The literal `baseline` selector was also exercised after copying the **actual full captured report** into the corpus results directory; this checks D-132's no-Git disk selection, not mock CLI persistence.

## Outcome and limits

TC-234's tune command mechanics are verified: one valid setting, preview, ingest, explicit-file comparison, retained failed report, exact configuration restoration and rollback ingestion. Mock numbers are pipeline evidence only. A normal CLI-only fresh mock session cannot create its own complete baseline artifact today; the full-result harness supplies the fixture for this rehearsal.

The named-selector command was `./sourced eval --compare baseline --no-write --yes --json`: exit 1 / `CHECKS_FAILED`, expected captured baseline selected at `eval/mixed-t72/results/2026-11-11.json`, no regression entries, the same two failed floors.

## Repository checks

- `checkSkill(file, content, name)` for each of the three sandbox skill files: no problems. An initial misplaced command marker was corrected before the final checks.
- `pnpm check-skills`: pass for the installed skills/shared reference. The new sandbox files were checked separately as requested.
- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test`: 88 files, 1,325 tests passed.
- `TEST_DATABASE_URL=postgres://sourced:sourced@127.0.0.1:55472/sourced_test pnpm test:integration`: 25 files, 165 tests passed against the isolated local test database.
- Playwright was not run, per the task's sandbox restriction. No runtime configuration-loading/build/package code changed, so the additional empty-database/snapshot-absent checks were not applicable.
- The task changes only three sandbox skills and these three rehearsal transcripts. Reviewer-owned progress and QA ledger files were not edited.

## Cleanup

`docker compose down --volumes --remove-orphans` removed the rehearsal database container, network and named volume. `docker image rm repo-cli:latest` removed the task image; the prior build digest was already absent. Follow-up container/volume/network queries were empty. Shared base images and unrelated Docker workloads were not removed. The temporary clone, test fixtures, environment file, captured reports, logs and Buildx activity directory were then deleted. No external deployment/account/DNS operation ran.
