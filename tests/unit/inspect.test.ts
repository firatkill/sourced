// UT-46 / FR-82 / TRD §36.4: normative finding rules and threshold edges.
import { describe, expect, test } from 'vitest';
import { buildFindings, type FindingInput } from '@/lib/inspect/findings';
import { detectLanguage } from '@/lib/inspect/language';
import { InspectResult } from '@/lib/inspect/schema';
import { formatEnvelope } from '@/lib/cli/output';

function input(tokens: number[] = []): FindingInput {
  return {
    totalChunks: tokens.length,
    tinyChunks: tokens.filter((n) => n < 250).length,
    oversizedChunks: tokens.filter((n) => n > 800).length,
    sample: tokens.map(() => 'the document is in the index and it is searchable'),
    duplicates: [],
    language: 'en',
    items: [],
    boilerplate: [],
  };
}
const codes = (data: FindingInput) => buildFindings(data).map((f) => f.code);

test.each([
  ['empty_document', 'empty', 'warn'],
  ['needs_ocr', 'needs_ocr', 'warn'],
  ['skipped_files', 'unsupported extension', 'info'],
  ['skipped_files', 'over 50 MB', 'info'],
] as const)('UT-46: %s from skipped reason %s', (code, reason, severity) => {
  const findings = buildFindings({
    ...input(),
    items: [{ key: 'docs:a', status: 'skipped', reason }],
  });
  expect(findings).toEqual([
    expect.objectContaining({
      code,
      severity,
      count: 1,
      details: { items: [{ key: 'docs:a', reason }] },
    }),
  ]);
  expect(findings[0]?.affects).toEqual(['retrieval', 'citations']);
  expect(findings[0]?.fix).toBeTruthy();
  expect(codes({ ...input(), items: [{ key: 'docs:a', status: 'done', reason }] })).toEqual([]);
});
test('UT-46: unknown skip reasons are not reclassified; failed items retain reasons', () => {
  expect(
    codes({ ...input(), items: [{ key: 'docs:a', status: 'skipped', reason: 'excluded' }] }),
  ).toEqual([]);
  const findings = buildFindings({
    ...input(),
    items: [{ key: 'docs:b', status: 'failed', reason: 'Document ingest failed.' }],
  });
  expect(findings).toEqual([
    expect.objectContaining({
      code: 'failed_items',
      severity: 'error',
      count: 1,
      details: { items: [{ key: 'docs:b', reason: 'Document ingest failed.' }] },
    }),
  ]);
});
describe('UT-46: synthetic chunk sets at strict thresholds', () => {
  test('exactly 20% tiny does not warn; above 20% does; minTokens/2 is not tiny', () => {
    expect(codes(input([249, 250, 500, 500, 500]))).toEqual([]);
    expect(buildFindings(input([249, 249, 250, 500, 500]))).toContainEqual(
      expect.objectContaining({ code: 'tiny_chunks', severity: 'warn', count: 2 }),
    );
    expect(codes(input([]))).toEqual([]);
  });
  test('maxTokens itself passes; one token over reports info', () => {
    expect(codes(input([800]))).toEqual([]);
    expect(buildFindings(input([801]))).toContainEqual(
      expect.objectContaining({ code: 'oversized_chunks', severity: 'info', count: 1 }),
    );
  });
  test('cosine >= .98; strictly more than 2% sampled chunks; repeated pairs count once', () => {
    const data = input(Array.from({ length: 100 }, () => 500));
    const pair = (id: number, similarity = 0.98) => ({
      chunkId: String(id),
      otherChunkId: 'other',
      similarity,
    });
    data.duplicates = [pair(1), pair(2), pair(3, 0.979999)];
    expect(codes(data)).toEqual([]);
    data.duplicates = [pair(1), pair(2), pair(2)];
    expect(codes(data)).toEqual([]);
    data.duplicates.push(pair(3));
    expect(buildFindings(data)).toContainEqual(
      expect.objectContaining({
        code: 'near_duplicates',
        count: 3,
        severity: 'warn',
        details: expect.objectContaining({ sampledChunks: 100, totalChunks: 100 }) as unknown,
      }),
    );
  });
});
test('UT-46: boilerplate counts are per source, including zero; unknown is not a fabricated zero', () => {
  const findings = buildFindings({
    ...input(),
    boilerplate: [
      { id: 'a', count: 5 },
      { id: 'b', count: 0 },
      { id: 'legacy', count: null },
    ],
  });
  expect(findings).toMatchObject([
    { code: 'boilerplate_removed', sourceId: 'a', count: 5, severity: 'info' },
    { sourceId: 'b', count: 0 },
    { sourceId: 'legacy' },
  ]);
  expect(findings[2]).not.toHaveProperty('count');
});
test.each([
  ['en', 'the and is are of to in for with this that'],
  ['de', 'der die das und ist sind von zu im für mit'],
  ['fr', 'le la les des et est sont de du dans avec'],
  ['es', 'el los las y es son del para con que por'],
  ['tr', 've bir bu şu için ile olan olarak gibi değil'],
  ['ru', 'и в во не на что это как с со из для'],
])('UT-46: stopword ratio detects %s', (language, text) => {
  expect(detectLanguage([text])).toBe(language);
});
test('UT-46: language mismatch, matching language, unknown and 200-chunk sample cap', () => {
  const german = 'der die das und ist sind von zu im für mit';
  const data = { ...input(), sample: [german] };
  expect(buildFindings(data)).toContainEqual(
    expect.objectContaining({
      code: 'language_mismatch',
      severity: 'warn',
      details: expect.objectContaining({
        configuredLanguage: 'en',
        detectedLanguage: 'de',
      }) as unknown,
    }),
  );
  expect(codes({ ...data, language: 'de' })).toEqual([]);
  expect(detectLanguage(['xyzzy 1234'])).toBeNull();
  expect(detectLanguage([])).toBeNull();
  expect(detectLanguage(['og det at en et er som for med til ikke på den'])).toBeNull();
  expect(
    detectLanguage([
      ...Array.from({ length: 200 }, () => german),
      ...Array.from({ length: 201 }, () => 'the and is are'),
    ]),
  ).toBe('de');
});
test('UT-46 / D-125: structured fields survive validation and human output summarizes them', () => {
  const result = InspectResult.parse({
    corpus: 'guide',
    sources: [
      { id: 'docs', documents: 2, chunks: 4, smallestChunkTokens: 10, largestChunkTokens: 900 },
    ],
    findings: buildFindings({ ...input([10, 900]), boilerplate: [{ id: 'docs', count: 5 }] }),
    path: 'corpus/guide/inspect.json',
  });
  const envelope = {
    schemaVersion: 1 as const,
    command: 'inspect',
    ok: true,
    result,
    warnings: [],
  };
  const human = formatEnvelope(envelope, false);
  expect(human).toContain('docs: 2 documents, 4 chunks; tokens 10–900');
  expect(human).toContain('boilerplate_removed (docs): 5');
  expect(human).toContain('Fix:');
  expect(human).toContain(result.path);
  expect(JSON.parse(formatEnvelope(envelope, true))).toEqual(envelope);
  for (const finding of result.findings) {
    expect(finding.affects.length).toBeGreaterThan(0);
    expect(finding.fix.length).toBeGreaterThan(0);
  }
});
