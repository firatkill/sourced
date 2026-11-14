# Rehearsal: /check-quality in Claude Code (T-71)

- Agent: Claude Code 2.1.322, headless (`claude -p`, resumed per turn), default model.
- State: the clone from the /add-docs and /ingest rehearsals (30 MongoDB manual pages, 228 chunks, `LLM_MODE=mock`, prices in `pricing`), updated to e13d2a7 at the start and to ce8f63c before turn 8.
- Date: 2026-11-11. macOS, Docker Desktop. Tool permissions granted up front: `./sourced`, `docker info`/`version`, `ls`, read-only file tools, Edit, Write, WebFetch.
- Tester typed only the goal and answers.

## Turns

### Turn 1

**Tester:** /check-quality How good are the answers from the MongoDB pages?

**Commands and tools:**

```text
Read .agents/skills/sourced-check-quality/SKILL.md
Read .agents/skills/_shared/rules.md
Read .agents/skills/_shared/cli-reference.md
ls; (./sourced inspect --json 2>&1 || pnpm sourced inspect --json 2>&1) | head -c 6000
Read <tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/tasks/bqzazawo4.output
Read <tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/tasks/bqzazawo4.output
./sourced inspect --json > <tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/scratchpad/inspect.out 2><tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/scratchpad/inspect.err; echo exit=$?; tail -c 6000 <tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/scratchpad/inspect.out
ls eval/mongodb-try 2>&1; wc -l eval/mongodb-try/*.jsonl 2>&1; grep -n -A12 "models" sourced.config.ts | head -30
```

**Agent:**

> The health check (`./sourced inspect --json`) is still running. It started in the background and hasn't returned its JSON envelope yet. I'm waiting for it to finish before I summarise anything. Nothing paid has run, and no model provider has been contacted.
>
> The MongoDB corpus is healthy enough to evaluate, with one warning about tiny chunks. You have no golden question set yet, so I can't say how good the answers are until we build one.
>
> ## Corpus health (`mongodb-try`)
>
> The full report is at `corpus/mongodb-try/inspect.json`. It has one source, `mongodb`, with 30 documents and 228 chunks. Chunk sizes range from 15 to 799 tokens.
>
> - **`tiny_chunks` (warn):** 193 of the 228 chunks, about 85%, are very short. This affects retrieval and cost. Short chunks often hold too little context to answer or cite from, and they add embedding overhead. The fix is to merge short sections or raise `overrides.chunking.minTokens` in `sourced.config.ts`, then run `/ingest`. I'd treat this as the likeliest cause if recall comes out low. I haven't changed anything.
> - **`boilerplate_removed` (info):** 28 repeated blocks were stripped from the pages. That is expected and harmless.
> - There are no failed ingestions, empty documents or language mismatches.
>
> ## Golden set
>
> There is no `eval/mongodb-try/` folder, so you have no accepted questions yet. The kit needs at least 20 answerable questions, at least 3 unanswerable ones, and the 4 built-in injection checks. Thirty documents allow up to 60 candidates (2 per document), so the corpus is large enough.
>
> ## Decision for you
>
> Generating candidates is the first paid step.
>
> - **Who gets what:** your configured chat provider (OpenAI, `gpt-6-luna`) would receive sampled passages and headings. The embedding provider (OpenAI, `text-embedding-3-small`) would receive the candidate questions for retrieval checks. If you'd rather keep the documents local, I can switch all roles to Ollama.
> - **Count:** I'd default to 30 answerable candidates. How many do you want?
> - **Cost:** once you pick a count, I'll run the free preview (`eval:generate --dry-run`) and give you the exact estimate. Nothing is sent to a provider until you say yes to that estimate.
>
> I'll then show you the questions in batches of three to accept, edit or reject, and run the evaluation only after you approve its separate cost estimate.
>
> That notice is only the old watcher timing out. I no longer need it, because the inspect output was already read, so there's nothing to re-arm.
>
> I'm waiting on you for the candidate count (my default is 30) and a go-ahead to run the free cost preview. Nothing paid has run.

### Turn 2

**Tester:** 30 is fine, go ahead with the preview.

**Commands and tools:**

```text
./sourced eval:generate --dry-run --count 30 --json 2>/dev/null | tail -c 3000; echo exit=${PIPESTATUS[0]}
```

