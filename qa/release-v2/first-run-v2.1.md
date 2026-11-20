# First-run rehearsal for v2.1 (TC-253)

Date: 2026-11-19. Reviewer: Claude Code. Branch: `v2.1/first-run` (commits 583ff35 to ab365d3).

## Why

The owner cloned v2.0.0 into `~/Desktop/sourced/sourced` and followed the README Docker path. Every step failed in a different way:

- The clone reused another checkout's database, because Compose took the project name `sourced` from the folder name. That database held an index built with mock embeddings.
- `ingest --dry-run` reported success.
- `ingest` printed raw JSON and `pnpm sourced ingest --rebuild` on the Docker path.
- `./sourced dev` printed nothing; the app container had exited at startup.
- The shipped `public-demo` configuration made each command ask for another environment value.
- The user's documents would have been added next to the PostgreSQL example, with no way to remove it.

## How

The rehearsal was scripted, in mock mode, so no provider was contacted:

1. A clean clone of the branch into a folder named `sourced`, while another checkout's `sourced-db-1` container ran on port 5433. `SOURCED_DB_PORT=5544` was set for that reason.
2. The README quick start: `cp .env.example .env.local`, then `./sourced ingest` and `./sourced dev`.
3. The example, then a switch to the live configuration with a placeholder key, to force the mock-index mismatch.
4. `./sourced reset`, then a folder of the user's own documents (`add`, `ingest`, `dev`, `ask`).

The rehearsal ran three times. The first two runs found defects, which were fixed in 97552bb and ab365d3.

## Results (third run, plus a missing-key check on a snapshot-free clone)

| Step                               | Result                                                                                                                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `.env.local`                    | "Create .env.local first: cp .env.example .env.local, then add your API key to it." (exit 2)                                                                               |
| Empty key                          | Only `OPENAI_API_KEY` is named (CONFIG_INVALID, exit 2).                                                                                                                   |
| Project                            | `.env` holds `COMPOSE_PROJECT_NAME=sourced-c74e9ea3`. The containers `sourced-c74e9ea3-*` run next to the other checkout's `sourced-db-1`, and that database is untouched. |
| Example ingest                     | "Indexed 35 documents: 201 new …", then "Next: ./sourced dev". The database was migrated by the CLI; no `init` was needed.                                                 |
| `dev`                              | "Sourced is running at http://localhost:3000". Health reports 35 documents and 201 chunks.                                                                                 |
| `ask`                              | Answered, with citations.                                                                                                                                                  |
| Mismatch dry run                   | A warning in plain words that names the bundled mock example, a full-rebuild estimate, and "Next: ./sourced ingest --rebuild".                                             |
| Mismatch ingest without a terminal | `CORPUS_MISMATCH` (exit 2), with `./sourced ingest --rebuild`.                                                                                                             |
| Mismatch `dev`                     | "The app did not start: …" and "Next: ./sourced ingest --rebuild", within seconds (exit 1). JSON mode returns the same error envelope.                                     |
| `reset` without a terminal         | Asks for `--yes`. With it: "Removed 8 sources and 35 indexed documents. Your files were not touched." The source list is empty.                                            |
| Own documents                      | "Added folder source my-docs (./my-docs).", then "Indexed 2 documents …", then `dev`, then a cited answer.                                                                 |
| `down`                             | Exit 0.                                                                                                                                                                    |

## Defects found and fixed during the rehearsal

1. **No migrations on the Docker path.** A fresh database was never migrated, because the quick start has no `init`. The first `ingest` failed with a generic message. The Docker CLI now migrates before database commands (97552bb).
2. **Demo-only settings requested on the first command.** Before any snapshot existed, the first command asked for demo-only settings. The CLI's loaded configuration now decides which settings are required (97552bb, ab365d3).
3. **Raw JSON output.** `ingest`, `add` and `reset` printed raw JSON in a terminal. They now print short summaries with the next command (97552bb, ab365d3).
4. **Unhelpful provider-error fix.** A provider error suggested `--help`. It now points at the key in `.env.local`.

## Open

- On the first run, the Docker image build failed once because `next/font` could not download Google Fonts. The launcher's fix text, "Check Docker is running, then retry", does not describe this; the retry passed. The same flake is known from CI.
- The rehearsal used mock mode. A live run with a real OpenAI key costs about $0.003 for the example. It was not run, because live spend needs the owner's approval; the owner's own test covers it.
- The Windows and Linux Docker paths are still not verified (known since v2.0.0).
