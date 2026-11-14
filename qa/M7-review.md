# M7 Quality on any corpus — QA milestone review

Reviewed `qa/m7-report.md`, TC-220 to TC-228 in `qa/test-cases.md` and `qa/test-results.json`, against PRD FR-82 to FR-85, §11, §12 and TRD §36. Date: 2026-11-11.

| #   | Item                        | Verdict | Notes                                                                                                       |
| --- | --------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Ledger integrity            | Pass    | `check-qa-ledger.sh` PASS.                                                                                  |
| 2   | Coverage                    | Pass    | All nine cases logged.                                                                                      |
| 3   | Automatable cases automated | Pass    | TC-220 to TC-224 and TC-226 have unit, integration or contract tests; TC-225 and TC-227 are live by design. |
| 4   | Real retesting              | Pass    | Problems found during tasks are listed in the report with their fixes.                                      |
| 5   | Escalations                 | Pass    | None open; the owner delegated candidate review (D-127).                                                    |
| 6   | Manual tests                | Pass    | None.                                                                                                       |
| 7   | Audit trail                 | Pass    | No `n/a` entries.                                                                                           |
| 8   | Attempts advisory           | Pass    | No M7 case with three or more failed attempts.                                                              |

## Product-quality findings

- The kit can now measure itself on a new corpus; the first such check (MongoDB, 200 pages) met every floor, with an optimistic-judge caveat.
- The live run found a slug bug that unit tests had not (all pages `index.html`), confirming the value of running real corpora each milestone.

## Agent improvement notes

- Generated golden candidates need a pre-filter for navigation and context-dependent questions; reviewing 53 candidates by hand to keep 28 is slow.
- When eval and generate share the chat model, say so in the results header and in the report, as done here.

## Verdict

Ready to close M7. Follow-ups listed in the report are not blocking.