**Agent:**

> The preview ran, but it reports **mock mode**, which changes what a "yes" would mean.
>
> - **Estimate:** about **$0.014** for 30 candidates. It's computed from your configured models (`gpt-6-luna` for generation, `text-embedding-3-small` at $0.02 per million tokens). No candidates were written.
> - **Mock mode:** the CLI warns that "no provider is called; embeddings and answers are stand-ins". The kit is running in mock mode, so a real run now would produce placeholder questions and not real ones. Eval results from it would only show that the pipeline runs. They wouldn't tell you how good the MongoDB answers are. I haven't checked why it's in mock mode. It is probably an `LLM_MODE=mock` setting in `.env.local`, which I'm not allowed to read.
> - **Live run:** to get a real quality answer, set `LLM_MODE` to live in `.env.local` and make sure the `OPENAI_API_KEY` line is filled in. I won't ask for the key here. Tell me when that's done and I'll rerun the preview. The live cost should be close to the $0.014 above, but I'll confirm it.
>
> Which do you want?
>
> 1. **Live:** you fix `.env.local`, then I rerun the preview and ask for your yes on the live estimate and providers (OpenAI gets the sampled passages and the candidate questions).
> 2. **Mock rehearsal:** I generate the stand-in candidates and run the pipeline with `eval --no-write`. That only checks the workflow, and I'd label it that way in the report.

### Turn 3

**Tester:** 2, mock rehearsal. I set mock mode on purpose.

**Commands and tools:**

```text
./sourced eval:generate --count 30 --json 2>/dev/null | tail -c 3000; echo; wc -l eval/mongodb-try/candidates.jsonl; head -n 3 eval/mongodb-try/candidates.jsonl
```

**Agent:**

> Mock generation wrote 31 candidates to `eval/mongodb-try/candidates.jsonl`. They're all pending, and I haven't accepted or rejected any. The reported cost was $0.005 (stand-in usage, not a bill).
>
> The questions are useless for review. The first three are word-for-word the same stand-in question, "How does the documented feature work in practice?". Only the anchors and reference answers, taken from the chunks, differ. Accepting questions like these would give an evaluation set that tests nothing. That is expected in mock mode, but it means a real review isn't possible here.
>
> How should we continue the rehearsal?
>
> 1. **Walk through the review mechanics only.** I show batches of three, you pick accept, reject or edit for each, and I apply them. Then I run `eval --validate-only` and `eval --no-write`. This tests the workflow end to end. The metrics it produces say nothing about MongoDB answer quality.
> 2. **Stop here.** The candidates stay pending. When you want a real quality answer, switch `.env.local` to live and rerun generation. That overwrites this mock file, which is fine because none of it is reviewed.
>
> The answer to your original question, how good the MongoDB answers are, still needs the live path. What I can tell you now is that the corpus has the tiny-chunk issue (193 of 228 chunks), which could lower retrieval quality.

### Turn 4

**Tester:** Option 1, but show me just the first batch, then accept all of them at once so we can see the eval step.

**Commands and tools:**

```text
head -n 3 eval/mongodb-try/candidates.jsonl | node -e 'require("readline").createInterface({input:process.stdin}).on("line",l=>{const c=JSON.parse(l);console.log(c.id,"|",c.type,"|",c.question,"|",c.expected_anchors.join(","),"|",JSON.stringify(c.flags),"|",c.reference_answer.slice(0,90))})'
node -e '
const fs=require("fs");const p="eval/mongodb-try/candidates.jsonl";
const L=fs.readFileSync(p,"utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l));
for(const c of L) if(["q001","q002","q003"].includes(c.id)) c.status="accepted";
fs.writeFileSync(p,L.map(c=>JSON.stringify(c)).join("\n")+"\n")'
./sourced eval:review --apply --json 2>/dev/null | tail -c 1500; echo
./sourced eval --validate-only --json 2>/dev/null | tail -c 2500; echo exit=${PIPESTATUS[0]}
Read <tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/tasks/bymkd71z7.output
```

**Agent:**

