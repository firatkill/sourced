# M5 Configuration seams — milestone test report

Milestone: M5 Configuration seams (v2), tasks T-46 to T-52, branch `v2/kit`, draft pull request firatkill/sourced#5.
Test cases: TC-174 to TC-193 (`qa/test-cases.md`). Log: `qa/test-results.json`.
Date: 2026-11-10.

## Summary

| Status                          | Count | Cases                                      |
| ------------------------------- | ----: | ------------------------------------------ |
| Resolved                        |    19 | TC-174 to TC-185, TC-187 to TC-192, TC-193 |
| Pending decision (owner action) |     1 | TC-186                                     |
| Manual test required            |     0 | —                                          |
| Retracted (n/a)                 |     0 | —                                          |

Final local run on 29d20da: lint, typecheck, 1,230 unit tests, 155 integration tests, E2E 118 passed (ports 3100–3104), corpus literal check passed. Fresh worktree without `.sourced/` or `.env.local`: lint, typecheck, 1,230 unit tests and build passed. The example eval on 08cb06b matched the v1.0.0 run on every metric (TC-189).

## Resolved

| TC     | Title                                                         | Evidence                                                                                                                 |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| TC-174 | Migration 0003_kit applies on empty and v1 databases          | `migrations.test.ts`; DDL matches TRD §30.1                                                                              |
| TC-175 | Same chunk text in two documents is stored twice              | IT-15 `chunk-uniqueness.test.ts`                                                                                         |
| TC-176 | Re-ingest after the migration is a no-op                      | `pnpm ingest --offline`: 0 inserted, 0 updated, 201 unchanged                                                            |
| TC-177 | Kit configuration schema and error messages                   | UT-32 `kit-config.test.ts`                                                                                               |
| TC-178 | Embedding column follows configured dimensions                | IT-12 `kit-schema.test.ts`, including D-96 adoption of v1 databases                                                      |
| TC-179 | Full-text language from configuration                         | IT-13 (synthetic and Turkish fixture)                                                                                    |
| TC-180 | Providers resolved per role; v1 example unchanged             | `getProvider` removed; E2E-01 to E2E-25 pass                                                                             |
| TC-181 | Copy rendered from configuration                              | UT-33 `kit-copy.test.ts`; example reproduces the v1.1 strings                                                            |
| TC-182 | Example system prompt byte-identical to v1                    | `prompt-version.test.ts`; `PROMPT_VERSION` unchanged                                                                     |
| TC-183 | No corpus literals outside allowed paths                      | `check:corpus-literals` in CI; violation test in its own temporary repository                                            |
| TC-184 | Citation markers up to P9                                     | `kit-citations.test.ts`; `finalPassages: 10` rejected                                                                    |
| TC-185 | Gemini, Anthropic and Ollama providers with mocked transports | UT-49 `additional-providers.test.ts`                                                                                     |
| TC-187 | Example corpus in the kit layout with identical chunks        | IT-16 `example-corpus.test.ts` against the captured v1 baseline                                                          |
| TC-188 | /eval reads results from the new path                         | `eval-page.spec.ts`                                                                                                      |
| TC-189 | Example eval within maxRegression                             | eval.yml run 42801799391: recall@5 0.96875, MRR 0.9375, citation validity 1, faithfulness 1, errors 0                    |
| TC-190 | Deployment profiles gate quotas, demo mode and cache          | `profile.test.ts`, `ask-local.spec.ts` on port 3103                                                                      |
| TC-191 | Example unchanged in public-demo                              | E2E 118 passed                                                                                                           |
| TC-192 | Second fixture corpus end to end in mock mode                 | E2E-26 `ask-kit-tr.spec.ts` on port 3104, separate `sourced_kit_tr` database                                             |
| TC-193 | M5 exit criteria                                              | This report; PRD §12 M5 criteria met (example within the regression delta; second corpus in another language end to end) |

## Pending decision

| TC     | Title                                                     | Status                                                                                                                                                                   |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-186 | Manual live call per provider (Gemini, Anthropic, Ollama) | Owner action (D-94): no Gemini or Anthropic key and no Ollama. Listed in `docs/PROGRESS.md` open questions with the steps; providers ship tested with mocked transports. |

## Issues found and fixed during the milestone

The log records one passing attempt per case because each case was logged after its task passed review. These problems were found by the reviewer or CI before logging and fixed in the same milestone:

