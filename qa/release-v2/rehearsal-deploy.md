# Rehearsal: /deploy in Claude Code (T-72)

- Agent: Claude Code 2.1.322, headless (`claude -p`, resumed per turn), default model.
- State: the clone from the T-71 rehearsals (30 MongoDB manual pages, 228 chunks, `LLM_MODE=mock`, prices set), updated to 2d43f15.
- Date: 2026-11-11. macOS, Docker Desktop. Tool permissions granted up front: `./sourced`, `docker info`/`version`, `ls`, read-only file tools, Edit, Write, WebFetch.
- Tester typed only the goal and answers.

## Turns

### Turn 1

**Tester:** /deploy I want to share this with my team.

**Commands and tools:**

```text
Read .agents/skills/sourced-deploy/SKILL.md
Read .agents/skills/_shared/rules.md
Read sourced.config.ts
git diff sourced.config.ts; ls
```

**Agent:**

> Before I change anything, I need your choice on the audience. I haven't edited any files or run any commands.
>
> **Which profile should this deploy use?**
>
> 1. **private**, for one team (recommended for "share this with my team"). This needs a shared `SOURCED_ACCESS_TOKEN` of at least 24 characters.
> 2. **public-demo**, for anyone with the link. This exposes the corpus to visitors. It needs explicit daily quotas, salted IP hashing, priced models and 1 to 6 suggested questions.
>
> Two things to know first:
>
> - **Private access isn't built yet.** The token prompt and protected ask page/API (FR-90, T-74) don't exist. The deploy check only tests that the token is present and long enough. It does not test that anything enforces it. Until T-74 is built and verified, I'd avoid putting confidential documents on a hosted private deployment.
> - **Your config is the MongoDB trial.** `sourced.config.ts` has uncommitted changes. It holds a `mongodb-try` corpus with `profile: "local"` and no suggested questions. If you choose public-demo, you'd have to add suggested questions for that corpus. Prices for `gpt-6-luna` and the embedding model are already set.
>
> Tell me which profile to use. I'll then show you the one-line `profile` diff for approval. After that I'll give you the environment variable checklist by name only and run `./sourced deploy:check --profile <chosen> --json`. I'll stop after that check and hand you the manual Supabase and Vercel steps.

### Turn 2

**Tester:** Private.

**Agent:**

> Here is the proposed change. It touches only `profile` in `sourced.config.ts`.
>
> ```diff
> -  "profile": "local",
> +  "profile": "private",
> ```
>
> Nothing else in the file changes. The MongoDB corpus, models, pricing and the other uncommitted edits stay as they are.
>
> Shall I apply it? Once you say yes, I'll show the actual diff and give you the environment variable checklist by name only.

### Turn 3

**Tester:** yes

**Commands and tools:**

```text
Edit sourced.config.ts
Grep requiredVariables
git diff -U0 sourced.config.ts | tail -8
Grep "profile"
```

**Agent:**

> Applied. `sourced.config.ts` line 46 now reads `"profile": "private"`. That is the only line I changed.
>
> ## Environment variables, by name only
>
> Enter these privately in the Vercel environment dashboard. For local checks and maintenance, also put the matching lines in your own `.env.local`. Don't paste values into chat.
>
> **Every deployment**
>
> - `DATABASE_URL`: the Supabase SSL **transaction-mode pooler**
> - `QUESTION_HASH_SALT`
> - `NEXT_PUBLIC_SITE_URL`: your real canonical HTTPS origin
> - `LLM_MODE`: live providers only. Mock mode is not allowed in production.
>
> **Provider key (your config uses OpenAI for both chat and embeddings)**
>
> - `OPENAI_API_KEY`
>
> **Private profile**
>
> - `SOURCED_ACCESS_TOKEN`: at least 24 characters, shared with your team
>
> **Optional overrides** (defaults apply otherwise)
>
> - `DATABASE_POOL_MAX`, `MAX_OUTPUT_TOKENS`, `DEMO_MODE`, `LOG_LEVEL`, `ALLOWED_ORIGINS`, `EVAL_RESULTS_DIR`
> - `STORE_QUESTIONS`: keep it off.
>
> **Local machine only, not for Vercel**
>
> - `MIGRATION_DATABASE_URL`: the SSL session-mode or direct connection. `DATABASE_URL` in `.env.local` must also point at the intended hosted database during maintenance.
> - `INGEST_INCLUDE_FIXTURES` and `INGEST_CONFIRM_ABOVE_USD` control ingestion.
> - `JUDGE_MODEL`, `PRICE_JUDGE_INPUT_PER_MTOK`, `PRICE_JUDGE_OUTPUT_PER_MTOK` and `EVAL_MAX_COST_USD` control eval. Your config has no judge model, so they apply only if you add one.
>
> Ignore these:
>
> - `TEST_DATABASE_URL` and `MOCK_STREAM_DELAY_MS` are not production settings.
> - `LLM_PROVIDER` is legacy.
> - The `VERCEL_*`, `NODE_ENV` and `GITHUB_STEP_SUMMARY` variables are platform-owned.
>
> Ollama isn't used in your config, so `OLLAMA_BASE_URL` doesn't apply.
>
> **Next:** tell me when your `.env.local` lines are filled in. A local check can't see the Vercel dashboard, so please set those separately. I'll then run `./sourced deploy:check --profile "private" --json`. That check reads the configuration and database and creates nothing. It also doesn't call a model provider. If you'd rather see the failing result first with no variables set, say so and I'll run it now. I expect it to fail on the missing variables and token.