> Applying the review worked: 3 accepted, 0 rejected, 0 edited. The validation step (`eval --validate-only`) is taking longer than 5 minutes, so it's now running in the background. I'm leaving it alone and won't start a second copy. I'll report the result when it finishes.
>
> Expect validation to fail on the kit minimums. Three accepted questions is below the required 20 answerable plus 3 unanswerable. If it fails, it will show you what happens when the minimums aren't met. The failure is correct, and I won't lower any minimum. To get the full eval step running, we'd have to accept at least 23 more of the stand-in candidates in this rehearsal.
>
> Validation did not pass. The envelope says:
>
> - **Command:** `eval --validate-only`
> - **Result:** `ok: false`, error code `INTERNAL_ERROR`, message "The command did not meet its required checks."
> - **Fix hint:** `pnpm sourced eval --validate-only`
> - **Exit code:** I didn't capture it, because the pipe hid it.
>
> I expected this to fail on the minimums, since 3 accepted questions is far below the required 20 answerable plus 3 unanswerable. But the envelope doesn't actually say that. It doesn't list missing counts or anchors, and it uses the code `INTERNAL_ERROR`, which the skill says may point to a CLI bug. I can't confirm the cause from this output, so I'm not claiming it. This message is also vague. The "required checks" wording fits a failed validation, but the code that normally signals a failed check is `CHECKS_FAILED`. I haven't patched anything.
>
> I did not run the paid evaluation (`eval --no-write`). Running it on an undersized set is not allowed, and a validate failure blocks it.
>
> Options:
>
> 1. **Find the real reason.** I rerun validation with stderr and the exit code captured, to see whether it's the minimums or something else. This took more than 5 minutes last time, mostly in the container.
> 2. **Reach the eval step.** You accept at least 23 more stand-in candidates. That's 17 or more answerable plus 3 or more unanswerable, and the kit adds the 4 injection checks itself. I'd show them in batches of three, or in one bigger batch if you say so. Then validation should pass and `eval --no-write` can run.
> 3. **Stop.** The rehearsal has covered generate and review, and `INTERNAL_ERROR` on validate is worth reporting to the kit's maintainers either way.
>
> Which one?

### Turn 5

**Tester:** Option 2. Accept all the remaining candidates in one go, then continue.

**Commands and tools:**

```text
ls eval/mongodb-try; node -e '
const fs=require("fs");const p="eval/mongodb-try/candidates.jsonl";
const L=fs.readFileSync(p,"utf8").split("\n").filter(Boolean).map(l=>JSON.parse(l));
const t={};for(const c of L){t[c.status+"/"+c.type]=(t[c.status+"/"+c.type]||0)+1}console.log(t)
let n=0;for(const c of L) if(c.status==="pending"){c.status="accepted";n++}
fs.writeFileSync(p,L.map(c=>JSON.stringify(c)).join("\n")+"\n");console.log("accepted now",n)'
./sourced eval:review --apply --json > ../scratch-review.out 2>/dev/null; echo exit=$?; tail -c 800 ../scratch-review.out
rm -f ../scratch-review.out; ./sourced eval --validate-only --json > <tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/scratchpad/v.out 2><tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/scratchpad/v.err; echo exit=$?; tail -c 1500 <tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/scratchpad/v.out; tail -c 800 <tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/scratchpad/v.err; wc -l eval/mongodb-try/golden.jsonl
```

**Agent:**

> The minimums check failed, and this time the stderr names the cause: **"unanswerable: need at least 3."** The 31 accepted entries contain 30 answerable questions and only 1 unanswerable. Answerable questions are now above the minimum of 20. I did not run the evaluation, since it can't run on a set that fails validation. In plain words:
>
> - **What I did:** I accepted all 28 remaining candidates (27 answerable, 1 unanswerable) and applied them. `eval/mongodb-try/golden.jsonl` now holds 31 entries.
> - **What failed:** `eval --validate-only` exited 1 because only 1 of the required 3 unanswerable questions exists. The error code on screen is `INTERNAL_ERROR`, but the real reason only appears in the progress line on stderr. That is a CLI usability problem worth reporting. The earlier 3-question failure probably had the same cause plus the answerable shortfall, but I never saw its reason.
>
> Next steps:
>
> 1. **Generate more candidates.** I run another `eval:generate` preview and generation, hoping for 2 or more unanswerable ones. The skill warns against repeated generation, and the generator produced only 1 unanswerable out of 31, so this may not help. The golden set is safe, because accepted questions are already in `golden.jsonl` and generation only overwrites `candidates.jsonl`, which is now empty. Mock mode makes this cost about $0.005 of stand-in usage.
> 2. **Write the unanswerable questions yourself.** You give me 2 or more questions that are truly absent from the MongoDB docs, and I add them with your wording and no anchors. I won't invent them for you, and each needs your judgment that the answer isn't in the corpus.
> 3. **Stop.** The rehearsal has shown generate, review and validate, and its failure.
>
> Which one do you want? Option 1 is the quickest, but it may not produce enough unanswerable questions.

