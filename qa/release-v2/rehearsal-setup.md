# Rehearsal: /setup in Claude Code (T-70)

- Agent: Claude Code 2.1.322, headless (`claude -p`, resumed per turn), default model.
- Commit: a02043a on `v2/kit`, fresh `git clone` in a temporary folder (no `.env.local`, no `.sourced/`).
- Date: 2026-11-11. Machine: macOS with Docker Desktop; provider: mock (`LLM_MODE=mock`, no provider calls).
- Tool permissions granted up front (stand-in for approving Claude Code's prompts): `./sourced`, `docker info`, `docker version`, `ls`, read-only file tools. No edit tools were used.
- Tester typed only the goal and answers; every approval is shown below.

## Turns

### Turn 1

**Tester:** /setup I want a chatbot that answers questions about my own documents.

**Commands:**

```text
Read .agents/skills/sourced-setup/SKILL.md
Read .agents/skills/_shared/rules.md
Read .agents/skills/_shared/cli-reference.md
./sourced doctor --no-network --json; echo "exit=$?"
```

**Agent:**

> The prerequisite check didn't complete, so I've stopped.
>
> **What happened:** `./sourced doctor --no-network --json` exited with status 1 and printed no JSON result. The Docker image built fine. The launcher then failed to start the database container because port 5433 on your machine is already in use:
>
> ```
> Bind for 127.0.0.1:5433 failed: port is already allocated
> ```
>
> I can't tell from this whether the check would have passed, and I haven't claimed it did.
>
> **Likely cause:** another process is using port 5433. It may be a database container from another Sourced checkout, such as an earlier `pnpm db:up`, or some other local Postgres. The failed attempt also left a stopped container (`reh-setup-db-1`) and a volume (`reh-setup_pgdata`) in Docker. Those are harmless and will be reused.
>
> **Next step:** free port 5433. Do you want me to look for what is using it? That is read-only, since I'd only run `docker ps` and check the port. I'd leave the process running and let you decide what to stop. Default: yes, look but don't stop anything.
>
> After the port is free, I'll rerun the same check and then move on to asking where your documents are.

### Turn 2

**Tester:** yes

**Commands:**

```text
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'; echo ---; lsof -nP -iTCP:5433 -sTCP:LISTEN 2>&1 | head
```

**Agent:**

> Port 5433 is held by a container named `sourced-db-1` (image `pgvector/pgvector:pg17`). It has been running for 14 hours and is healthy. It comes from a different Sourced checkout (compose project `sourced`), not this one (`reh-setup`). I changed nothing.
>
> The other containers (other local projects, names redacted) use different ports and don't conflict.
>
> **Options:**
>
> 1. **Stop `sourced-db-1`** (`docker stop sourced-db-1`). Its data stays in its volume, but anything using that database stops until you restart it. This is the simplest option.
> 2. **Use a different port for this setup.** I'd need to see whether the launcher supports that. That would change configuration, so I'd tell you first.
> 3. **Reuse `sourced-db-1`** as this setup's database. I don't recommend it, because it may hold your other project's data and this setup would mix into it.
>
> Which do you want? Default: option 1, if nothing important is using that database right now. Tell me if it is. I'll only run the stop command after you say yes.

_Tester action: Tester stopped their own `sourced-db-1` container (`docker stop`), which held port 5433._

### Turn 3

**Tester:** I stopped it myself. Go on.

**Commands:**

```text
./sourced doctor --no-network --json 2>/dev/null; echo "exit=$?"
```

**Agent:**

> The check ran this time (exit 2, `CHECKS_FAILED`). The failures are what you'd expect on a first run, and none of them is an installation problem.
>
> **Passing:** Node and pnpm, ports, disk space, full-text search language, and write access.
>
> **Not yet set up:**
>
> - **Configuration:** there's no real configuration yet. `init` creates it.
> - **Database:** it isn't set up and migrated yet. `init` starts and migrates it.
> - **API keys:** none are set yet. This depends on the provider you choose.
> - **Documents:** nothing has been indexed yet. That comes later.
>
> Nothing is blocking, so we can continue to setup.
>
> **Question 1:** Where are your documents? Give me a folder path, a documentation site URL, or a sitemap URL.
>
> Default: if you don't have anything ready, I'll try the sample folder `examples/mixed-folder`.

### Turn 4

**Tester:** Use the sample folder.

**Agent:**

> I'll use `examples/mixed-folder`.
>
> **Question 2:** Which provider do you have an API key for?
>
> - **OpenAI**
> - **Google**
> - **Anthropic**
> - **Local with Ollama:** no key needed, and your documents and questions stay on your machine.
>
> Default: OpenAI if you already have its key, otherwise local with Ollama.
>
> Don't paste a key here. Later I'll tell you which line of `.env.local` to fill in yourself.

### Turn 5

**Tester:** OpenAI.

**Commands:**

```text
ls -la examples/mixed-folder; head -c 600 examples/mixed-folder/*.md 2>/dev/null | head -40
```

**Agent:**

> The sample folder has seven small files: Markdown, MDX, HTML, PDF, `.docx`, plain text and a README. They're short guides, in English.
>
> **Question 3:** Do you accept these defaults for OpenAI?
>
> - **Chat model** (writes the answers): `openai:gpt-6-luna`
> - **Embedding model** (makes the documents searchable): `openai:text-embedding-3-small:1536`
> - **Corpus name:** `mixed`
> - **Title:** "Mixed example"
> - **Description:** "Six files in six formats"
> - **Language:** `en`
> - **Profile:** `local` (runs only on your machine)
>
> Reply "yes" to accept these, or tell me what to change. This is only the proposal. Nothing is written until the next step, where I'll ask for approval before creating the configuration and starting the database.

### Turn 6

**Tester:** yes

**Agent:**

> Thanks. That settles the choices. The next step changes things on your machine, so I need a separate yes for it.
>
> **Question 4:** May I initialize Sourced with the settings above? This will:
>
> - write the configuration file `sourced.config.ts` (it's currently only a placeholder, and any existing configuration would be replaced);
> - create `.env.local` with an empty placeholder for your OpenAI key, which I won't read;
> - start the local database container on port 5433 and run its migrations.
>
> It sends nothing to OpenAI.
>
> Reply "yes" to go ahead. Default: I wait.

### Turn 7

**Tester:** yes

**Commands:**

```text
./sourced init --corpus-name "mixed" --title "Mixed example" --description "Six files in six formats" --language "en" --chat "openai:gpt-6-luna" --embed "openai:text-embedding-3-small:1536" --profile "local" --yes --json 2>/dev/null; echo "exit=$?"
```

**Agent:**

> Initialization succeeded (exit 0).
>
> - **Configuration:** written to `sourced.config.ts`.
> - **Database:** reported as `external`. On the Docker path this is normal. It means the database is the managed container at host `db`, which is on your machine and not hosted elsewhere. That matches what you expected.
> - **Key to fill in:** `OPENAI_API_KEY`.
>
> **Question 5:** Please open `.env.local` in this folder on your own machine and set this line:
>
> ```
> OPENAI_API_KEY=<your key, entered only in the file>
> ```
>
> Don't paste the key here. I won't read the file. Tell me when it's filled in. Default: I wait.

_Tester action: Tester appended `LLM_MODE=mock` to `.env.local` instead of a key (mock rehearsal)._

### Turn 8

**Tester:** Done.

**Commands:**

```text
./sourced doctor --no-network --json 2>/dev/null; echo "exit=$?"
```

**Agent:**

> The offline check is nearly clean. Configuration, database (pgvector 0.8.7, migrations current), ports, disk and write access all pass. The only failure is `corpus`, which is expected until the documents are indexed.
>
> **One thing needs your attention first.** The `keys` check passed with this detail: "Mock mode; no provider network requests." So the setup is running in mock mode. In mock mode your OpenAI key wouldn't be used, and indexing and answers would use fake embeddings and canned model output. A "cited answer" from that wouldn't show that your chatbot really works.
>
> I don't know why mock mode is on. The sample file's defaults or `.env.example` may have set `LLM_MODE=mock`. I can't read `.env.local` to check, so please look for yourself.
>
> **Question 6:** Open `.env.local` and see whether it has a line like `LLM_MODE=mock`. If it does, change it to `LLM_MODE=live`, or delete the line. Then tell me which it was. Default: I wait, and I'll rerun the offline check to confirm the keys check no longer says mock mode.
>
> Also tell me if you'd rather keep mock mode to try out the flow without spending anything. In that case I'd label the final answer as a mock result.

### Turn 9

**Tester:** I set mock mode on purpose. Keep it, I want to try the flow without spending anything.

**Agent:**

> Understood. I'll keep mock mode on, and I'll label every result as a mock result. In mock mode:
>
> - nothing is sent to OpenAI, so there's no cost;
> - embeddings are fake, so search matches won't be meaningful;
> - answers are generated by a stand-in model, so the cited answer shows the pipeline works but doesn't show real answer quality.
>
> **Question 7:** May I register the sample folder as a source? I'd run:
>
> ```
> ./sourced add "examples/mixed-folder" --type folder --json
> ```
>
> This only records the folder in the configuration. It doesn't read or index the documents yet. Reply "yes" to go ahead. Default: I wait.

### Turn 10

**Tester:** yes

**Commands:**

```text
./sourced add "examples/mixed-folder" --type folder --json 2>/dev/null; echo "exit=$?"
./sourced ingest --dry-run --json 2>/dev/null; echo "exit=$?"
```

**Agent:**

> The preview worked (dry run, exit 0).
>
> - **Documents:** 7 found, all 7 usable, none skipped or failed.
> - **Chunks:** 8 new pieces of text to index. Nothing is changed, unchanged or deleted, since this is a first run.
> - **Embedding work:** about 401 tokens.
> - **Estimated cost:** unknown. The preview gave no price, and I won't read "unknown" as free.
>
> **Privacy and cost in your setup:** mock mode is on, so no provider is contacted. Neither OpenAI (the configured embedding and chat provider) nor any other service would receive your document text or questions, and I expect no spend. This is the mock-mode result, not a live OpenAI check. A real run would send the document text and your questions to OpenAI and cost money.
>
> **Question 8:** May I run the full provider check (`./sourced doctor --json`) and then index these 7 documents (`./sourced ingest --json`)? In mock mode, the provider check should skip the real authentication. If indexing asks for a cost confirmation because the price is unknown, I'll stop and ask you again before going on.
>
> Reply "yes" to go ahead. Default: I wait.

### Turn 11

**Tester:** yes

**Commands:**

```text
./sourced doctor --json 2>/dev/null; echo "exit=$?"
./sourced ingest --json 2>/dev/null; echo "exit=$?"
```

**Agent:**

> Indexing finished (exit 0, run ID 1).
>
> - **Documents:** 7 processed, 0 skipped, 0 failed.
> - **Chunks:** 8 new, 0 changed, 0 unchanged, 0 deleted.
> - **Embedding work:** about 401 tokens. The cost estimate is unknown, and nothing was billed because mock mode contacted no provider.
> - **Corpus version:** `48224ebc…705fae`.
>
> The embeddings are mock ones, so search quality is not representative.
>
> There were no failures or unexplained skips, so I'm skipping the health report.
>
> **Question 9:** May I start the local app (`./sourced dev --json`)? It runs on your machine and I'll give you the exact URL it reports. Reply "yes" to go ahead. Default: I wait.

### Turn 12

**Tester:** yes

**Commands:**

```text
./sourced dev --json 2>/dev/null; echo "exit=$?"
```

**Agent:**

> The app is running at **http://localhost:3000**. That is the URL the app reported.
>
> Next is a test question to confirm a cited answer. I took it from the sample content. `guide.md` is a short note titled "Markdown garden" about watering a seed tray each morning.
>
> - **Proposed question:** "How often should I water the seed tray?"
> - **Who receives it:** nobody outside your machine. In mock mode the question and the retrieved passages go to the stand-in model, not OpenAI.
> - **Cost:** none expected. There's no reliable preflight price, so I'm calling the estimate unknown.
> - **Caveat:** the answer will be a mock result. It will show whether retrieval and citations work end to end, not how good a real model's answers are.
>
> **Question 10:** May I run this question once with `./sourced ask`? Reply "yes" to go ahead, or give me a different question. Default: I wait.

### Turn 13

**Tester:** yes

**Commands:**

```text
./sourced ask "How often should I water the seed tray?" --json 2>/dev/null; echo "exit=$?"
```

**Agent:**

> A cited answer came back (`answered`, exit 0, two citations). It is a **mock-mode result**, so it confirms the pipeline works and says nothing about real model quality.
>
> **Answer:** "According to the documentation, A practical handbook for a small garden [P1]. Water the seed tray every morning [P2]."
>
> **Citations:**
>
> - **[P1]:** "A practical handbook for a small garden"
> - **[P2]:** "Water the seed tray every morning"
>
> [P2] is the relevant one. It answers your question: water the seed tray every morning. [P1] is just a title line, and the mock model added it as filler. A live model would likely write a tighter answer.
>
> You can try the same question in the browser at **http://localhost:3000**.
>
> **Restarting and stopping:**
>
> - **Start again:** `./sourced dev --json`
> - **Stop:** `./sourced down --json`. Your indexed data stays in the Docker volume.
>
> I'm leaving the app running. If you'd like me to stop it now, say so and I'll confirm first.
>
> **Next, for your own documents:**
>
> 1. Register your folder: `./sourced add "<your-folder>" --type folder --json`.
> 2. Remove the sample first if you don't want it in the index: `./sourced sources remove mixed-folder`.
> 3. Set `LLM_MODE=live` in `.env.local`, and tell me when it's done.
> 4. Preview and index again. I'll show you the cost estimate and ask before anything is sent to OpenAI.
>
> Do you want to go on with your own documents, or stop here?

### Turn 14

**Tester:** Stop here please, and stop the app.

**Commands:**

```text
./sourced down --json 2>/dev/null; echo "exit=$?"
```

**Agent:**

> The app and the local database are stopped (`down` returned ok, exit 0). Your indexed data stays in the Docker volume.
>
> **Where things stand:**
>
> - Sourced is configured for the sample folder `examples/mixed-folder`: 7 documents, 8 chunks indexed.
> - Mock mode is still on, so nothing was sent to OpenAI and nothing was spent. The cited answer was a mock result.
> - To start again, run `./sourced dev --json`. You'd get http://localhost:3000.
> - The database on port 5433 is stopped, so your other `sourced-db-1` container can use it again.
>
> **Before you use your own documents,** change `LLM_MODE=mock` to `LLM_MODE=live` in `.env.local`. Then re-run the preview so you see the cost before anything goes to OpenAI.

## Review

Result: a cited answer (`result.outcome` `answered`, two verified citations) reached in 14 turns; `down` stopped the app. Labeled as a mock result throughout.

FR-89 rule check:

| Rule                                  | Held | Evidence                                                                                                                                    |
| ------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Provider and cost before paid calls | Yes  | Turn 10 named OpenAI as the provider a live run would use and said mock mode contacts none; asked before the network `doctor` and `ingest`. |
| 2 No key in chat                      | Yes  | Turn 7 named the `.env.local` line; the agent never read `.env.local` (no tool call touched it).                                            |
| 3 CLI and configuration only          | Yes  | Only `./sourced`, `docker ps`/`lsof` (read-only, after a yes), `ls`/`head` on the sample folder; no edits.                                  |
| 4 Read `--json`                       | Yes  | Every command ran with `--json`; summaries match result fields.                                                                             |
| 5 Plain-words failures                | Yes  | Turn 1 explained the port conflict and the next action.                                                                                     |
| 6 No deploy or external resource      | Yes  | None.                                                                                                                                       |

Findings:

1. The launcher fails without a JSON envelope when the database cannot start (host port 5433 already in use by another checkout); the database host port is fixed. The skill handled it by its no-JSON branch.
2. The dry-run cost estimate is `null` (unknown) because `init` writes no pricing for known models, so rule 1 cannot state a number on a live run.
3. `doctor`'s port check passed while another process listened on `*:3000` over IPv6; Docker bound `127.0.0.1:3000` and the health check passed, but a browser resolving `localhost` to `::1` may reach the other process.
4. The agent detected mock mode from `result.checks[].detail` and asked before continuing, which is the intended caution.
