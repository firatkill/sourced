# M6 Sources and CLI — QA milestone review

Reviewed: `qa/m6-report.md`, `qa/test-cases.md` (TC-194 to TC-219), `qa/test-results.json`, `qa/t63-bench.md`, `qa/t64-any-corpus.md`, against PRD FR-65 to FR-81, FR-94, NFR-20 to NFR-22, NFR-25, §11, §12 (M6) and TRD §32 to §35, §39. Date: 2026-11-11.

| #   | Item                        | Verdict | Notes                                                                                                                        |
| --- | --------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ledger integrity            | Pass    | `check-qa-ledger.sh` PASS; advisory 3+-attempt cases are from M0 to M3, none from M6.                                        |
| 2   | Coverage                    | Pass    | All 26 designed cases have log entries; FR coverage table in the report; FR-94 partially verified (A-23 per OS, owner).      |
| 3   | Automatable cases automated | Pass    | Every automatable case maps to unit, integration, contract or E2E tests; TC-210, TC-217, TC-218 are live checks by design.   |
| 4   | Real retesting              | Pass    | TC-216 shows fail then pass. As in M5, problems found during tasks were fixed before logging; the report's table lists them. |
| 5   | Escalations                 | Pass    | Only TC-215 carries the owner-action note.                                                                                   |
| 6   | Manual tests completed      | Pass    | No `manual_required` cases in M6.                                                                                            |
| 7   | Audit trail                 | Pass    | No `n/a` entries; history append-only.                                                                                       |
| 8   | Attempts advisory           | Pass    | No M6 case with 3+ failed attempts.                                                                                          |

## Product-quality findings

- The kit now works on any corpus from a clean copy on the Docker path, proven with a public documentation site and a mixed-format folder; NFR-20 is met narrowly (about 29 minutes).
- Broad full-text queries have a slow tail (worst-case p95 3.3 s); NFR-21 holds on the realistic profile only (D-124).
- TC-145 (hydration, predates v2) is still open.

## Agent improvement notes

- The newcomer path broke four times in ways unit tests did not catch (generated-file imports, init leaving required settings empty, generic config errors, Docker image with build-time copy). Running the real newcomer sequence from a clean copy found each of them; keep that as a per-milestone gate.
- Several "passes" came from runs the implementing agent prepared by hand (filled `.env.local`, `--maxWorkers=2`). Prompts now ask for default-concurrency runs and the fresh-copy sequence.
- Disk and spend: Docker-heavy verification filled the disk and the eval count was not tracked. Check disk before Docker work, remove test volumes afterwards, and count eval runs from the run list, not from memory.

## Verdict

Ready to close M6. Not blocking: TC-215 (owner), TC-145 (separate fix), the worst-case full-text tail (owner decision).