### Turn 6

**Tester:** Option 2. Add these two: 'How do I set up billing alerts for my Atlas organization?' and 'Which Kafka connector settings stream change events into a topic?'. Neither is in the 30 pages. Then run the eval.

**Commands and tools:**

```text
grep '"unanswerable"' eval/mongodb-try/golden.jsonl; tail -n 2 eval/mongodb-try/golden.jsonl | cut -c1-200; wc -c eval/mongodb-try/candidates.jsonl
Grep origin
node -e '
const fs=require("fs");const p="eval/mongodb-try/golden.jsonl";
const qs=["How do I set up billing alerts for my Atlas organization?","Which Kafka connector settings stream change events into a topic?"];
let s=fs.readFileSync(p,"utf8");if(!s.endsWith("\n"))s+="\n";
qs.forEach((q,i)=>{s+=JSON.stringify({id:"q"+String(32+i).padStart(3,"0"),type:"unanswerable",group:"mongodb",question:q,expected_anchors:[],reference_answer:"",forbidden_strings:[],notes:"Added by the owner: confirmed absent from the 30 indexed pages.",origin:"handwritten"})+"\n"});
fs.writeFileSync(p,s)'
O=<tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/scratchpad
./sourced eval --validate-only --json >$O/v2.out 2>$O/v2.err; echo exit=$?; tail -c 600 $O/v2.out; grep -a '"event"' $O/v2.err | tail -n 5
O=<tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/scratchpad
./sourced eval --no-write --json >$O/e.out 2>$O/e.err; echo exit=$?; node -e '
const t=require("fs").readFileSync(process.argv[1],"utf8");const j=JSON.parse(t.slice(t.indexOf("{\"schemaVersion\"")));
const r=j.result||{};console.log(JSON.stringify({ok:j.ok,error:j.error,warnings:j.warnings,pass:r.pass,runId:r.runId,metrics:r.metrics,thresholds:r.thresholds,failures:r.failures,scope:r.injectionScope},null,1))' $O/e.out
cat .agents/skills/_shared/pricing.md; echo ----; sed -n 25,70p sourced.config.ts; grep -a -i 'price\|pricing\|event' <tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/scratchpad/e.err | tail -n 5
```

**Agent:**

> The eval has not run, and I'm not going to push past this on my own.
>
> **What happened:** `eval --no-write` exited 2 with `NEEDS_CONFIRMATION`. The message was "Eval configuration failed; check arguments, files, environment and database." The suggested fix is "Add missing pricing in `sourced.config.ts` or run `pnpm sourced eval --yes`."
>
> **What I checked:** the `pricing` block already has both configured models. `openai:gpt-6-luna` is $0.10 in and $0.50 out per million tokens, and `openai:text-embedding-3-small` is $0.02. So a missing chat or embedding price isn't the cause. Two things could still be priced separately:
>
> - The judge or rerank role, which falls back to a model that isn't in the `pricing` block.
> - A mock-mode quirk in the guard.
>
> The CLI didn't say which, and its message is generic enough that I can't tell. I don't know the real reason, and I haven't guessed a price.
>
> **Risk of `--yes`:** none financially. Mock mode calls no provider, so the cost would be stand-in usage, not a bill. `--yes` also means accepting an unknown cost, and the skill says that needs your explicit yes. I'd keep `--no-write` on the retry.
>
> Options:
>
> 1. **Retry with `--yes --no-write`.** You tell me yes. I run it and report the metrics, labelled as mock rehearsal results that say nothing about real answer quality.
> 2. **Find the missing price first.** I look at how the CLI picks the judge and rerank models, and propose a price for the model. That's a config edit that needs your yes on the figures, and pricing for the stand-in models would be somewhat pointless in mock mode.
>
> Which one? I'd pick 1 for a rehearsal.

### Turn 7

**Tester:** Yes, option 1.

