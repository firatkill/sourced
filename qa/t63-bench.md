# T-63 search scale benchmark

## Method

This is a provisional proving run; the reviewer takes the official measurement on
an idle machine. The earlier official run of the original generator (load 3–4)
reported p50 **28 ms**, p95 **807 ms**, p99 **1,016 ms** and failed NFR-21.

Both profiles contain 100,000 chunks across 5,000 documents, with deterministic
1536-dimensional mock embeddings. They live only in `sourced_bench`: the realistic
profile in `bench_realistic`, the original worst case in `public`. The existing
HNSW and GIN definitions and retrieval constants are unchanged. No live model
calls occur. `--regenerate` replaces these benchmark corpora only; ordinary runs
reuse complete corpora whose generator fingerprint matches.

The realistic generator reads the committed HTML Git objects under
`corpus/postgres-17/raw/`, uses the example configuration's DocBook parser and the
real chunker, then cycles evenly over every resulting chunk. It preserves whole
sentences, code, vocabulary, term frequencies and token lengths; there is no term
filtering based on the queries. The last incomplete cycle introduces at most one
extra copy per source chunk. Twenty consecutive chunks form each synthetic
document. This is a distribution-preserving scale fixture, **not 5,000 independent
real documents**: repeated text and identical mock vectors can affect HNSW ties,
cache locality and candidate diversity. It does not establish retrieval quality.

The realistic queries include all 32 answerable committed golden questions, one
manually written semantic paraphrase per question, and fixed request variants:
224 unique queries total. These are 64 base formulations, not 224 independent
information needs. The unchanged 200-query synthetic workload runs against the
original high-frequency synthetic text as the explicitly labelled worst case.
Neither workload is selected or filtered using observed latency or match counts.

Each profile warms every query, then measures one sequential pass through the
real `search()` path (including schema checks, transactions and candidate counts;
excluding mock embedding calculation). Percentiles use nearest rank. Diagnostics
run only after the timed pass: full FTS match counts for every query and
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for every twentieth query starting at
zero. The latter captures and rebinds the actual SQL emitted by `search()`, with
the same transaction-local HNSW setting; no alternate search implementation is
used. EXPLAIN is a separate execution, so its timings do not sum to the earlier
client latency. Parallel-worker times and parent/child node times overlap.

Stdout is one JSON summary with `profiles.realistic` and `profiles.worstCase`,
including per-query latency, match count, sampled full plans, source hashes,
length statistics, database/index details and machine/load details. Progress is
written to stderr. Benchmark execution is not added to CI.

## Proving run

Measured 2026-11-11 02:02:54 UTC. Results are provisional:

| Profile    | Queries | p50 ms |    p95 ms |    p99 ms | p95 ≤300 ms      |
| ---------- | ------: | -----: | --------: | --------: | ---------------- |
| Realistic  |     224 | 15.878 |    70.396 | 2,108.859 | Yes, provisional |
| Worst case |     200 | 58.458 | 1,154.187 | 1,968.473 | **No**           |

Realistic material: 35 pages, 201 parsed chunks; source token lengths min 8,
median 546, max 797. FTS matched 0–19,388 chunks per query (median 0); **192/224
queries matched none**. Worst case matched 0–79,750 (upper-middle median 41);
100/200 matched none. Natural-language questions are passed unchanged to
`websearch_to_tsquery`; its conjunction semantics often yield no lexical hits,
while `or` in prose can broaden a query. Consequently the realistic p95 must not
be interpreted as uniformly fast FTS: q005-0 took 2,726.421 ms with 17,909 matches,
and q004-1 took 2,176.726 ms with 19,388. These slow queries were retained.

Apple M4, 10 logical CPUs, 24 GiB RAM, Darwin 25.6.0 arm64, Node 24.10.0;
PostgreSQL 17.11 / pgvector 0.8.7. `shared_buffers=128MB`, `work_mem=4MB`,
`effective_cache_size=4GB`. Index build only: `maintenance_work_mem=1GB`, zero
parallel maintenance workers. One-minute load was 5.04→5.00 for realistic and
5.88→4.86 for worst case. Neither is an official idle-machine result.

The retained database is **3,384,358,579 bytes (3.15 GiB)** across both profiles.
The complete per-query JSON and plans are at `/tmp/sourced-t63-profiles.json`;
progress is at `/tmp/sourced-t63-profiles.log`. These temporary artifacts are not
committed. Sampled plans also expose `executionMs`, `vectorCteMs`, and `ftsCteMs`;
the proving run's plans were enriched with these derived fields after execution,
without rerunning or replacing latency samples.

### EXPLAIN findings

Twelve realistic and ten worst-case plans were sampled. Representative inclusive
CTE branch times (milliseconds):

| Query            | FTS matches | Vector |       FTS | SQL execution |
| ---------------- | ----------: | -----: | --------: | ------------: |
| Realistic q001-0 |           0 |  1.182 |     0.637 |         2.357 |
| Realistic q028-5 |       1,989 |  0.865 |    55.248 |        56.757 |
| Worst worst-0    |      38,000 | 12.820 |   698.211 |       712.698 |
| Worst worst-140  |      40,250 | 10.754 | 1,333.927 |     1,346.508 |

The worst-0 plan used HNSW for vector candidates but a **sequential scan** for
FTS: 38,000 matching rows were ranked before the top-40 sort/limit. Its FTS branch
recorded 91,877 shared blocks read and 361,728 hits, including repeated/TOAST
accesses; these are not distinct physical pages. Thus merely having a GIN index
does not bound rank work. The selective realistic q028-5 used GIN, but ranking
1,989 matches still dominated that sampled query. EXPLAIN timings are separate
executions; cache state explains some differences from timed client requests.

No search SQL, retrieval constants or index definitions were changed. The
realistic p95 clears the target provisionally, while the high-match failure and
realistic tail remain. Follow-up options for owner/reviewer consideration only:
profile the slow realistic queries explicitly; investigate FTS ranking/TOAST I/O
and memory behavior; evaluate a bounded lexical candidate stage (which changes
ranking/recall), or a ranking-aware index (which adds a dependency). Any such
change needs its own approved retrieval design and quality evaluation. No option
has been implemented here.
