# M5 Configuration seams — QA milestone review

Reviewed: `qa/m5-report.md`, `qa/test-cases.md` (TC-174 to TC-193), `qa/test-results.json`, against PRD FR-59 to FR-64, FR-67, FR-72, FR-74, §12 (M5 exit) and TRD §28 to §31, §23. Date: 2026-11-10.

## Checklist

| #   | Item                        | Verdict           | Notes                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Ledger integrity            | Pass              | `check-qa-ledger.sh` PASS. No advisory 3+-attempt cases in M5.                                                                                                                                                                                                                                                                             |
| 2   | Coverage                    | Pass              | All 20 designed cases (TC-174 to TC-193) have a log entry. PRD v2 uses FR numbers, not numbered ACs; the FR table in the report shows FR-60 partially verified (live calls pending, TC-186).                                                                                                                                               |
| 3   | Automatable cases automated | Pass after a fix  | Every automatable case maps to an existing test file. TC-188's claim (the default results directory loads the committed example runs) was only checked by a manual HTTP smoke and a fixture directory in E2E; added `TC-188 / T-50` to `tests/unit/eval-load-results.test.ts`, which fails if the default path is wrong.                   |
| 4   | Real retesting              | Pass, with a note | Every resolved case has one passing attempt, which is legitimate. Problems found during the milestone were fixed before the case was logged, so the log does not show them; the report's "Issues found and fixed" table lists all ten. From M6 on, a failure found after a case is first run is logged as a failed attempt before the fix. |
| 5   | Escalations                 | Pass              | Only TC-186 (`pending_decision`) carries the owner-action note in place of a ClickUp task (AGENTS.md override); no other case has one.                                                                                                                                                                                                     |
| 6   | Manual tests completed      | Pass              | No `manual_required` cases in M5. TC-186 waits for the owner's keys or Ollama (D-94).                                                                                                                                                                                                                                                      |
| 7   | Audit trail                 | Pass              | No `n/a` entries; nothing removed (ledger check confirms append-only history).                                                                                                                                                                                                                                                             |
| 8   | Attempts advisory           | Pass              | No 3+-attempt cases. Four flaky observations are listed in the report (integration once in 13 runs, `ask-stream` under load, `theme` during the parallel fixture build, one eval judge call).                                                                                                                                              |

## Product-quality findings

- FR-60 is only partially verified until the owner can run one live call per provider (TC-186, A-19).
- The fresh-clone regression (T-49) shows that a green local run can hide problems with generated or local-only files. Every M5 task after it was verified in a fresh worktree without `.sourced/` or `.env.local` before push; keep this for M6, where new loaders and the CLI add more generated state.
- Four flaky observations remain unexplained but not reproduced; CI logs will name them if they recur.
- The Turkish fixture shows English UI chrome (for example "See how it is measured") next to Turkish corpus copy. This follows FR-63, which covers strings that name the corpus only; UI localisation is not in the v2 scope.

## Agent improvement notes

- The implementing agent's sandbox cannot launch Chromium or write `.git`. Prompts now say so up front: the reviewer runs Playwright, and file moves use plain `mv` (git records renames at commit).
- The implementing agent verified with the local `.env.local` and `.sourced/` present, which hid the fresh-clone failure. The standing rules for the implementing agent now require the CI-condition commands and a run without `.sourced/` for any change to configuration loading, environment handling or build scripts.
- Three spec gaps came from Part II predating the v1.1 redesign (D-96, D-97, D-100). The implementing agent stopped correctly each time; the reviewer resolved them with decisions log rows. Expect similar gaps in M6 for redesign-era UI (source viewer link labels for files and PDF pages).
- Log failures as they happen (item 4), so the ledger reflects the real retest history instead of only the final pass.

## Verdict

Ready to close M5. Not blocking: TC-186 (owner action).