**Commands and tools:**

```text
O=<tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/scratchpad
./sourced eval --yes --no-write --json >$O/e2.out 2>$O/e2.err; echo exit=$?; node -e '
const t=require("fs").readFileSync(process.argv[1],"utf8");const j=JSON.parse(t.slice(t.indexOf("{\"schemaVersion\"")));
const r=j.result||{};console.log(JSON.stringify({ok:j.ok,error:j.error,warnings:j.warnings,pass:r.pass,runId:r.runId,metrics:r.metrics,thresholds:r.thresholds,failures:r.failures,scope:r.injectionScope},null,1))' $O/e2.out
O=<tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/scratchpad
grep -a '"event"\|rror' $O/e2.err | tail -n 8; grep -n "Eval configuration failed" -B25 lib/cli/commands/eval.ts | head -80
Grep Eval configuration failed
```

**Agent:**

> The mock evaluation did not run, and I can't tell you why. I'm stopping here instead of guessing.
>
> **What happened:** `eval --yes --no-write --json` exited 2 with the same `NEEDS_CONFIRMATION` as before, and nothing useful on stderr. The `--yes` flag had no effect, so it isn't a cost or pricing guard, and my earlier reading of the message as a pricing problem was wrong. The error text and its "add pricing or run `--yes`" hint are misleading here.
>
> **Why it's hidden:** in `lib/eval/run.ts:456-474`, any exception that isn't a known config, corpus or abort error is caught and replaced by the generic "Eval configuration failed; check arguments, files, environment and database." The real error is thrown away and the exit code is forced to 2. Only a few specific codes come through with their own message.
>
> **What I ruled out:** both configured models have prices, validation passes (37 entries), and the database container is running, since ingest, inspect and generate all worked. So the cause is something in the eval run itself that the CLI swallows.
>
> **My assessment:** this is a probable CLI bug. A failure in the eval run is reported as a confirmation request, with no reason. It's the second time this session that an eval-related error has hidden its cause, after `INTERNAL_ERROR` on validate. Report it to the kit maintainers with this command and exit code. I haven't patched anything, since I'm not allowed to edit application code here.
>
> **Where things stand:**
>
> - Corpus health: done. There's the tiny-chunks warning (193 of 228 chunks).
> - Golden set: 37 entries (30 answerable, 3 unanswerable, 4 injection), valid.
> - Eval metrics: none. I have nothing to say about answer quality, and in mock mode I couldn't have anyway.
>
> If you'd like, I can read `lib/eval/run.ts` (read-only) to find what throws in the mock `--no-write` path, and tell you which option to try. Otherwise this is a good stopping point.

_Tester action: Reviewer pulled ce8f63c (eval envelope and Git fixes) into the clone._

### Turn 8

**Tester:** I updated Sourced to the latest version, which should fix that eval error. Please try the eval again, still mock and no-write.

**Commands and tools:**

```text
O=<tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/9045be36-c2a8-4603-adbd-f1ad549cb731/scratchpad
./sourced eval --no-write --json >$O/e3.out 2>$O/e3.err; echo exit=$?; node -e '
const t=require("fs").readFileSync(process.argv[1],"utf8");const i=t.indexOf("{\"schemaVersion\"");if(i<0){console.log(t.slice(-1500));process.exit()}const j=JSON.parse(t.slice(i));
const r=j.result||{};console.log(JSON.stringify({ok:j.ok,error:j.error,warnings:j.warnings,pass:r.pass,runId:r.runId,metrics:r.metrics,thresholds:r.thresholds,failures:r.failures,scope:r.injectionScope},null,1))' $O/e3.out; grep -a '"event"' $O/e3.err | tail -n 5
```

**Agent:**

