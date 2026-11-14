# Rehearsal: /ingest in Claude Code (T-71)

- Agent: Claude Code 2.1.322, headless (`claude -p`, resumed per turn), default model.
- State: fresh clone at ccd3438 (after D-130) initialized with `./sourced init` (corpus `mongodb-try`, OpenAI chat and embeddings, profile `local`) and `LLM_MODE=mock` in `.env.local`, as `/setup` leaves it, plus the MongoDB source from the /add-docs rehearsal. Edit was allowed so the agent could write `pricing` after a yes.
- Date: 2026-11-11. macOS, Docker Desktop. Tool permissions granted up front: `./sourced`, `docker info`/`version`, `ls`, read-only file tools, WebFetch.
- Tester typed only the goal and answers.

## Turns

### Turn 1

**Tester:** /ingest Index the MongoDB pages I added.

**Commands and tools:**

```text
Read .agents/skills/sourced-ingest/SKILL.md
Read .agents/skills/_shared/rules.md
Read .agents/skills/_shared/cli-reference.md
git diff sourced.config.ts && ls
./sourced ingest --dry-run --json; echo "exit=$?"
Read .agents/skills/_shared/pricing.md
```

**Agent:**

> The preview worked. I haven't indexed anything yet, and I need two answers from you first.
>
> **What the preview found** (nothing was sent to a model provider; the MongoDB pages were fetched):
>
> - **Pages:** it found 30 and can index 29. The `window-functions` page was skipped because the source's `maxPages: 30` limit was reached. None failed.
> - **Chunks:** 228 new chunks, about 62,379 embedding tokens.
> - **Boilerplate:** 28 chunks of repeated boilerplate were removed.
> - **Cost:** unknown. The `pricing` block in `sourced.config.ts` is empty, so there is no estimate. Unknown does not mean free.
>
> **Providers that would receive your text:**
>
> - **OpenAI `text-embedding-3-small`** would receive the document text now, and your questions later.
> - **OpenAI `gpt-6-luna`** would receive your questions and the retrieved passages when you ask.
>
> The estimate covers embedding only, not future questions. If you want the documents to stay on your machine, I can switch to Ollama instead.
>
> **My questions:**
>
> 1. May I look up the price on OpenAI's official pricing page (`https://developers.openai.com/api/docs/pricing`)? I would fetch that one page once. Then I'd propose a price for `text-embedding-3-small` and `gpt-6-luna`, and edit only the `pricing` block once you say yes. Default: yes.
> 2. After that, may I index these 29 pages with OpenAI at the resulting estimate? Default: wait.
>
> If you'd rather not look up the price, I can continue with the cost unknown. That needs your explicit yes, and I'd run the ingest with `--yes`.
>
> You may also want to raise `maxPages` if the 30th page matters. That would change the scope, so I'd preview again before running.

### Turn 2

**Tester:** Yes, look it up.

**Commands and tools:**

```text
WebFetch https://developers.openai.com/api/docs/pricing
```

**Agent:**

> I read OpenAI's pricing page (`https://developers.openai.com/api/docs/pricing`) on 2026-11-11. It lists both models at the standard tier:
>
> | Model                           | Input per 1M tokens | Output per 1M tokens                             |
> | ------------------------------- | ------------------- | ------------------------------------------------ |
> | `openai:text-embedding-3-small` | $0.02               | not applicable (embeddings have no output price) |
> | `openai:gpt-6-luna`             | $0.10               | $0.50                                            |
>
> I'd add this to the `pricing` block of `sourced.config.ts` and change nothing else:
>
> ```
> 'openai:text-embedding-3-small': { inputPerMTok: 0.02 },
> 'openai:gpt-6-luna': { inputPerMTok: 0.1, outputPerMTok: 0.5 },
> ```
>
> At $0.02 per million tokens, the 62,379 embedding tokens would cost about $0.0012. That is my own arithmetic. I'll confirm it against the CLI's estimate after the re-preview.
>
> May I write these prices into the config and re-run the preview? Default: wait.

