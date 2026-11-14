# Newcomer release check in Codex (TC-245)

- Date: 2026-11-14
- Agent: Codex CLI 0.166.0, `codex exec --json` resumed per turn, sandbox `danger-full-access` (the `workspace-write` sandbox cannot reach the Docker socket; interactive Codex asks the user to run `./sourced` outside the sandbox instead), approved by the owner for a throwaway clone
- Copy: fresh git clone of v2/kit at 9de75a3; Docker path; no node_modules
- Provider: OpenAI live (gpt-6-luna, text-embedding-3-small)
- Tester typed only the goal, answered questions and filled the OPENAI_API_KEY line of .env.local outside the chat
- Result: PASS, cited answer reached (`ask` outcome answered, 1 citation); no FR-89 rule break; no step asked the tester to read code or docs; the key never appears in the session log

## Turns

### Turn 1

**Tester:** I want a chatbot over the Flask documentation.

**Commands:**

```text
read .agents/skills/sourced-setup/SKILL.md
read .agents/skills/_shared/rules.md .agents/skills/_shared/cli-reference.md
./sourced doctor --no-network --json
```

**Agent:**

> I’ll use the [official Flask documentation](https://flask.palletsprojects.com/en/stable/).
>
> Docker built successfully, but the setup check found unfinished configuration, database setup, provider settings, and an empty document index. No model provider was contacted.
>
> Which provider would you like: **OpenAI, Google, Anthropic, or local Ollama**? Default: OpenAI if you already have its key; otherwise Ollama. Don’t paste any keys here.

### Turn 2

**Tester:** OpenAI

**Commands:**

```text
rtk git status --short; if test -f sourced.config.ts; then cat sourced.config.ts; fi; if test -f .sourced/config.snapshot.json; then cat .sourced/config.snapshot.json; fi
```

**Agent:**

> This checkout has a PostgreSQL demo configuration. I propose replacing it with:
>
> - **Corpus:** `flask-docs`, titled “Flask documentation,” English.
> - **Description:** Answers from the official Flask documentation.
> - **Chat:** OpenAI `gpt-6-luna`.
> - **Embeddings:** OpenAI `text-embedding-3-small`, 1,536 dimensions.
> - **Profile:** Local.
>
> Initialization will replace the configuration, create environment placeholders, and prepare the local database. Provider calls and their cost approval come later.
>
> **May I initialize this configuration?** Default: wait.
>
> The [sourced-setup skill](.agents/skills/sourced-setup/SKILL.md) requires: “Before configuration writes…describe the exact action and ask for a yes in chat.” This also protects the existing PostgreSQL configuration from being replaced without your approval.

### Turn 3

**Tester:** yes

**Commands:**

```text
./sourced init --corpus-name "flask-docs" --title "Flask documentation" --description "Answers from the official Flask documentation." --language "en" --chat "openai:gpt-6-luna" --embed "openai:text-embedding-3-small:1536" --profile "local" --yes --json
```

**Agent:**

> The Flask configuration is initialized. It uses the local Docker database.
>
> Fill this line in `.env.local` on your machine:
>
> ```dotenv
> OPENAI_API_KEY=<your OpenAI API key>
> ```
>
> Don’t paste the key here. Tell me when it’s filled; I’ll then check the settings without making a paid model call.

_Tester action: The tester filled the OPENAI_API_KEY line of .env.local in an editor; the key never appeared in the chat._

### Turn 4

**Tester:** done, the key line is filled

**Commands:**

```text
./sourced doctor --no-network --json
```

**Agent:**

> The configuration, database, and key-presence checks passed. OpenAI authentication hasn’t been tested. The only failed check is the empty document index, expected before ingestion.
>
> May I register `https://flask.palletsprojects.com/en/stable/` as a crawl source, then preview document counts and embedding cost? This may fetch Flask’s website but won’t send text to OpenAI.
>
> The [setup skill](.agents/skills/sourced-setup/SKILL.md) requires: “Ask approval for adding the listed sources.” I’ll wait for your yes.

### Turn 5

**Tester:** yes

**Commands:**

```text
./sourced add "https://flask.palletsprojects.com/en/stable/" --type crawl --json
read .agents/skills/_shared/pricing.md sourced.config.ts
read ~/.codex/…
./sourced ingest --dry-run --json
```

**Agent:**

> The preview succeeded: **76 pages, 520 new searchable passages, approximately 157,759 embedding tokens**, with no skipped or failed pages.
>
> The cost remains **unknown**. [OpenAI’s pricing page](https://developers.openai.com/api/docs/pricing), checked November 14, lists `gpt-6-luna` at $0.10 input / $0.50 output per million tokens, but the retrieved page didn’t list the embedding model.
>
> Indexing sends document text to OpenAI for embeddings and contextual summaries. The provider check also sends a short test string; its cost is unknown. Future questions and retrieved passages go to OpenAI and incur separate charges. Ollama remains an all-local alternative.
>
> **May I run the provider check and index these documents despite the unknown total cost?** Default: wait.
>
> The [setup rules](.agents/skills/_shared/rules.md) require “before anything is sent to a provider…wait for a yes.” No document text has been sent to OpenAI yet.

### Turn 6

**Tester:** yes

**Commands:**

```text
./sourced doctor --json
./sourced ingest --yes --json
```

**Agent:**

> Indexed **76 Flask pages into 520 new searchable passages**, with no skips, failures, or warnings. The run used 157,759 embedding tokens; its cost estimate remains unknown.
>
> May I start the local app and test **“How do I register a blueprint in Flask?”** to verify a cited answer? The test sends the question and retrieved passages to OpenAI; its separate cost is unknown.
>
> The [setup skill](.agents/skills/sourced-setup/SKILL.md) requires approval before app startup and says to “Ask approval” for the test question. I’ll wait for your yes.

### Turn 7

**Tester:** yes

**Commands:**

```text
./sourced dev --json
./sourced ask "How do I register a blueprint in Flask?" --json
```

**Agent:**

> Your Flask chatbot is running at **[http://localhost:3000](http://localhost:3000)**, with 76 pages indexed.
>
> Verified answer: register a blueprint with `app.register_blueprint(simple_page)`, optionally adding `url_prefix='/pages'`. Citation P1 includes: `app.register_blueprint(simple_page)`.
>
> Try **“How do I register a blueprint in Flask?”** in the browser. The test answered successfully, although reranking timed out and used its fallback.
>
> - Restart: `./sourced dev --json`
> - Stop: `./sourced down --json` — indexed data is preserved.

## Review

- FR-89 (1): OpenAI was named as the receiver before the provider check, ingest and the test question; Ollama was offered twice. The agent found the chat price on the official page but not the embedding price, reported the cost as unknown (never free) and asked for an explicit yes, then ran `ingest --yes`.
- FR-89 (2): the agent named the `.env.local` line, said not to paste the key and never read the file.
- FR-89 (3) and (4): only `./sourced` commands, reading the skills and the pricing guide; results read from `--json`.
- FR-89 (5) and (6): no failures to report; the reranker fallback warning was explained; nothing deployed or pushed.
- Minor: turn 5 says indexing sends text for "contextual summaries"; contextual embedding only prefixes the page title and makes no chat call, so the disclosure overstates what is sent.
- Compared with Claude Code (TC-244): Codex asks fewer, broader questions (source chosen without a separate question) and did not offer to add the embedding price, so the ingest cost stayed unknown; both are within the skill rules.
