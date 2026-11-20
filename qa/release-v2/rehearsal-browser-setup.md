# Rehearsal: browser setup on a clean clone (T-93)

- Commit: 4c62210 on `v2.3/setup-settings`, fresh `git clone` into a temporary folder (no `.env.local`, no `.sourced/`, no `node_modules`). The Advanced settings check below used 0b6590a.
- Date: 2026-11-20. Machine: macOS with Docker Desktop only; the in-app browser of Claude Code stood in for the newcomer's browser.
- Ports: `SOURCED_PORT=3190 SOURCED_DB_PORT=5441`, so the run did not touch the owner's own checkout.
- No real key was entered at any point. The first pass used live mode to see the key step; the rest used `LLM_MODE=mock`.

## Steps

1. `./sourced dev` on the clean clone. The image built from scratch (about 6 minutes), the launcher created an empty `.env.local` with mode `0600`, and it printed:

   ```text
   Sourced is running. Finish setup in your browser:
   http://localhost:3190/setup?token=<48 hex characters>
   Stop it with ./sourced down
   ```

   Exit code 0. No other terminal step was needed.

2. Opening the link showed step 1, **What should Sourced answer from?** The token left the address bar at once (`/setup`), swapped for the setup cookie.
3. With **Try the example first** and **Continue**, step 2 asked for the **OpenAI API key** and kept **Continue** disabled with no key. This is where a newcomer pastes a key; the rehearsal stopped here in live mode.
4. `LLM_MODE=mock` was added to the clone's `.env.local` and `./sourced dev` run again. The launcher reused the token, so the browser's cookie still worked. Step 2 then said "Mock mode: no provider is called, so no key is needed."
5. Step 4 showed the example's 35 documents (about 98,555 tokens) with **Sent to: Nobody (mock mode)**. **Start indexing** finished with "35 of 35 documents" and **Start chatting**.
6. **Start chatting** opened the chat with the example banner. The sample question "When should I use a partial index?" returned a cited answer: "2 of 2 citations checked against the docs", two `11.8 Partial Indexes` sources.
7. Settings › Models and keys and Settings › Library opened without a new link; Library listed 35 documents from 8 sources and offered **Remove the example**.
8. After the Advanced settings change (0b6590a), `./sourced dev` printed only "Sourced is running at http://localhost:3190", because setup was finished. `/setup` showed "Sourced is already set up with 35 documents" and, on step 2, the closed **Advanced settings** section with the answer, quality-check and embedding models.

Result: a clean clone with only Docker reaches a cited answer through the browser, with `./sourced dev` as the only command.

## Findings

| #   | Finding                                                                                                                                                   | Status                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | In mock mode the Index step said "Sent to: Nobody" but priced the run at $0.0020 from the pricing table.                                                  | Fixed in 254905d: mock mode shows `$0`; the setup E2E checks it.                                              |
| 2   | The owner asked for an Advanced settings section in setup so a newcomer can pick other models before the first index.                                     | Added in 0b6590a (D-149): answer, quality-check and embedding models on the Provider step, closed by default. |
| 3   | In mock mode the Advanced settings model lists said "(needs a key)".                                                                                      | Fixed: mock mode hides the key notes.                                                                         |
| 4   | The example banner in the chat still tells people to run `./sourced reset` and `./sourced add`; a browser user would look for Settings › Library instead. | Open, wording only; proposed for after v2.3.                                                                  |
| 5   | Step 1 defaults to **My own documents** even when the example is already indexed, so a returning person who presses **Continue** removes the example.     | Fixed: with the example already indexed, step 1 starts on **Try the example first**.                          |

## Clean-up

`./sourced down` in the clone, then the clone folder was deleted.
