# Rehearsal: /add-docs in Claude Code (T-71)

- Agent: Claude Code 2.1.322, headless (`claude -p`, resumed per turn), default model.
- State: fresh clone at 1ac1ec3 initialized with `./sourced init` (corpus `mongodb-try`, OpenAI chat and embeddings, profile `local`) and `LLM_MODE=mock` in `.env.local`, as `/setup` leaves it.
- Date: 2026-11-11. macOS, Docker Desktop. Tool permissions granted up front: `./sourced`, `docker info`/`version`, `ls`, read-only file tools, WebFetch.
- Tester typed only the goal and answers.

## Turns

### Turn 1

**Tester:** /add-docs Add the MongoDB manual. I only want to try about 30 pages for now.

**Commands and tools:**

```text
Read .agents/skills/sourced-add-docs/SKILL.md
cat .agents/skills/_shared/rules.md | head -60; ./sourced sources list --json; curl -s https://www.mongodb.com/robots.txt | head -40; curl -s https://www.mongodb.com/docs/sitemap.xml | head -c 600
curl -s https://www.mongodb.com/robots.txt | grep -iE "sitemap|docs|crawl-delay"; for u in https://www.mongodb.com/docs/manual/sitemap.xml https://www.mongodb.com/docs/sitemap-index.xml; do echo "== $u"; curl -s -o /dev/null -w "%{http_code} %{content_type}\n" $u; done
curl -s https://www.mongodb.com/docs/sitemap-index.xml | head -c 1500; echo; curl -s https://www.mongodb.com/docs/manual/ -o /dev/null -w "%{http_code}\n"
curl -s https://www.mongodb.com/docs/sitemap-0.xml -o /tmp/x 2>/dev/null; f=$(mktemp -p "$TMPDIR" 2>/dev/null || echo <tmp>/sm.xml); curl -s https://www.mongodb.com/docs/sitemap-0.xml -o $f; grep -o '<loc>[^<]*' $f | wc -l; grep -o '<loc>https://www.mongodb.com/docs/manual[^<]*' $f | wc -l; grep -o '<loc>https://www.mongodb.com/docs/manual[^<]*' $f | sed 's#<loc>https://www.mongodb.com/docs/manual/##' | cut -d/ -f1 | sort | uniq -c | sort -rn | head
f=<tmp>/sm.xml; grep -o '<loc>[^<]*' $f | head -60
d=<tmp>/-private-tmp-claude-501--Users-firatkil-Documents-GitHub-sourced-0deda49a-ecfd-49ed-bf4a-023db88150cf-scratchpad-reh-kit/b15427c6-5bcc-4e8b-91ef-bb691a6c3110/scratchpad; mkdir -p $d/mdb; curl -s https://www.mongodb.com/docs/sitemap-0.xml -o $d/mdb/s0.xml; grep -o '<loc>[^<]*' $d/mdb/s0.xml | head -60
curl -s https://www.mongodb.com/docs/manual/ | grep -o 'href="/docs/manual/[^"]*"' | sort -u | head -30; curl -s https://www.mongodb.com/docs/manual/ | grep -o 'href="/docs/manual/[^"]*"' | sort -u | wc -l
```

**Agent:**

> The MongoDB manual is at `https://www.mongodb.com/docs/manual/`, and the registered sources list is empty, so there are no ID conflicts.
>
> - **Sitemap:** MongoDB's sitemap (`/docs/sitemap-0.xml`) doesn't list any `/docs/manual/` pages, so a sitemap source would find nothing.
> - **Crawl:** a crawl from the manual root works. The root page links to about 28 manual pages.
> - **robots.txt:** it allows the manual. It disallows `/docs/*.pdf`, `/docs/*.epub`, `/docs/meta/`, `/docs/site-search/`, `/docs/openapi/` and `/docs/atlas/app-services/`, and the crawl will respect that.
>
> **Proposed registration**
>
> - Location: `https://www.mongodb.com/docs/manual/`
> - `--type crawl`
> - `--id mongodb`
> - `--group mongodb`
> - `--include "/docs/manual/**"`
> - `--exclude "/docs/manual/release-notes/**"`
> - `--max-pages 30`
> - `--max-depth 2`
>
> The release notes are excluded because they are version-history noise. The root link set is wide, so 30 pages is a quick sample, not an even sample of the manual. The crawl stops at 30 pages, and a cap hit doesn't mean the manual is fully covered. Fetching is rate-limited and stays on `www.mongodb.com` under `/docs/manual/`.
>
> The preview only counts and estimates. No document text goes to a model provider.
>
> May I register this source with these rules and preview it? Default: wait. Say yes to accept all of it, or change any value, such as the 30-page cap, the depth, or the release-notes exclusion.

### Turn 2

**Tester:** yes

**Commands and tools:**

```text
./sourced add "https://www.mongodb.com/docs/manual/" --type crawl --id mongodb --group mongodb --include "/docs/manual/**" --exclude "/docs/manual/release-notes/**" --max-pages 30 --max-depth 2 --json 2>&1 | tail -c 1500
./sourced ingest --dry-run --source mongodb --json 2>&1 | grep -E '^\{"(schemaVersion|event":"(warn|error))' | tail -3 | cut -c1-6000
```

**Agent:**

> The MongoDB manual is registered as source `mongodb`, and the dry-run preview came back clean. No embedding call has been made.
>
> **Registered**
>
> - Crawl root: `https://www.mongodb.com/docs/manual/`
> - Include: `/docs/manual/**`
> - Exclude: `/docs/manual/release-notes/**`
> - Limits: 30 pages, depth 2
>
> **Preview**
>
> |                            | Count                           |
> | -------------------------- | ------------------------------- |
> | Documents discovered       | 30                              |
> | Documents usable           | 30                              |
> | Documents failed           | 0                               |
> | Documents skipped          | 1                               |
> | New chunks                 | 228                             |
> | Estimated embedding tokens | about 62,000                    |
> | Estimated cost             | unknown (the CLI returned null) |
>
> - **Skip:** `/docs/manual/reference/mql/window-functions/` was skipped with the reason "maxPages reached". The 30-page cap stopped the crawl, so more manual pages exist beyond this sample.
> - **Boilerplate:** the crawler removed page boilerplate from 28 pages.
> - **Cost:** a null cost means unknown, not free. It depends on the embedding provider you choose.
>
> Run `/ingest` when you want to index it. That step will name the provider that receives the document text and the cost estimate, and wait for your yes before anything is sent. If you'd rather keep the documents local, it can use Ollama.

## Review

Result: the source was registered as a crawl of `/docs/manual/` (30 pages, depth 2, release notes excluded) and its dry run was explained: 30 documents, 228 new chunks, about 62,000 embedding tokens, one page skipped at the page cap, cost unknown. No embedding call.

FR-89: no rule break. No provider call; the agent asked before `add`; no secrets read; results read from `--json`.

Findings:

1. Discovery made about eight requests to mongodb.com within seconds (robots.txt, sitemap index, the sitemap twice, the manual root twice) with `curl`, although the skill asks to space requests by the CLI's per-host interval. The skill should limit discovery to robots.txt, one sitemap and the root page.
2. The agent concluded that `sitemap-0.xml` lists no `/docs/manual/` pages, while T-64 used that sitemap with the same include rule; the crawl it chose worked, so the effect was a different source type, not a failure.
3. Cost unknown on the dry run (no `pricing` yet); resolved by D-130 in the `/ingest` rehearsal.
