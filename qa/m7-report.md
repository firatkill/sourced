# M7 Quality on any corpus — milestone test report

Milestone: M7 (v2), tasks T-65 to T-68, branch `v2/kit`. Test cases: TC-220 to TC-228. Date: 2026-11-11.

## Summary

| Status   | Count | Cases            |
| -------- | ----: | ---------------- |
| Resolved |     9 | TC-220 to TC-228 |
| Pending  |     0 | —                |

Final local run: unit 1,288, integration 165, contract 269, E2E 118, all passing at default concurrency; CI green on each pushed commit. No milestone eval of the example was needed for M7 beyond the M6 run: M7 changed only the eval harness and the golden file's `chapter` key, and the example's results files are unchanged.

## What M7 delivers

- `sourced inspect`: corpus health report with the nine TRD §36.4 findings, per-source counts and chunk extrema, sampled near-duplicate and language checks (T-65, D-125).
- `sourced eval:generate` and `eval:review`, with the built-in injection set (T-66).
- Eval on kit corpora: golden `group` and `origin`, validator profiles, floors per corpus, likely causes, `--compare` (T-67, D-126); models and prices from the configuration, unknown costs as null (D-129).
- The first kit-corpus quality check: a reviewed 30-question golden set for 200 pages of the MongoDB manual and an eval that met every default floor (T-68).

## MongoDB quality check (T-68)

| Metric                                     |  Value | Floor  |
| ------------------------------------------ | -----: | ------ |
| recall@5                                   |  0.903 | ≥ 0.7  |
| recall@10                                  |  0.974 | ≥ 0.85 |
| MRR                                        |  0.931 | ≥ 0.6  |
| citation validity                          |      1 | ≥ 0.95 |
| faithfulness                               |      1 | ≥ 0.85 |
| false refusal                              |      0 | ≤ 0.1  |
| correct refusal                            |      1 | ≥ 0.8  |
| injection resistance (question-borne only) |      1 | ≥ 1    |
| p95 latency                                |  6.3 s | ≤ 15 s |
| cost                                       | $0.026 | —      |

Caveat: chat and judge are the same model (`gpt-6-luna`; the example configuration sets no judge, so it defaults to chat) and the same model generated the candidates, so faithfulness may be optimistic.

## Issues found and fixed during the milestone

| Found in        | Problem                                                                                                                              | Fix                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| T-65 (spec)     | The placeholder `inspect` schema could not hold FR-82's statistics                                                                   | D-125                                                                         |
| T-66 (live run) | On sites whose URLs end in `/`, every page got the slug `index.html`; generated anchors collided                                     | D-128 relative location slugs (a9f9c8e)                                       |
| T-66 (review)   | About a quarter of generated candidates were navigation, context-dependent or vacuous; half of the unanswerables were partly covered | Reviewer rejection with reasons; corpus checks before accepting unanswerables |
| T-67 (spec)     | Unmapped likely causes and injection ids                                                                                             | D-126                                                                         |
| T-68 (live run) | Kit eval required the demo's model variables; unknown prices had no result schema                                                    | 7c02df3, D-129                                                                |

## Open follow-ups

- Node path: the first CLI command in a fresh folder fails until the config snapshot exists (the Docker path is unaffected).
- `sourced eval` outside a git repository fails with a generic error; it should record no commit.
- `eval:generate` could filter navigation and context-dependent questions before review; about 25 of 53 candidates needed rejection.
- Language variants of the same page are ingested as separate documents on the MongoDB sitemap; `inspect`'s near-duplicate finding is the signal, and an exclude rule for `?language-*` query strings would reduce them.

## Spend

M7 live spend: re-ingest $0.0068, candidate generation $0.0070 and $0.0087, eval $0.026; about $0.05 in total, within D-127's approval.
