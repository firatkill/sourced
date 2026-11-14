# T-64 any-corpus check

Date: 2026-11-11. Reviewer-run, on the Docker path, from a clean copy of the `v2/kit` tree (no `node_modules`, `.git`, `.env.local`, `.sourced`), with a distinct Compose project and ports. Only the user's OpenAI key was added to the copy's `.env.local` after `init`; it was removed afterwards. Machine: Apple M4, 10 cores, under load from other projects (load average about 8 to 15).

## A-25

MongoDB's `robots.txt` allows `/docs/` except `*.epub`, `*.pdf`, `/docs/atlas/app-services/`, `/docs/meta/`, `/docs/site-search/`, `/docs/openapi/` and `/docs-qa*`, and lists `https://www.mongodb.com/docs/sitemap-index-full.xml` (100 sitemaps). The manual's sitemap is `https://www.mongodb.com/docs/manual/sitemap-0.xml`. A-25 holds. The fetched pages are not committed; `examples/mongodb/sourced.config.ts` holds the configuration only.

## MongoDB manual, 200 pages (sitemap source, live embeddings)

Commands, as a newcomer runs them (TRD §35.4):

```bash
./sourced init --profile local --corpus-name mongodb-manual --title "MongoDB manual" --description "200 pages of the MongoDB manual" --language en --chat openai:gpt-6-luna --embed openai:text-embedding-3-small:1536 --yes --json
# add OPENAI_API_KEY to .env.local
./sourced add https://www.mongodb.com/docs/manual/sitemap-0.xml --type sitemap --id manual --include "/docs/manual/**" --max-pages 200 --yes --json
./sourced ingest --dry-run --yes --json
./sourced ingest --yes --json
./sourced dev
./sourced ask "…" --json
```

| Step                                    | Elapsed (s) | Result                                                                                |
| --------------------------------------- | ----------: | ------------------------------------------------------------------------------------- |
| First image build (earlier run, `init`) |         534 | kit image built                                                                       |
| `init` (image cached)                   |         179 | config, generated salts and URLs; database started                                    |
| `add`                                   |         183 | sitemap source with include and 200-page cap                                          |
| `ingest --dry-run`                      |         604 | 200 documents, 1,278 chunks, 342,449 embedding tokens, 567 boilerplate blocks removed |
| `ingest`                                |       1,134 | same counts, 0 failed                                                                 |
| `dev` + health                          |       1,154 | app healthy; page shows the runtime copy ("MongoDB manual")                           |
| two questions                           |       1,184 | one answered with a verified citation; one `not_found` (see below)                    |

Clone to cited answer: about 20 minutes with the image cached, about 29 minutes including the first image build. NFR-20 (at most 30 minutes, excluding embedding API time) is met, narrowly. Most of the time is fetching at one request per 2 seconds; `ingest` re-requests the pages the dry run had just fetched (conditional requests), about 9 minutes that a cache-aware ingest after a dry run could save.

Answers:

- "What is the difference between a replica set primary and a secondary?" answered with one verified citation, stating what the passages do not cover.
- "How do I create an index on a field in a collection?" returned `not_found`. The sitemap is alphabetical and the 200-page cap stopped in `administration/` and `applications/`; the only index-related page fetched is `applications/indexes/` (strategy). The kit refused rather than answering from outside the corpus. This is a coverage limit of the 200-page check, not a retrieval failure.

Cost: 342,449 embedding tokens (about $0.007 at $0.02 per million) plus two short questions. `estimatedCostUsd` was `null` because `init` writes no `pricing` entries; unknown prices below 1,000,000 tokens need no confirmation (D-112).

## Mixed folder (live embeddings)

`examples/mixed-folder/`: six short files (Markdown, MDX, HTML, PDF, `.docx`, plain text) written for the tests, MIT. `init … --source examples/mixed-folder`, then ingest, `dev` and two questions: 7 documents (the six files and the folder README), 8 chunks, 401 embedding tokens, both questions answered with verified file citations ("Water the seed tray every morning."). 72 seconds end to end with the image cached.

## Found and fixed during T-64

- The first runs used `--embed provider:model` without dimensions; `init` failed with a generic "The configuration is invalid" because the shared CLI router replaced field-level messages. Fixed in 8c3714e: configuration errors name the field and fix (FR-59), `--help` shows the value formats with an example, and Node-path `init` validates before writing files.

## Follow-ups (not blocking)

- `init` could write `pricing` entries for known models so reports show a cost instead of `null`.
- `ingest` right after `ingest --dry-run` could reuse the pages fetched by the dry run.
