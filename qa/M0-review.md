# M0 setup — QA milestone review

Date: 2026-10-21. Status: **implementation acceptance and CI passed; manual QA closure pending**. T-01–T-06 are committed and pushed; T-06 implementation is commit 3cd3bc6. Stop at M0 before T-07.

## Resolved

The [results ledger](test-results.json) retains all attempts. 22 of 24 cases are resolved.

| Case   | Title                                      | Current result             |
| ------ | ------------------------------------------ | -------------------------- |
| TC-001 | Pinned scaffold builds cleanly             | Passed; evidence in ledger |
| TC-002 | Server modules import in scripts           | Passed; evidence in ledger |
| TC-003 | CI scaffold                                | Passed; evidence in ledger |
| TC-004 | Mock environment defaults                  | Passed; evidence in ledger |
| TC-005 | Live environment validation                | Passed; evidence in ledger |
| TC-006 | Production mock rejection                  | Passed; evidence in ledger |
| TC-007 | Environment types and complete examples    | Passed; evidence in ledger |
| TC-008 | Suggested question definitions             | Passed; evidence in ledger |
| TC-009 | Structured logs and redaction              | Passed; evidence in ledger |
| TC-010 | Security headers and fresh nonces          | Passed; evidence in ledger |
| TC-011 | Browser CSP check                          | Passed; evidence in ledger |
| TC-012 | Local database extension and test database | Passed; evidence in ledger |
| TC-013 | Reset refuses remote hosts                 | Passed; evidence in ledger |
| TC-014 | Integration isolation and smoke            | Passed; evidence in ledger |
| TC-015 | Three mock E2E servers                     | Passed; evidence in ledger |
| TC-016 | Full CI six jobs                           | Passed; evidence in ledger |
| TC-017 | System dark theme                          | Passed; evidence in ledger |
| TC-018 | Theme persistence                          | Passed; evidence in ledger |
| TC-019 | Layout landmarks and exact copy            | Passed; evidence in ledger |
| TC-020 | Not-found and error boundary copy          | Passed; evidence in ledger |
| TC-021 | Scaffold JavaScript budget                 | Passed; evidence in ledger |
| TC-024 | WebKit candidate keyboard navigation       | Passed; evidence in ledger |

Local acceptance: strict lint and typecheck, 21 unit tests, one integration smoke test, seven Playwright tests, scaffold checks, production build and dependency audit passed. The root page's referenced JavaScript totals **106.3 KB gzip**, below the unchanged **120 KB** T-06 limit. Built HTTP checks confirm a fresh CSP nonce and a matching nonce on every script. D-52 authorizes the documented [compatibility exception](nextjs-compatibility.md).

T-05 CI passed all six jobs in [run 39566914362](https://github.com/firatkill/sourced/actions/runs/39566914362). T-06 passed all six jobs in [run 39573125819](https://github.com/firatkill/sourced/actions/runs/39573125819).

## Pending decision

None. D-49–D-52 record the investigation, continued testing and final compatibility approval. The JavaScript budget failure is resolved by a passing main-repository retest, with no measurement or threshold change.

## Manual test required

Both items remain open in [owner questions](../docs/PROGRESS.md#open-questions-for-the-owner).

- **TC-022 — Keyboard layout and theme appearance:** light/dark appearance, fonts and visible keyboard focus await a live visual pass. Browser inventory was empty and native Chrome access was denied. Automated checks pass but do not replace visual inspection.
- **TC-023 — Firefox system-dark:** three attempts did not reflect Playwright's requested dark preference in matchMedia. Explicit toggle/persistence passes. The owner chose manual review (D-51); no further retries were made.

TC-011's live Chrome CSP check occurred during T-03. It is historical evidence, not a new T-06 visual pass.

## Acceptance coverage

| Requirement / acceptance                             | Status                             | Cases and limits                                                                                                                    |
| ---------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| T-01 scaffold; NFR-17 tooling, NFR-14 script imports | Verified locally and prior CI      | TC-001–TC-003                                                                                                                       |
| T-02 environment and FR-02 suggested questions       | Verified                           | TC-004–TC-008                                                                                                                       |
| T-03 FR-52 / NFR-12 logging, NFR-14 security         | Verified                           | TC-009–TC-011; new built nonce check passes                                                                                         |
| T-04 local database / reset guard, D-02 / A-15       | Verified                           | TC-012, TC-013                                                                                                                      |
| T-05 test isolation, mock servers and six CI jobs    | Verified                           | TC-014–TC-016                                                                                                                       |
| T-06 FR-49 theme / E2E-20                            | Partially verified across browsers | TC-017, TC-018 pass in Chromium; TC-023 Firefox system-dark remains manual                                                          |
| T-06 FR-50 / PRD §9.1 copy and landmarks             | Verified                           | TC-019                                                                                                                              |
| T-06 PRD §9.7 error and 404 copy                     | Verified                           | TC-020                                                                                                                              |
| T-06 JS budget / NFR-08 staged limit                 | Verified                           | TC-021: 106.3 KB / 120 KB                                                                                                           |
| NFR-09 keyboard / TRD §15.6 visual review            | Partially verified                 | TC-019 and TC-024 automated navigation pass; TC-022 visual review pending                                                           |
| NFR-18 supported browser matrix                      | Partially verified                 | Candidate Chromium/WebKit checks and Firefox explicit toggle pass; two actual browser versions and iOS Safari 17+ are not certified |

M0 does not implement streaming, retrieval, citations or live evaluation. Their acceptance belongs to later milestones. Global coverage enforcement begins at T-17 under the plan; current staged coverage does not certify the final coverage floors. Repository security settings still require owner verification.

## Regressions, audit trail and root cause groups

No cases have regression_of or root_cause_group set. No cases were retracted or deleted. Diagnostic Next.js configurations remain distinguished from adopted production behavior in the append-only ledger.

## Quality review

1. **Ledger integrity:** passed; all 24 designed cases have corresponding entries.
2. **Coverage:** every M0 case has execution evidence or an explicit manual blocker; remaining limits are listed above.
3. **Automation:** automatable cases have unit, integration, Playwright, scaffold/database commands, HTTP checks or CI execution evidence. Manual cases remain marked non-automatable.
4. **Retesting:** resolved cases end in passing attempts. Compatibility and migration failures retain their history; TC-021 has a passing main-repository measurement after the failed experiments.
5. **Escalations:** local owner references replace ClickUp/Slack under AGENTS.md. No external messages or tickets were created.
6. **Manual completion:** needs attention; TC-022 and TC-023 remain open, so full milestone QA closure is not certified.
7. **Audit trail:** intact; no retractions need explanation.
8. **Repeated-attempt review:** TC-021 reflects a measured framework payload conflict resolved with owner approval; TC-023 reflects an unresolved browser-emulation environment issue. Neither is silently waived.
9. **Agent improvement:** inspect generated custom migration SQL before applying it; keep diagnostic workspaces outside .git while running tools that block hidden paths, then restore their ignored location; distinguish supported browser keyboard conventions from application defects. No QA plugin change is justified by the evidence.

**Verdict:** stop at the M0 boundary. Automated acceptance and all six CI jobs pass; two manual checks prevent full QA closure. No live LLM calls were made.