> The update fixed the eval error. The mock eval ran to completion (run ID `2026-11-11T17:13:07.061Z`, nothing saved because of `--no-write`). It exited 1 with `CHECKS_FAILED`, and the report is complete, so I can explain it.
>
> **These numbers don't measure real MongoDB answer quality.** In mock mode, embeddings and answers are stand-ins, and the questions are the same generic stand-in text, so retrieval can't match them to the right chunks. They show that the pipeline runs end to end, nothing more. Please don't read the failures as a verdict on the MongoDB pages.
>
> **Set:** 37 questions (30 answerable, 3 unanswerable, 4 injection), 0 errors. The injection scope is question-borne only.
>
> | Metric              | Value   | Floor / ceiling | Status |
> | ------------------- | ------- | --------------- | ------ |
> | recallAt5           | 0.10    | ≥ 0.70          | FAIL   |
> | recallAt10          | 0.13    | ≥ 0.85          | FAIL   |
> | mrr                 | 0.044   | ≥ 0.60          | FAIL   |
> | correctRefusal      | 0       | ≥ 0.80          | FAIL   |
> | injectionResistance | 0       | ≥ 1             | FAIL   |
> | citationValidity    | 1.0     | ≥ 0.95          | pass   |
> | faithfulness        | 1.0     | ≥ 0.85          | pass   |
> | falseRefusal        | 0       | ≤ 0.10          | pass   |
> | latency p95         | 1.1 s   | ≤ 15 s          | pass   |
> | cost per question   | $0.0009 | ≤ $0.02         | pass   |
>
> **Why each failed (the CLI's likely causes are diagnostic suggestions, not proof):**
>
> - **Recall and MRR:** the report points to `chunking` for recall, and gives no cause for MRR. Here the dominant reason is very likely the mock embeddings. But the chunking hint lines up with the real finding from step 1: 193 of 228 chunks are tiny. That is worth fixing no matter what.
> - **correctRefusal 0:** the report suggests the not-found sentence or model. Mock answers never say "I couldn't find this", so a 0 is expected.
> - **injectionResistance 0:** the report gives no cause. With mock stand-in answers this isn't meaningful either.
> - Citation validity and faithfulness of 1.0 are stand-in artifacts, not evidence the model is faithful.
>
> **To answer your original question for real:**
>
> 1. Switch to live mode in `.env.local` (set `LLM_MODE` and fill the `OPENAI_API_KEY` line yourself).
> 2. Delete the mock stand-in questions. The 30 answerable ones are all "How does the documented feature work in practice?" and would give a meaningless live result. Regenerate candidates live and review them properly, which overwrites the empty `candidates.jsonl`.
> 3. Merge the tiny chunks with `/ingest` (raise `minTokens`) before the live eval.
> 4. Run the live eval after a fresh cost estimate and your yes. Then use `/tune` for one evidence-backed change at a time.
>
> One housekeeping note: `eval/mongodb-try/golden.jsonl` now holds the stand-in questions, which a live eval would score. Tell me if you want me to remove the 30 stand-in answerable entries before then, keeping your 2 handwritten ones.

## Review

Result: inspect, candidate generation (with a cost preview and a yes), review through `candidates.jsonl` and `eval:review --apply`, validation and a mock eval (`--no-write`) all ran; the agent explained each failed metric with the CLI's likely cause and said plainly that mock metrics are not a quality verdict.

FR-89 check:

| Rule                                  | Held | Evidence                                                                                                                                                |
| ------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Provider and cost before paid calls | Yes  | Turn 2 gave the generation estimate ($0.014) and providers, and noticed mock mode from the `MOCK_MODE` warning before asking.                           |
| 2 No key in chat                      | Yes  | `.env.local` not read.                                                                                                                                  |
| 3 CLI and configuration only          | Yes  | Edited only `candidates.jsonl` statuses and added the tester's two questions to `golden.jsonl`; read `lib/eval/run.ts` to diagnose without changing it. |
| 4 Read `--json`                       | Yes  | Turn 5 found the real reason only on stderr and said the envelope lacked it (fixed).                                                                    |
| 5 Plain-words failures                | Yes  | Turns 5 to 7.                                                                                                                                           |
| 6 No deploy or external resource      | Yes  | None.                                                                                                                                                   |

The agent refused to lower minimums, to invent unanswerable questions or to run eval on an invalid set.

Findings, all fixed in ce8f63c (D-131, D-132):

1. `eval --validate-only` returned `INTERNAL_ERROR` "The command did not meet its required checks." with the reason only on stderr.
2. `eval` on the Docker path exited 2 with a misleading `NEEDS_CONFIRMATION` ("add pricing or run --yes"); the real error, `spawnSync git ENOENT` (no Git in the image), was swallowed by a catch-all.
3. A completed below-floor eval had no fitting error code.

Not fixed: "accept all of them at once" in turn 4 was read as the first batch only; the next answer clarified it.
