# Rehearsal: /troubleshoot in Claude Code (T-72)

- Agent: Claude Code 2.1.322, headless (`claude -p`, resumed per turn), default model.
- State: the clone from the T-71 rehearsals (30 MongoDB manual pages, 228 chunks, `LLM_MODE=mock`, prices set), updated to 2d43f15.
- Date: 2026-11-11. macOS, Docker Desktop. Tool permissions granted up front: `./sourced`, `docker info`/`version`, `ls`, read-only file tools, Edit, Write, WebFetch.
- Tester typed only the goal and answers.

## Turns

### Turn 1

**Tester:** /troubleshoot I asked 'How do I create an index on a field?' and the answer was useless.

**Commands and tools:**

```text
Read .agents/skills/sourced-troubleshoot/SKILL.md
cat .agents/skills/_shared/rules.md; echo ------; cat .agents/skills/_shared/pricing.md; echo -----; cat sourced.config.ts; git diff .gitignore | head -20; ls corpus eval; ls .env.local 2>&1 | head -1
Grep ask
./sourced inspect --json 2>&1 | head -c 5000; echo; echo ----; ./sourced doctor --no-network --json 2>&1 | head -c 3000
./sourced doctor --no-network --json 2>/dev/null | tail -1 | head -c 3000; echo; python3 -I -c "
import json;d=json.load(open('corpus/mongodb-try/inspect.json'));print(json.dumps(d)[:1500])"; ls corpus/mongodb-try | head
```

**Agent:**

> I haven't reproduced the answer yet. That step needs your OK, and one finding may already explain the useless answer.
>
> **Local checks (no provider calls)**
>
> - **Mock mode is on.** `doctor` reports `MOCK_MODE`: "no provider is called; embeddings and answers are stand-ins". If your question ran in this mode, the useless answer is expected. Mock answers can't tell us anything about real model quality.
> - The rest of `doctor` passes. Config, database, migrations and corpus are healthy, and the corpus matches the configured embedding settings.
> - Provider authentication and embedding dimensions weren't checked, because I used `--no-network`.
> - **Chunking looks poor.** `inspect` reports 228 chunks across 30 MongoDB pages, and 193 of them (85%) are flagged `tiny_chunks`. The smallest is 15 tokens and the largest 799. Many chunks that small probably lack the context a "create an index" answer needs. Also, 28 repeated boilerplate blocks were removed.
>
> **Current classification:** _suspected_ chunking, and possibly mock mode. I can't confirm either from these checks alone. I also can't tell yet whether the passages with the index instructions were retrieved at all.
>
> **To reproduce I need a yes from you.** I'd run `./sourced ask "How do I create an index on a field?" --trace --json` once.
>
> - If mock mode is really on, no provider is contacted and it costs nothing. It would only show retrieval behaviour, not model quality.
> - If you switch to live mode first (the key line in `.env.local` is yours to fill in), OpenAI would receive the question. It would embed the question with `text-embedding-3-small` and send the question plus the retrieved passages to `gpt-6-luna` for reranking and answering. The configured prices are $0.02 per million input tokens for the embedding model and $0.10 input / $0.50 output per million tokens for the chat model. One question costs a fraction of a cent. Ollama is available instead if you want everything to stay local.
>
> **Questions for you**
>
> 1. Did you ask in mock mode or live mode? Do you expect me to run it live?
> 2. Do I have your OK to run the single trace in whichever mode you choose?
> 3. Which page should have answered this? For example, the MongoDB `createIndex()` page.
>
> **Likely next steps**
>
> - If the trace shows the index passages weren't retrieved, or are tiny fragments, I'd go to `/tune` to adjust `overrides.chunking.minTokens` as one measured change, followed by `/ingest`.
> - If the answer was only mock output, no repair is needed, and I'd rerun it live.

### Turn 2

**Tester:** Mock mode, on purpose. Yes, run the trace. I expected the createIndex page or the indexes page.

**Commands and tools:**