### Turn 3

**Tester:** yes

**Commands and tools:**

```text
Edit sourced.config.ts
./sourced ingest --dry-run --json 2>/dev/null | grep '^{"schemaVersion"'; echo "exit=${pipestatus[1]}"
Grep estimatedCostUsd
Grep estimatedCostUsd|pricing|priceFor|inputPerMTok
git diff --stat; tail -15 sourced.config.ts; cat sourced | head -30
Read lib/cli/commands/ingest.ts
Grep pricePerMillion|price
Grep planIngest
Read lib/cli/commands/ingest-report.ts
grep -n "pricing" -r lib/kit lib/cli/*.ts | head -20; ls -la .sourced 2>/dev/null | head; ls -la sourced.config.ts
grep -n "snapshot" sourced lib/kit/runtime-config.ts | head -20; grep -o '"pricing":[^}]*}' .sourced/config.json
./sourced config:snapshot --json 2>/dev/null | grep '^{"schemaVersion"'; echo "exit=${pipestatus[1]}"; ./sourced ingest --dry-run --json 2>/dev/null | grep '^{"schemaVersion"'
grep -o '"pricing":[^}]*}' .sourced/config.json; ls -la .sourced; sed -n 1,80p lib/kit/runtime-config.ts
cat .sourced/config.json | head -c 1600; echo; grep -n "estimatedCostUsd\|dry" lib/cli/commands/ingest.ts | head -20
Read lib/cli/commands/ingest.ts
sed -n 36,70p lib/cli/schemas/ingest.ts; grep -n "pricing\|writeSnapshot" lib/kit/load-config.ts | head
./sourced ingest --dry-run --json 2>/dev/null | grep '^{"schemaVersion"' | grep -o '"totals":{[^}]*}[^}]*}[^}]*}[^}]*}' | head -c 600; echo; docker run --rm --entrypoint sh reh-kit-cli:latest -c 'grep -n "pricing" /app/lib/cli/commands/ingest.ts | head -3; grep -n "price === undefined" /app/lib/cli/commands/ingest-report.ts' 2>&1 | head
```

**Agent:**

> I'm still stuck on one thing: the preview still shows an unknown cost, and I've now ruled out the obvious causes. I'm stopping here to report rather than keep digging.
>
> **Done:** I added the two OpenAI prices to the `pricing` block of `sourced.config.ts`, and nothing else changed. I regenerated `.sourced/config.json`, and it now contains both prices. The Docker image also runs the same cost code as the repo.
>
> **Still wrong:** `./sourced ingest --dry-run --json` returns `estimatedCostUsd: null` on every run. The code in `lib/cli/commands/ingest.ts` and `lib/cli/commands/ingest-report.ts` should turn a configured embedding price into a number. So this looks like a possible bug in the CLI, either in how a dry run loads the config or in something I haven't found. I won't patch application code, because the skill and project rules say not to.
>
> **Where that leaves the plan:**
>
> - **Cost:** I can calculate it myself. 62,379 tokens at $0.02 per million is about **$0.0012**. That is my own figure, not the CLI's.
> - **Cost limit:** the CLI's cost-limit check also treats the estimate as unknown. It auto-proceeds only up to 1,000,000 tokens, and this job is well under that. So it likely won't block the real run, but I haven't confirmed that.
>
> **Your options:**
>
> 1. **Index now.** May I run `./sourced ingest --json` on the 29 pages? OpenAI `text-embedding-3-small` would receive the MongoDB page text, at an estimated cost of about $0.0012, which I computed myself. If the CLI asks for confirmation because of the unknown price, I'd come back to you before adding `--yes`.
> 2. **Investigate first.** I could dig further into why the preview shows `null`, but that would likely need a code change, which you'd have to ask for.
>
> Default: wait.

