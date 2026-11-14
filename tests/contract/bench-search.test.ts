import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  benchQueries,
  benchTarget,
  benchText,
  percentile,
  realisticMaterial,
  realisticChunk,
  realisticQueries,
  explainTemplate,
  explainTimings,
} from '../../scripts/bench-search';
import { featureHash } from '@/lib/llm/feature-hash';
import { EMBEDDING } from '@/lib/config';

test('T-63 / NFR-21: benchmark refuses dev, test, remote and URL-option targets', () => {
  for (const url of [
    'postgres://localhost/sourced',
    'postgres://localhost/sourced_test',
    'postgres://remote.example/sourced_bench',
    'https://localhost/sourced_bench',
    'postgres://localhost/sourced_bench?host=remote.example',
  ])
    expect(() => benchTarget(url)).toThrow();
  expect(benchTarget('postgres://localhost:5433/sourced_bench').pathname).toBe('/sourced_bench');
});
test('T-63 / NFR-21: repeatable worst-case queries, high-frequency chunks and 1536-dimensional mock vectors', () => {
  expect(new Set(benchQueries).size).toBeGreaterThanOrEqual(200);
  expect(benchQueries.some((q) => q.includes(' OR '))).toBe(true);
  expect(benchQueries.some((q) => q.includes('"'))).toBe(true);
  expect(benchQueries.some((q) => q.includes('-error'))).toBe(true);
  for (const index of [0, 19, 100, 99999]) {
    const text = benchText(index);
    expect(text).toBe(benchText(index));
    expect(text.split(/\s+/).length).toBeGreaterThan(200);
    expect(text.split(/\s+/).length).toBeLessThan(1000);
    expect(featureHash(text).vector).toHaveLength(EMBEDDING.DIMENSIONS);
  }
  expect(benchText(0)).not.toBe(benchText(99999));
});
test('T-63 / NFR-21: nearest-rank percentiles preserve the sample order', () => {
  const samples = Array.from({ length: 200 }, (_, i) => 200 - i);
  expect(percentile(samples, 0.5)).toBe(100);
  expect(percentile(samples, 0.95)).toBe(190);
  expect(percentile(samples, 0.99)).toBe(198);
  expect(samples[0]).toBe(200);
  expect(() => percentile([], 0.95)).toThrow();
});

test('T-63 / NFR-21: realistic chunks preserve the committed corpus distribution without query-term selection', () => {
  const material = realisticMaterial();
  expect(material.files).toHaveLength(35);
  expect(material.chunks.length).toBeGreaterThan(35);
  const frequencies = new Map<string, number>();
  for (let i = 0; i < 100_000; i++) {
    const chunk = realisticChunk(material.chunks, i);

    frequencies.set(chunk.content, (frequencies.get(chunk.content) ?? 0) + 1);
  }
  const expected = new Map<string, number>();
  for (const chunk of material.chunks)
    expected.set(chunk.content, (expected.get(chunk.content) ?? 0) + 1);
  for (const [content, occurrences] of expected) {
    expect(frequencies.get(content)).toBeGreaterThanOrEqual(
      Math.floor(100_000 / material.chunks.length) * occurrences,
    );
    expect(frequencies.get(content)).toBeLessThanOrEqual(
      Math.ceil(100_000 / material.chunks.length) * occurrences,
    );
  }
  const tokens = material.chunks.map((c) => c.tokenCount);
  expect(Math.max(...tokens)).toBeGreaterThan(Math.min(...tokens));
  expect(() => realisticChunk([], 0)).toThrow();
});
test('T-63 / NFR-21: realistic queries retain every answerable golden question and fixed paraphrases', () => {
  const text = readFileSync('eval/postgres-17/golden.jsonl', 'utf8');
  const queries = realisticQueries(text);
  const originals = text
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { type: string; question: string })
    .filter((e) => e.type === 'answerable');
  expect(new Set(queries.map((q) => q.question)).size).toBeGreaterThanOrEqual(200);
  for (const entry of originals)
    expect(queries.some((q) => q.question === entry.question)).toBe(true);
  expect(queries).toEqual(realisticQueries(text));
  expect(() => realisticQueries('invalid')).toThrow();
});
test('T-63 / NFR-21: EXPLAIN rebinds repeated and multi-digit parameters without interpolating values', () => {
  const parameters = Array.from({ length: 10 }, (_, i) => `value${String(i)}`);
  const result = explainTemplate('SELECT $10::text, $1::text, $10::text', parameters);
  expect(result.strings).toEqual(
    Object.assign(
      ['EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT ', '::text, ', '::text, ', '::text'],
      {
        raw: ['EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT ', '::text, ', '::text, ', '::text'],
      },
    ),
  );
  expect(result.values).toEqual(['value9', 'value0', 'value9']);
  expect(() => explainTemplate('SELECT $2', ['one'])).toThrow();
});

test('T-63 / NFR-21: EXPLAIN split uses inclusive branch times without summing overlapping child times', () => {
  const plan = [
    {
      'Execution Time': 12,
      Plan: {
        'Node Type': 'Hash Join',
        'Actual Total Time': 11,
        'Actual Loops': 1,
        Plans: [
          {
            'Node Type': 'WindowAgg',
            'Actual Total Time': 2,
            'Actual Loops': 1,
            Plans: [
              {
                'Node Type': 'Subquery Scan',
                Alias: 'v',
                'Actual Total Time': 1.8,
                'Actual Loops': 1,
              },
            ],
          },
          { 'Node Type': 'Subquery Scan', Alias: 'f', 'Actual Total Time': 8, 'Actual Loops': 1 },
        ],
      },
    },
  ];
  expect(explainTimings(plan)).toEqual({ executionMs: 12, vectorCteMs: 2, ftsCteMs: 8 });
  expect(
    explainTimings([
      {
        'Execution Time': 1,
        Plan: { 'Node Type': 'Result', 'Actual Total Time': 1, 'Actual Loops': 1 },
      },
    ]),
  ).toEqual({ executionMs: 1, vectorCteMs: null, ftsCteMs: null });
  expect(() => explainTimings([])).toThrow();
});