| Found in      | Problem                                                                                                                                 | Fix                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| T-47 (spec)   | TRD §30.2 did not cover a v1 database with chunks and no `corpus_meta` (local and production)                                           | D-96, TRD §30.2 step 1a: adopt when stored and configured values match                                  |
| T-47 (spec)   | Normative §29.1 schema did not type-check under Zod 4 (`.default({})`)                                                                  | D-97: `.prefault({})`                                                                                   |
| T-47 (CI)     | `config:snapshot` required database variables; CI build and unit jobs failed                                                            | `getConfigEnv()` for the snapshot (in 8b05a91)                                                          |
| T-48 (spec)   | Copy schema could not hold the v1.1 redesign strings or the two corpus names in the prompts                                             | D-100: optional copy fields with defaults                                                               |
| T-49 (CI)     | `lib/env.ts` and `lib/copy.ts` imported the git-ignored `.sourced/` snapshot; a fresh clone could not lint, build, test, seed or ingest | 00e1302, plus `generated-imports.test.ts`; every later task is verified in a fresh worktree before push |
| T-49 (review) | E2E cost assertion accepted a null cost for the example                                                                                 | Assertion requires a known cost                                                                         |
| T-49 (review) | Model table listed an old Claude model; Claude 5.5 rejects `temperature`                                                                | Claude 5.5 entries with `supportsTemperature: false`, confirmed in the SDK source                       |
| T-50 (review) | Historical decisions log rows were rewritten with new paths                                                                             | Rows restored; living docs keep the new paths                                                           |
| T-50 (review) | Literal-check test wrote under `lib/` and raced with the tree-scanning test                                                             | Test uses a temporary git repository                                                                    |
| T-52 (E2E)    | E2E-26 imported server configuration, so Playwright aborted before any test                                                             | Test imports public fixture data; regression test added                                                 |

## Regressions

None recorded against earlier resolved cases. The fresh-clone failure above was a regression introduced and fixed within M5 (T-49 → 00e1302).

## Flaky observations

| Where                         | Observation                                                                                         | Follow-up                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Integration suite             | One failure in 13 runs on 2026-11-10; not reproduced in 12 consecutive runs; test name not captured | Watch CI logs; listed in `docs/PROGRESS.md`              |
| `ask-stream.spec.ts` (TC-091) | One failure under full-suite load; 8 of 8 passes on repeat                                          | Timing-sensitive status observation; watch               |
| `theme.spec.ts` (TC-145)      | One failure while the 3104 fixture build ran in parallel; passed in the next full run               | Load from the extra build; watch                         |
| eval.yml (2e3f8e7)            | One judge call failed (q023, `faithfulness: null`); every metric passed; next runs had 0 errors     | Provider transient; no retry by design (`maxRetries: 0`) |

## Root cause groups

None recorded.

## Requirement coverage

PRD v2 requirements use FR numbers, not numbered acceptance criteria.

| Requirement                                               | Cases                  | Result                                                                                     |
| --------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| FR-59 kit configuration                                   | TC-177                 | Verified                                                                                   |
| FR-60 providers per role                                  | TC-180, TC-185, TC-186 | Partially verified: mocked transports pass (TC-185); live calls pending the owner (TC-186) |
| FR-61 embedding dimensions                                | TC-174, TC-178         | Verified                                                                                   |
| FR-62 full-text language                                  | TC-179, TC-192         | Verified                                                                                   |
| FR-63 copy from configuration                             | TC-181, TC-182, TC-192 | Verified                                                                                   |
| FR-64 deployment profiles                                 | TC-190, TC-191         | Verified (private access flow is T-74)                                                     |
| FR-67 document model and page columns                     | TC-175                 | Schema verified; loaders arrive in M6                                                      |
| FR-72 resumable ingest (schema)                           | TC-174                 | Schema verified; behaviour arrives in T-59                                                 |
| FR-74 corpus values only in config and corpus directories | TC-183, TC-187         | Verified                                                                                   |
| NFR-16 reproducible chunks                                | TC-176, TC-187         | Verified                                                                                   |

## Owner items carried forward

- TC-186 / A-19: live provider calls when keys or Ollama are available.
- D-90 release follow-ups (unchanged from M4).
- The production database migration `0003_kit` runs only at the v2.0.0 release, through `migrate.yml`, with the owner's go-ahead (D-92).
