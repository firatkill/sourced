# M8 Agent guidance and v2.0 release — milestone test report

Milestone: M8 (v2), tasks T-69 to T-76, branch `v2/kit`. Test cases: TC-229 to TC-247. Date: 2026-11-14.

## Summary

| Status   | Count | Cases            |
| -------- | ----: | ---------------- |
| Resolved |    19 | TC-229 to TC-247 |
| Pending  |     0 | —                |

Final local run at 9de75a3: unit 1,385 and contract 302 passing at default concurrency, integration passing, E2E 124 passing (including the private-profile spec on port 3105), `check-skills` passing; the fresh-worktree gate passed before each push.

## What M8 delivers

- Seven skills in `.agents/skills/` (setup, add-docs, ingest, check-quality, tune, troubleshoot, deploy) with shared rules (FR-89), a generated CLI reference and an unknown-price guide; seven Claude Code pointers in `.claude/commands/` and a read-only permission allow list (T-69 to T-73).
- `pnpm check-skills`: every command, flag, result path and error code a skill names is checked against the CLI; it runs in CI (T-73).
- The `private` profile: an access page, an HMAC access cookie checked by Node middleware from the runtime snapshot, and a per-visitor limit on failed attempts (T-74, D-134).
- User-facing root `AGENTS.md`, contributor rules moved to `docs/contributing/AGENTS.md`, `CONTRIBUTING.md` (T-75).
- README "Use your own documents" (Docker path first) and the v2.0.0 CHANGELOG entry (T-76).

## Newcomer release check (D-71, NFR-24)

| Agent               | Copy                   | Turns | Result                                     | Transcript                              |
| ------------------- | ---------------------- | ----: | ------------------------------------------ | --------------------------------------- |
| Claude Code 2.1.322 | fresh clone at c33a664 |    13 | Cited answer (2 citations); no FR-89 break | `qa/release-v2/newcomer-claude-code.md` |
| Codex CLI 0.166.0   | fresh clone at 9de75a3 |     7 | Cited answer (1 citation); no FR-89 break  | `qa/release-v2/newcomer-codex.md`       |

In both runs the tester typed only "I want a chatbot over the Flask documentation.", answered questions and filled `OPENAI_API_KEY` in `.env.local`; the key never appeared in the chat or the session logs. Both agents named the provider and cost before every paid step, offered Ollama and never read `.env.local`. Codex ran `codex exec` with `danger-full-access` in a throwaway clone, because its `workspace-write` sandbox cannot reach the Docker socket; in interactive Codex the user approves running `./sourced` outside the sandbox.

## Live /tune (TC-234)

On the Flask clone, `/check-quality` built a reviewed 33-question golden set and a baseline eval; `/tune` changed `overrides.retrieval.finalPassages` from 6 to 4, ran `eval --compare`, and restored the configuration byte for byte when `correctRefusal` stayed below the floor (0.714 < 0.80). It refused to change prompt text. Transcript `qa/release-v2/rehearsal-tune-live.md`.

## Milestone eval (D-121)

Run [43123789256](https://github.com/firatkill/sourced/actions/runs/43123789256) on v2/kit 9de75a3, example corpus:

| Metric                                     |   Value | Floor   |
| ------------------------------------------ | ------: | ------- |
| recall@5                                   |   0.969 | ≥ 0.7   |
| recall@10                                  |   0.969 | ≥ 0.85  |
| MRR                                        |   0.938 | ≥ 0.6   |
| citation validity                          |       1 | ≥ 0.95  |
| faithfulness                               |   0.984 | ≥ 0.85  |
| false refusal                              |       0 | ≤ 0.1   |
| correct refusal                            |       1 | ≥ 0.8   |
| injection resistance (question-borne only) |       1 | ≥ 1     |
| p95 latency                                |   6.4 s | ≤ 15 s  |
| cost per question                          | $0.0008 | ≤ $0.02 |

No metric regressed beyond `maxRegression` against the M7 baseline.

## Issues found and fixed during the milestone

| Found in         | Problem                                                                                                                       | Fix                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| /setup rehearsal | Launcher `down` and `dev` printed no JSON envelope                                                                            | 92261a8                    |
| Rehearsals       | Mock-mode cost estimates were null and nothing said mock mode was on                                                          | e13d2a7                    |
| /check-quality   | Eval envelopes were generic; eval failed without Git in the Docker image                                                      | ce8f63c (D-131, D-132)     |
| Pricing lookup   | `openai.com/api/pricing` returns 403 to agent fetches                                                                         | ccd3438                    |
| T-74 review      | The build-time profile left Docker images unprotected                                                                         | b7fb425 (runtime snapshot) |
| /setup, /deploy  | Fixed DB port 5433 stopped a second checkout with no envelope; IPv6 listener passed doctor                                    | 150f158, 340ffb4 (D-135)   |
| Newcomer check   | Every `./sourced` call re-exported the cached CLI image (about 60 s); doctor fix text named `pnpm sourced` on the Docker path | 4cf7d94                    |

## Release checklist v2.0.0

| Item                                                                  | State                                                                                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Must FRs FR-59 to FR-94 implemented (FR-86, FR-91 to FR-93 are v2.1)  | Implemented; FR-75's live eval comparison (T-60, contextual embedding on vs off) has not been run and is open for the owner |
| Example: E2E-01 to E2E-25 and the release eval                        | Done (E2E 124 passing; eval run above)                                                                                      |
| Any-corpus (T-64) and quality (T-68) results under `qa/`              | Done (`qa/t64-any-corpus.md`, `qa/m7-report.md`)                                                                            |
| Newcomer check in Claude Code and Codex                               | Done (TC-244, TC-245)                                                                                                       |
| TRD §35.4 sequence on macOS, Windows and Linux with only Docker       | macOS done (both newcomer checks); Windows and Linux open for the owner                                                     |
| `check-skills`, contract tests and the `docker` job green on `main`   | Green on v2/kit; checked again on `main` after the merge                                                                    |
| No secret printed (UT-45) and none in transcripts                     | Done (UT-45 passing; transcripts and session logs checked for the key)                                                      |
| README, AGENTS.md, CONTRIBUTING.md                                    | Done (TC-242, TC-243)                                                                                                       |
| CHANGELOG v2.0.0; tag after approval; release notes with known issues | Done 2026-11-14 (owner approved; migration 43612677273, merge de13131, tag v2.0.0)                                          |

## Open follow-ups

- Known issue for the release notes: on the Flask corpus `gpt-6-luna` answers three of seven out-of-scope questions with "The passages do not describe …" followed by a cited answer (`correctRefusal` 0.57). The example corpus is unaffected (1.0). The fix is the chat model or the not-found instruction (owner decision, PROGRESS (h)).
- Hosted database from the Docker path (D-135, owner).
- `/add-docs` discovery request spacing; MongoDB navigation icon names in headings; trace lacks candidate identities; Node-path first command before a snapshot exists.
- Codex disclosure mentions "contextual summaries" that are not sent (skill wording could say what contextual embedding sends).

## Spend

M8 live spend (approved 2026-11-12): newcomer ingests about $0.003 each and test questions under $0.001; candidate generation $0.005; baseline and comparison evals $0.029 and $0.026; milestone eval $0.35. About $0.42 in total.