### Turn 4

**Tester:** 1, index now.

**Commands and tools:**

```text
./sourced ingest --json 2>/dev/null | grep -v '^{"event"' | tail -5; echo "exit=${pipestatus[1]}"
./sourced inspect --json 2>/dev/null | grep '^{"schemaVersion"'; echo "exit=${pipestatus[1]}"
```

**Agent:**

> The MongoDB pages are indexed, but the index is not fully clean: the health check flagged a warning about very short chunks.
>
> **What was indexed:**
>
> - **Run:** run ID `1`, corpus version `259a51f3…ce39dce0`.
> - **Pages and chunks:** 30 documents were indexed into 228 new chunks, with no failures. The earlier preview said 29 pages could be indexed; the run itself reports 30 done. I haven't reconciled that difference.
> - **Skipped:** the `window-functions` page was skipped because the `maxPages: 30` limit was reached.
> - **Tokens:** about 62,379 embedding tokens were sent to OpenAI `text-embedding-3-small`.
> - **Cost:** the CLI still reports it as unknown. My own estimate is about $0.0012, which is an estimate, not a bill.
> - **Boilerplate:** 28 repeated blocks were removed.
>
> **Health check** (the full report is at `corpus/mongodb-try/inspect.json`):
>
> - **Chunk sizes:** the smallest chunk is 15 tokens and the largest is 799.
> - **Warning, `tiny_chunks`:** 193 of the 228 chunks are very short. Search may match them poorly, and answers may quote thin context. To fix it, merge short sections or set `overrides.chunking.minTokens` in `sourced.config.ts`, then re-ingest. A change like that means a new preview and a new cost approval.
> - **Info, `boilerplate_removed`:** 28 repeated blocks were stripped. That is expected for crawled web pages, and no action is needed.
>
> **Open items:**
>
> - **Cost estimate:** the `null` estimate in the preview and the run looks like a CLI bug, still unresolved.
> - **30-page limit:** raise `maxPages` if you want the skipped page and more of the manual. I would preview again before running.
>
> I'd run `/check-quality` once you've decided about the short chunks, or if you choose to accept them. Do you want me to try adjusting the chunking first?

## Review

Result: after the price lookup (D-130) and a yes, ingest indexed 30 documents into 228 chunks and `inspect` ran; the agent explained the `tiny_chunks` warning with its fix and offered `/check-quality`.

A first attempt of this rehearsal (before ccd3438) fetched `https://openai.com/api/pricing`, got HTTP 403 and correctly kept the cost unknown and offered the two ways forward; the pricing guide now names the documentation pricing pages, which answer automated reads.

FR-89 check:

| Rule                                  | Held             | Evidence                                                                                                                                                        |
| ------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Provider and cost before paid calls | Partly           | Named OpenAI for embeddings and chat and asked before indexing; the CLI estimate stayed null (finding 1), so the agent gave its own arithmetic and labelled it. |
| 2 No key in chat                      | Yes              | `.env.local` not read.                                                                                                                                          |
| 3 CLI and configuration only          | Yes, with a note | Edited only the `pricing` block after a yes; read `lib/` files and ran `docker run` to diagnose finding 1 without changing code.                                |
| 4 Read `--json`                       | Yes              | Filtered the envelope line from the output.                                                                                                                     |
| 5 Plain-words failures                | Yes              | Turn 3 reported the unresolved estimate and options.                                                                                                            |
| 6 No deploy or external resource      | Yes              | None.                                                                                                                                                           |

Findings:

1. With `LLM_MODE=mock`, cost estimates look up the mock model's price, so they stay null even with `pricing` set (fix in progress).
2. Nothing in the CLI results says mock mode is on, so the agent told the tester the text was sent to OpenAI; a `MOCK_MODE` warning is being added.
3. `inspect` reported 193 of 228 MongoDB chunks as tiny; a quality item for `/check-quality` and `/tune`.