```text
./sourced ask "How do I create an index on a field?" --trace --json 2>/dev/null | tail -1 > <tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9280aaf4-9d74-4b3c-bcf4-adbdc3eaf742/scratchpad/ask.json; python3 -I -c "
import json
d=json.load(open('<tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9280aaf4-9d74-4b3c-bcf4-adbdc3eaf742/scratchpad/ask.json')
print(d.get('ok'),d.get('error'),d.get('warnings'))
r=d.get('result',{})
print(r.get('outcome'));print(r.get('answer'));print(r.get('citations'))
t=r.get('trace',{})
for k,v in t.items():
  if k!='passages': print(k,json.dumps(v))
for p in t.get('passages',[]):
  print({k:(v[:120] if isinstance(v,str) else v) for k,v in p.items()})
"
cd <tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9280aaf4-9d74-4b3c-bcf4-adbdc3eaf742/scratchpad && cat > show.py <<'EOF'
import json
d=json.load(open('ask.json'))
print(d.get('ok'),d.get('error'),d.get('warnings'))
r=d.get('result',{})
print(r.get('outcome'));print(r.get('answer'));print(r.get('citations'))
t=r.get('trace',{})
for k,v in t.items():
  if k!='passages': print(k,json.dumps(v))
for p in t.get('passages',[]):
  print({k:(v[:150] if isinstance(v,str) else v) for k,v in p.items()})
EOF
wc -c ask.json; python3 -I show.py
ls corpus/mongodb-try/raw | head -40; grep -ril "createIndex" corpus/mongodb-try/raw | head
cd <tmp>/-Users-firatkil-Documents-GitHub-sourced/0deda49a-ecfd-49ed-bf4a-023db88150cf/scratchpad/reh-kit/corpus/mongodb-try/raw/mongodb && for f in b0416b14095a7ad50802864f0c9588464fb22378 37ec3366733b07c4a6033cbce85828fad154b007; do grep -o '<title>[^<]*' $f.html | head -1 | cut -c1-80; grep -o 'createIndex' $f.html | wc -l; done; grep -l 'canonical' *.html | head -0; grep -ho '<link rel="canonical" href="[^"]*' *.html | grep -i -E 'index|create'
```

**Agent:**

> I reproduced it in mock mode, and the cause is **Sources**: the page that answers your question isn't in the corpus. Retrieval is working fine.
>
> **What the trace shows**
>
> - The ask finished with outcome `answered`. Both citations passed verification, with `invalid` empty and `quoteFallbackUsed` false. The embedder and answer model are mock stand-ins, so I'm not judging their quality.
> - Retrieval did its job. It found 40 vector candidates and 9 full-text candidates, and reranking did not fall back. The Indexes page, "Use Cases" section, ranked first on both vector and full-text search and stayed first after reranking. That page is `/docs/manual/indexes/`, one of the two pages you expected.
> - The top passage only says "create an index on those fields to improve performance". It doesn't contain any steps for creating one.
> - The passage that gets closest is P3, "Create and Manage Indexes with a Driver Method or the MongoDB Shell". It's only a short list of links ("Create an Index", "Create a…"), and the pages it links to aren't in the corpus.
> - P2 (the `_id` field) is off-topic. P5 (time series) and P6 (aggregation stages) are also unrelated filler.
>
> **Why the how-to isn't there**
>
> - The corpus is 30 pages from a crawl with `maxDepth: 2` and `maxPages: 30`. Those limits cut off before reaching the "Create an Index" page or the `createIndex()` reference page.
> - `createIndex` appears in only two ingested pages: "Databases and Collections" and "Transactions". Neither is a how-to.
>
> **Chunking is a secondary issue.** `inspect` flagged 193 of 228 chunks as tiny. The `documentTitle` and heading text also carry long `arrow-right…menu-vertical` strings from the page navigation, which adds noise to the passages. That's a separate problem. Fixing it wouldn't give this question an answer, because the needed text was never ingested.
>
> **Limit of this trace:** it shows final passages and candidate counts only. I can't say whether the missing page was ever a candidate, but the raw files show it was never ingested.
>
> **Next step:** `/add-docs`. Add the "Create an Index" page and the `createIndex()` reference page to the registered sources, or raise `maxDepth`/`maxPages`. Then run `/ingest` and ask again. Raising `maxPages` increases crawl size and ingest cost.
>
> I haven't changed any files or configuration. Should I move on to `/add-docs`? Separately, I can run `/tune` for the tiny-chunk and navigation-text problem.

## Review

Result: the agent ran the free checks first (`doctor --no-network`, `inspect`), noticed mock mode from the `MOCK_MODE` warning, asked before `ask --trace`, and classified the cause as **sources** from the trace: the indexes page ranked first but holds no how-to, and the "Create an Index" and `createIndex()` pages were never ingested because of the 30-page, depth-2 crawl limits. It named chunking as a secondary issue and pointed to `/add-docs`, then `/ingest`.

FR-89: no rule break. No provider call (mock); asked before the trace; `.env.local` only checked for existence with `ls`; no edits.

Findings:

1. The generic HTML parser keeps icon names from MongoDB's navigation in headings and document titles (`arrow-right…menu-vertical`), adding noise to passages; this is a likely contributor to the `tiny_chunks` finding (193 of 228).
2. The trace shows final passages and candidate counts, not candidate identities, so the agent could not tell whether a missing page had been a candidate (it checked the raw cache instead, read-only).