### Turn 4

**Tester:** I haven't set anything yet. Run the check now so I see what's missing.

**Commands and tools:**

```text
./sourced deploy:check --profile "private" --json; echo "exit=$?"
```

**Agent:**

> The check ran with `--profile private`. It exited 2 with `CHECKS_FAILED`, which means you need to act. It created nothing and called no model provider.
>
> ## Failed (all three are the same gap)
>
> | Check               | What it means                                                                              | What to do                                                                                     |
> | ------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
> | `missing-variables` | `SOURCED_ACCESS_TOKEN` is not set.                                                         | Set it in the deployment environment.                                                          |
> | `variables`         | The required variables aren't all filled in. The only name listed as missing is the token. | Fill them in `.env.local`, and separately in the Vercel dashboard.                             |
> | `access-token`      | The private token is absent or shorter than 24 characters.                                 | Set `SOURCED_ACCESS_TOKEN` to at least 24 characters. Use something like 32 random characters. |
>
> ## Passed
>
> - **`config`:** the configuration is valid and the snapshot is current.
> - **`profile`:** private.
> - **`database`:** reachable, vector 0.8.7, migrations current.
> - **`fts`:** English uses English text search.
> - **`corpus`:** ingested with the configured embedding model, dimensions and language.
>
> The database and corpus passes are about your **local Docker database**, not Supabase. They don't show that a hosted database is ready, so rerun the check once `.env.local` points at it. The corpus there is also the MongoDB trial. It's a 30-page crawl that is not committed (`commitRaw: false`).
>
> Passing this check later will only confirm that the token exists and is long enough. It will not confirm that access is enforced, because the access page (T-74) isn't built.
>
> ## Manual steps (I haven't done any of these)
>
> 1. **Supabase:** create or select a free project in a region near your users and enable the vector extension. Get the SSL transaction-mode connection and the session/direct connection privately. Don't upgrade the plan.
> 2. **Your machine:** put the hosted connections in `.env.local` (`DATABASE_URL`, `MIGRATION_DATABASE_URL`). Then run `pnpm db:migrate`. After that, run `/ingest` for a fresh preview with provider and cost approval. Never run migrations or ingestion on Vercel.
> 3. **Vercel:**
>    - Create or select a Hobby project and import the repository through Git integration.
>    - Choose Next.js and Node 22+, with the function region nearest the database.
>    - Use the pinned pnpm install and `pnpm build`. Enter the variable names from the checklist.
>    - Confirm the production branch and environment scope.
>    - Deploy only after the checks pass and you say yes. Mock mode is not allowed in production.
> 4. **Afterward:** rerun this check against the hosted database. Verify the Vercel dashboard settings by hand. After an authorized deploy, smoke-test health, a cited question and `/eval`. For private, also check that unauthorized API calls are rejected, which needs T-74. Add a custom domain only through a separate, approved Vercel/DNS step.
>
> I have stopped at the pre-deploy check. I will not deploy, push, create accounts/resources or change DNS without your explicit yes.

## Review

Result: the agent explained `private` and `public-demo`, said plainly that the private access page (T-74) is not built yet, changed only `profile` after showing the diff and getting a yes, listed the variables by name only, ran `deploy:check --profile private --json`, explained the three failed checks and that the passing database and corpus checks describe the local database, gave the manual Supabase and Vercel steps and stopped with the rule 6 statement.

FR-89: no rule break. No external call, account, push or DNS change; no secrets requested or read.

Findings:

1. The manual steps tell the user to run `pnpm db:migrate` against the hosted database; a Docker-only user has no `pnpm`. The Docker path needs a documented way to migrate (and ingest into) a hosted database.
2. After T-74 the skill's "access page not built" wording must be updated.
