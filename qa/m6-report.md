# M6 Sources and CLI — milestone test report

Milestone: M6 Sources and CLI (v2), tasks T-53 to T-64, branch `v2/kit`, draft pull request firatkill/sourced#5.
Test cases: TC-194 to TC-219 (`qa/test-cases.md`). Log: `qa/test-results.json`. Date: 2026-11-11.

## Summary

| Status                          | Count | Cases                              |
| ------------------------------- | ----: | ---------------------------------- |
| Resolved                        |    25 | TC-194 to TC-214, TC-216 to TC-219 |
| Pending decision (owner action) |     1 | TC-215                             |
| Manual test required            |     0 | —                                  |
| Retracted (n/a)                 |     0 | —                                  |

CI on edb03ae is green in every job (unit, integration and coverage, contract, E2E with the mock provider, build, Docker-only smoke). The M6 milestone eval (run 42979153320, D-121) passed every gate: recall@5 0.969, MRR 0.938, citation validity 1, faithfulness 0.953, 0 errors.

## What M6 delivers

- Sources: folder, Git checkout, URL list, sitemap and crawl, with per-host politeness, robots.txt and a sha1 raw cache (T-53).
- Parsers: generic HTML for unknown documentation sites (T-54), Markdown and MDX (T-55), PDF with page-aware citations and `needs_ocr` (T-56), `.docx` (T-57), plain text (T-59).
- Ingest: boilerplate removal, resumable runs (SIGINT and resume give the same result as one run), dry run, cost confirmation, removal of undiscovered documents (T-59); contextual embedding input behind a flag, off for the example after a live comparison (T-60, D-118).
- CLI: one `sourced` entry point with a versioned JSON envelope and exit codes (T-58); `doctor`, `init`, `add`, `sources`, `ask --trace`, `dev`, `deploy:check` (T-61); contracts CT-01 to CT-14 (T-63).
- Docker-only path: `docker compose up`, `./sourced`, non-root image, runtime configuration and copy (T-62).
- Any-corpus checks: 200 pages of the MongoDB manual in about 29 minutes from a clean copy including the first image build (NFR-20), and a mixed-format folder in 72 seconds (T-64, `qa/t64-any-corpus.md`).
- NFR-21: realistic benchmark p95 70 ms at 100,000 chunks (D-124, `qa/t63-bench.md`).

## Resolved

Every case in TC-194 to TC-214 and TC-216 to TC-218 has its evidence in the log entry. TC-216 has a failed attempt (first synthetic generator, p95 807 ms) followed by the passing realistic-profile measurement. TC-219 is this report.

## Pending decision

| TC     | Title                       | Status                                                                                     |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------ |
| TC-215 | Host Ollama from containers | Owner action (D-94, A-23): no Ollama installed; per-OS check listed in `docs/PROGRESS.md`. |

## Issues found and fixed during the milestone

| Found in                                        | Problem                                                                                                                                                                | Fix                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| T-53 (spec)                                     | v2 document keys broke v1 chunk hashes and golden anchors                                                                                                              | D-101 location slugs                                       |
| T-53 (E2E)                                      | Folder-source passages failed SSE validation (`INTERNAL_ERROR`)                                                                                                        | D-102 file passages                                        |
| T-54 (spec)                                     | Readability kept page chrome and dropped titles; first rule removed content wrappers                                                                                   | D-103, D-105                                               |
| T-55, T-56, T-58, T-59, T-61, T-62, T-63 (spec) | Gaps or conflicts: YAML front matter, PDF titles, ingest report shape, unknown-price rules, zero sources, private token, init example, empty-corpus mismatch, CT scope | D-106, D-107, D-109, D-112 to D-114, D-117, D-120, D-122   |
| T-58 (E2E)                                      | `lib/cli` imported from `scripts/`, breaking the fixture build                                                                                                         | Layering fix with lint rule and test                       |
| T-61 (fresh)                                    | Output redaction turned `sourced` into `[REDACTED]` with the Docker default password; snapshots depended on the machine                                                | D-116, controlled test environment                         |
| T-61 (review)                                   | Failed doctor checks used `NEEDS_CONFIRMATION`                                                                                                                         | D-115 `CHECKS_FAILED`                                      |
| T-62 (review)                                   | A newcomer following `init` alone could not run the kit; Docker image showed default copy                                                                              | D-119 generated salts and URLs, named errors, runtime copy |
| T-62 (CI)                                       | Unit suite timed out at default concurrency because of process-spawning tests                                                                                          | `contract` Vitest project                                  |
| T-64 (newcomer run)                             | `init` errors did not name the field; flag formats undocumented                                                                                                        | 8c3714e                                                    |

## Flaky observations

| Where                                        | Observation                                                                 | Follow-up                                   |
| -------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------- |
| `theme.spec.ts` (TC-145)                     | Intermittent React #418 hydration error and colour-scheme race; predates v2 | Open; fix proposed as a separate session    |
| Local unit and E2E                           | Timeouts under machine load (load average 12 to 41 from other projects)     | CI is the verifying run; no timeouts raised |
| `a11y.spec.ts`, `ask-stream.spec.ts`, TC-086 | Single failures under load, passing alone                                   | Watch CI                                    |

## Incidents

- 2026-11-11: the data disk filled up during Docker-heavy work; restarting Docker Desktop recreated an empty VM disk and deleted every local Docker image, container and volume, including other projects' local databases. The sourced local database was rebuilt; production was not affected. macOS also purged the Playwright browsers. Separately, this repository's `node_modules` was deleted by a process outside the session and reinstalled.
- Eval spend: 20 automatic eval runs reported about $6.8 at list prices against the $5 cap (D-94); automatic eval on `v2/kit` is paused (D-121) and the remaining M6 spend was approved (D-123). M6 live spend after D-123: one eval ($0.345) and T-64 embeddings (about $0.007).

## Requirement coverage

| Requirement                        | Cases                            | Result                                                            |
| ---------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| FR-65, FR-66 sources and fetching  | TC-194 to TC-196, TC-217         | Verified                                                          |
| FR-67 document model and citations | TC-197, TC-207                   | Verified                                                          |
| FR-68 to FR-70 parsers             | TC-198 to TC-201                 | Verified (100% line coverage on each parser)                      |
| FR-71 to FR-73 ingest              | TC-204 to TC-206                 | Verified                                                          |
| FR-75 contextual embedding         | TC-209, TC-210                   | Verified; off for the example (D-118)                             |
| FR-76 to FR-81 CLI                 | TC-202, TC-203, TC-211 to TC-213 | Verified                                                          |
| FR-94 Docker path                  | TC-214, TC-215                   | Partially verified: A-23 per OS pending (owner)                   |
| NFR-20 time to first answer        | TC-217                           | Verified, narrowly (about 29 minutes)                             |
| NFR-21 scale                       | TC-216                           | Verified on the realistic profile; worst-case tail is a follow-up |
| NFR-22 CLI contract                | TC-202, TC-211                   | Verified                                                          |
| NFR-25 loader quality              | TC-198 to TC-201                 | Verified                                                          |

## Follow-ups for the owner

- Worst-case full-text ranking tail (D-124): a retrieval change that needs an eval run and a decision.
- `init` could write prices for known models; `ingest` after a dry run could reuse fetched pages.
- TC-145 hydration fix and self-hosted fonts (proposed sessions, not started).
- TC-215 / A-23 when Ollama is available.
