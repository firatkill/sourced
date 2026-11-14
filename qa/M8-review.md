# M8 Agent guidance and v2.0 release — QA milestone review

Reviewed `qa/m8-report.md`, TC-229 to TC-247 in `qa/test-cases.md` and `qa/test-results.json`, and the transcripts in `qa/release-v2/`, against PRD FR-85 to FR-90, FR-94, NFR-24, §11, §12 and TRD §37, §38. Date: 2026-11-14.

| #   | Item                        | Verdict | Notes                                                                                                                                             |
| --- | --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ledger integrity            | Pass    | `check-qa-ledger.sh` PASS.                                                                                                                        |
| 2   | Coverage                    | Pass    | All nineteen cases logged.                                                                                                                        |
| 3   | Automatable cases automated | Pass    | TC-229 to TC-233, TC-235, TC-236 and TC-238 to TC-243 have unit, contract or E2E tests; TC-234, TC-237 and TC-244 to TC-247 are manual by design. |
| 4   | Real retesting              | Pass    | Every fixed finding has a commit and a test; the hedged-refusal finding is open for the owner; the newcomer checks ran on fresh clones.           |
| 5   | Escalations                 | Pass    | TC-246 and TC-247 are pending the owner (Windows and Linux Docker checks, tag, merge) and listed in PROGRESS.                                     |
| 6   | Manual tests                | Pass    | Transcripts recorded for every manual case.                                                                                                       |
| 7   | Audit trail                 | Pass    | No `n/a` entries.                                                                                                                                 |
| 8   | Attempts advisory           | Pass    | No M8 case with three or more failed attempts.                                                                                                    |

## Product-quality findings

- Both agents reached a cited answer from a one-line goal with no rule break; the skills, not the agents' defaults, set the order of questions and approvals.
- Live runs keep finding what mocks cannot: the 60 s image re-export and the hedged-refusal behaviour on a new corpus showed up only with real Docker and real models.
- The hedged-refusal finding is a quality limit of the default chat model on some corpora; it should be stated in the release notes until fixed.

## Agent improvement notes

- Codex's default sandbox cannot run the Docker path; the README or the setup skill could say that Codex asks to run `./sourced` outside the sandbox.
- Headless rehearsals need the same permissions a real user would grant; a denied `pkill` correctly stopped the agent, which then reported the next action in plain words.

## Verdict

Ready to close M8 once the owner approves the v2.0.0 tag and the merge; the Windows and Linux Docker checks and the follow-ups in the report are not blocking for the tag if the owner accepts them as known issues.
