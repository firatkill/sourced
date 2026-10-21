# T-15 review notes

Hybrid retrieval uses the normative single SQL statement and transaction-local HNSW setting. The TypeScript reference uses identical scoring and bigint tie-breaking.

EXPLAIN (ANALYZE, BUFFERS) on the 201-chunk mock-ingested development corpus follows. Query-vector literals are abbreviated; plan shape, timings and buffer counts are preserved.

## Default planner

```text
Limit  (cost=42.87..42.97 rows=40 width=16) (actual time=157.495..157.499 rows=40 loops=1)
  Buffers: shared hit=508 read=279
  ->  Sort  (cost=42.87..43.37 rows=201 width=16) (actual time=157.494..157.496 rows=40 loops=1)
        Sort Key: ((embedding <=> '[1536 query dimensions omitted]'::vector))
        Sort Method: top-N heapsort  Memory: 27kB
        Buffers: shared hit=508 read=279
        ->  Seq Scan on chunks  (cost=0.00..36.51 rows=201 width=16) (actual time=3.929..157.320 rows=201 loops=1)
              Buffers: shared hit=505 read=279
Planning:
  Buffers: shared hit=145 read=17 dirtied=3
Planning Time: 20.463 ms
Execution Time: 157.555 ms
```

## Sequential scans disabled

```text
Limit  (cost=809.51..837.07 rows=40 width=16) (actual time=83.866..84.001 rows=40 loops=1)
  Buffers: shared hit=237 read=152
  ->  Index Scan using chunks_embedding_hnsw_idx on chunks  (cost=809.51..948.02 rows=201 width=16) (actual time=83.864..83.998 rows=40 loops=1)
        Order By: (embedding <=> '[1536 query dimensions omitted]'::vector)
        Buffers: shared hit=237 read=152
Planning:
  Buffers: shared hit=1
Planning Time: 0.060 ms
Execution Time: 84.016 ms
```

Validation: UT-05, IT-01 and IT-02 cover formula, limits, empty FTS, fixed ranking, numeric tie-breaking, ef_search and equality across 200 chunks / 20 queries. The reference SQL initially sorted text aliases on ties; it was corrected to qualify the bigint source columns. Production SQL remained unchanged. No new decisions or dependencies. Live evaluation remains deferred until the evaluation harness exists.

Acceptance commands: `pnpm lint`, `pnpm typecheck`, `pnpm test --maxWorkers=1`, `pnpm test:integration` passed (47 unit, 17 integration). Targeted V8 coverage reports 100% lines for rrf.ts.
