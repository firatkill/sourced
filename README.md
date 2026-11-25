# Sourced

**A kit for building a chatbot over your own documents.** Point it at a folder, a website or a Git repository, and you get a chat app whose answers cite the passages they use. The server checks every citation and quote against its passage before you see the answer. The same kit indexes your documents, measures answer quality and runs the app for you alone, for a team or for the public. Use it from the browser, the terminal or a coding agent.

## Links

[Live demo](https://sourced.firatkil.com) · [Evaluation](https://sourced.firatkil.com/eval) · [How it works](https://sourced.firatkil.com/how-it-works) · [Guide](docs/GUIDE.md)

## Demo

![A suggested question gets a checked answer, a citation opens the source viewer with its quote highlighted, and How this was answered expands.](docs/assets/demo.gif)

The live demo answers questions about 35 pages of the PostgreSQL 17 docs, the example that ships with the kit. Swap in your own documents and the rest of the kit stays the same.

## What's in the kit

One repository and one configuration file, [`sourced.config.ts`](sourced.config.ts), covering everything from your files to a running chatbot:

| Part                  | What you get                                                                                                                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chat app**          | A Next.js chat with saved chats, search, pins and projects (folders you drag chats into), follow-up questions, five themes and Markdown export. Citations open the original document, PDFs at the cited page.                                                                    |
| **Checked answers**   | Hybrid vector and keyword search in PostgreSQL with pgvector, a rerank step, and streamed answers. The server checks each citation and quote, removes invalid ones and refuses when no valid citation is left.                                                                   |
| **Sources**           | Folders and file globs, URL lists, sitemaps, same-origin crawls and local Git checkouts. Markdown, MDX, HTML, PDF, Word and plain text; with the optional [Docling](#better-reading-for-pdf-and-office-files-docling) reader, also scanned PDFs, complex layouts and PowerPoint. |
| **Providers**         | OpenAI, Google Gemini, Anthropic (answers only) or Ollama, chosen separately for answers and embeddings. With Ollama for every role, nothing leaves your machine.                                                                                                                |
| **The `sourced` CLI** | One command for each step: `init`, `add`, `ingest` (with a cost estimate first), `inspect`, `ask`, `eval`, `dev`, `deploy:check` and `doctor`. Every command has `--json` output for scripts and agents.                                                                         |
| **Quality checks**    | Golden questions you generate and review (`eval:generate`, `eval:review`), then an evaluation of retrieval, citation validity, faithfulness, refusals and injection resistance, with a cost guard. CI fails when a score drops below its floor.                                  |
| **Agent skills**      | `/setup`, `/add-docs`, `/ingest`, `/check-quality`, `/tune` and `/troubleshoot` for Claude Code and Codex. The agent runs the same commands and asks before it spends money.                                                                                                     |
| **Profiles**          | `local` for your own machine, `private` behind a shared access token, and `public-demo` with daily quotas, IP hashing and cached suggested answers. The live demo runs `public-demo`.                                                                                            |

## Quick start

You need two things:

- **Docker**: Docker Desktop on macOS or Windows, or Docker Engine with Compose on Linux. Docker is the only runtime prerequisite: the database (PostgreSQL with pgvector) runs inside Docker, so you install neither Node nor PostgreSQL.
- **An OpenAI API key** from [platform.openai.com/api-keys](https://platform.openai.com/api-keys). Other providers, and a fully local option with Ollama, are described under [Other providers](#other-providers).

**1. Get the code**

```sh
git clone https://github.com/firatkill/sourced.git
cd sourced
```

**2. Start it and follow the browser**

```sh
./sourced dev
```

The first run builds the Docker image, which takes a few minutes once. The command then prints a setup link. Open it, and the browser walks you through four steps:

1. **Data**: try the bundled example (35 pages of the PostgreSQL 17 docs) or use your own documents.
2. **Provider**: paste your key. Sourced checks it with one free request and saves it in `.env.local` on this computer; after that the browser only ever shows it masked.
3. **Documents**: drop files or a folder (Markdown, HTML, PDF, Word or text), or add a web page. Files are copied into `my-docs/`. You can also turn on [Docling](#better-reading-for-pdf-and-office-files-docling) here for scanned PDFs, complex layouts and PowerPoint slides.
4. **Index**: see which provider receives your text and what it costs, confirm, and watch the progress. You can close the tab; indexing keeps going.

Then ask, for example, “When should I use a partial index?”, and a follow-up such as “Can it also be unique?”.

Your chats are saved in the sidebar: rename them, pin them, drag them into projects, and come back to them later. Every answer cites the passages it used; for your own files, a citation opens the original document (PDFs at the cited page). **Settings** changes keys and models, adds or removes documents, exports a chat as Markdown, picks a theme, and resets the library or all data.

The setup link only works on this computer. Lost it? `./sourced setup` prints a new one.

### In the terminal

Every step also has a command. To add your key yourself instead of in the browser:

```sh
cp .env.example .env.local
```

Open `.env.local` and paste your key after `OPENAI_API_KEY=`. Then index the example once (about $0.003 with OpenAI) and start the app:

```sh
./sourced ingest
./sourced dev
```

## Use your own documents

In the browser, choose **My own documents** in setup step 1, or open **Settings › Library** later. In the terminal, remove the example first. `reset` deletes everything indexed and empties the source list. It asks before it deletes anything and never touches your files:

```sh
./sourced reset
```

Then add a folder of Markdown, HTML, PDF, Word (`.docx`) or plain-text files, or a website, index it and start the app:

```sh
./sourced add ./my-docs
./sourced ingest
./sourced dev
```

`ingest` prints the estimated cost before it sends anything to OpenAI, and stops to ask when the estimate is above $1. Run `./sourced ingest --dry-run` to see the estimate without indexing. Scanned PDFs and PowerPoint files need [Docling](#better-reading-for-pdf-and-office-files-docling). For a large folder, prefer `./sourced add <folder>`: the browser has to upload a copy of every file.

To go back to the example later, run `./sourced reset`, then `git checkout sourced.config.ts` and `./sourced ingest`.

Stop the app and the database with `./sourced down`; your data is kept for next time.

On Windows, use `sourced.cmd` instead of `./sourced` in Command Prompt, and `copy .env.example .env.local` instead of `cp`.

### Better reading for PDF and Office files (Docling)

The built-in readers handle ordinary text PDFs and Word files. [Docling](https://github.com/docling-project/docling) reads documents the way a person sees them: it recognizes text in scanned pages, keeps tables and multi-column layouts in order, finds headings, and also reads PowerPoint (`.pptx`) files. It is optional and off by default.

Docling runs in its own container on your computer; your files are not sent anywhere. It is a one-time download of about 2.1 GB (about 6.5 GB on disk), so check that Docker has room. Indexing PDFs becomes slower: Docling reads each page with layout and OCR models on your CPU, which can take a few seconds per page.

To turn it on, choose **Docling** under **Better reading for PDF and Office files** in setup step 3 or in **Settings › Library**, then run what the page shows:

```sh
./sourced docling on
```

It downloads Docling the first time, starts it, and waits until it is ready; the page notices on its own. Your next indexing run reads PDF, Word and PowerPoint files with Docling. Only passages that changed are embedded again, and Docling's results are kept in `.sourced/docling-cache/`, so unchanged files are not read again.

`./sourced docling status` says which reader is in use, and `./sourced docling off` goes back to the built-in readers and stops the container. `./sourced dev` starts Docling again after `./sourced down` when your library uses it. To free the disk space after turning it off, remove the image with `docker image rm quay.io/docling-project/docling-serve-cpu:v1.38.2`.

## Make it your own

Everything about your chatbot lives in `sourced.config.ts`: the name and description shown in the app, the sources, the models and their prices, the profile and the suggested questions. `./sourced init` writes one from flags, and `./sourced add` adds sources to it. A configuration for 200 pages of the MongoDB manual looks like this:

```ts
export default defineConfig({
  schemaVersion: 1,
  corpus: { name: 'mongodb-manual', title: 'MongoDB manual', language: 'en' /* … */ },
  sources: [
    {
      id: 'manual',
      type: 'sitemap',
      url: 'https://www.mongodb.com/docs/manual/sitemap-0.xml',
      include: ['/docs/manual/**'],
      maxPages: 200,
    },
  ],
  profile: 'local',
  models: {
    chat: { provider: 'openai', model: 'gpt-6-luna' },
    embed: { provider: 'openai', model: 'text-embedding-3-small', dimensions: 1536 },
  },
});
```

The full file is in [`examples/mongodb/`](examples/mongodb/sourced.config.ts); [`examples/mixed-folder/`](examples/mixed-folder/) has one small file in each supported format.

### Check answer quality

A chatbot over your documents is only useful if its answers hold up. The kit measures that on your own documents:

```sh
./sourced eval:generate --count 30
./sourced eval:review
./sourced eval
```

`eval:generate` drafts golden questions from your passages, `eval:review` lets you accept or fix them, and `eval` scores retrieval (recall, MRR), citation validity, faithfulness, false and correct refusals, and resistance to prompt injection. It prices the run first and stops at `EVAL_MAX_COST_USD`. On the PostgreSQL example the latest run scored 0.97 recall@5, 1.0 citation validity and 1.0 faithfulness, at about $0.0008 per question; the [Evaluation page](https://sourced.firatkil.com/eval) shows the full report. `./sourced inspect` shows how a source was split into passages, and `./sourced ask "…" --trace` shows what was searched and why an answer was given.

### Share it

Pick a profile in `sourced.config.ts` or with `SOURCED_PROFILE`:

| Profile       | For                                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `local`       | Your own machine. Setup and Settings in the browser, chats saved in the local database.                                       |
| `private`     | A team. Everyone needs the shared access token, which `init` generates in `.env.local`.                                       |
| `public-demo` | Anyone. Daily quotas, a salted and daily-rotating IP hash, cached suggested answers, chats kept in the visitor's browser tab. |

Before going live, `./sourced deploy:check --profile <profile>` checks the required variables (by name only), the database and its migrations, the index and the profile's own settings. Where you host it is up to you; neither the CLI nor the agent skills deploy anything on their own. The [guide](docs/GUIDE.md#operating-the-hosted-example) shows how the live demo is run with a capped LLM budget.

## With a coding agent

Open the folder in Claude Code or Codex and type `/setup`, or say “Set up a chatbot over my documents.” The agent runs the same commands, explains which provider receives your text and what it costs, and asks before it spends anything. Fill keys in `.env.local` yourself; never paste them into the chat.

| Command          | What it does                                                                          |
| ---------------- | ------------------------------------------------------------------------------------- |
| `/setup`         | Checks prerequisites, adds your documents, previews cost, indexes and starts the app. |
| `/add-docs`      | Adds a folder or website from your description and previews indexing.                 |
| `/ingest`        | Runs or resumes indexing and explains the health report.                              |
| `/check-quality` | Checks corpus health, helps you review test questions and runs evaluation.            |
| `/tune`          | Tries one configuration change, compares evaluation and keeps or reverts it.          |
| `/troubleshoot`  | Traces a wrong answer or a failed step and finds the likely cause.                    |

## Other providers

Google Gemini, Anthropic (answers only; it needs a separate embedding provider) and Ollama are supported. Put the provider's key in `.env.local` (the lines are in the file, commented out) and choose the models in `sourced.config.ts`. With Ollama for every role, nothing leaves your machine; it needs a running Ollama server with the models pulled, and no key. Changing the embedding model means indexing again: `ingest` tells you and asks first.

To try the app without any key, add `LLM_MODE=mock` to `.env.local`: answers and embeddings are stand-ins, so only use it to look around.

## If something goes wrong

- **A port is taken.** Set `SOURCED_PORT` (the app, default 3000), `SOURCED_DB_PORT` (the database, default 5433) or `SOURCED_DOCLING_PORT` (Docling, default 5001) in `.env.local`.
- **“The existing index was built with …”.** You changed the embedding model, or the database holds an older index. `./sourced ingest` asks whether to rebuild it.
- **The app does not start.** `./sourced dev` prints the reason and the command to run next. `docker compose logs app` shows the full log. `./sourced doctor` checks Docker, ports, disk space, the database and your keys.
- **“Docling is turned on for this library but is not running.”** Run `./sourced docling on`. If it never becomes ready, `docker compose logs docling` shows why; Docling needs a few GB of memory, which you can raise in Docker Desktop's settings.

Each checkout has its own database, so a second clone on the same machine starts empty.

## How it works

Sourced splits your documents into passages and stores them with their embeddings in PostgreSQL. For each question it combines vector and keyword search, reranks the candidates with the chat model and streams an answer from the best passages. The server checks every citation and quote against its passage, removes invalid ones and refuses when none remain. The [guide](docs/GUIDE.md) has the architecture, evaluation results, the Node path for contributors, privacy details and limits.

## License

MIT for code. Copyright (c) 2026 Fırat Kıl.

PostgreSQL 17 documentation, © The PostgreSQL Global Development Group, used under the [PostgreSQL License](corpus/postgres-17/LICENSE-POSTGRESQL.txt). See [NOTICE](corpus/postgres-17/NOTICE) for corpus attribution.

Built by Fırat Kıl · [firatkil.com](https://firatkil.com) · [GitHub](https://github.com/firatkill)
