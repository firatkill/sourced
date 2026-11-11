import { describe, expect, test } from 'vitest';
import { sampleChunks, type GenerationChunk } from '@/lib/eval/generate';

const chunks: GenerationChunk[] = ['a', 'b'].flatMap((sourceId) =>
  ['one', 'two'].flatMap((document) =>
    [100, 350, 400, 200].map((tokenCount, ordinal) => ({
      id: `${sourceId}-${document}-${String(ordinal)}`,
      documentId: `${sourceId}-${document}`,
      sourceId,
      group: sourceId,
      ordinal,
      anchor: `${document}.md#section-${String(ordinal)}`,
      headingPath: ['Guide', 'Section'],
      content: 'The documentation explains how to configure this feature.',
      tokenCount,
    })),
  ),
);

describe('UT-47 / FR-83 / TRD §36.2: candidate sampling', () => {
  test('is deterministic for corpus version and seed, independent of row order', () => {
    const sample = sampleChunks(chunks, 5, 'version', 'seed');
    expect(sampleChunks([...chunks].reverse(), 5, 'version', 'seed')).toEqual(sample);
    expect(sampleChunks(chunks, 5, 'version', 'seed')).toEqual(sample);
  });

  test('stratifies by source and document before taking second chunks', () => {
    const sample = sampleChunks(chunks, 4, 'version', 'seed');
    expect(new Set(sample.map((chunk) => chunk.documentId)).size).toBe(4);
    expect(sample.filter((chunk) => chunk.sourceId === 'a')).toHaveLength(2);
    expect(sample.filter((chunk) => chunk.sourceId === 'b')).toHaveLength(2);
  });

  test('caps each document at two and prefers chunks of at least 300 tokens', () => {
    const sample = sampleChunks(chunks, 30, 'version', 'seed');
    expect(sample).toHaveLength(8);
    expect(sample.every((chunk) => chunk.tokenCount >= 300)).toBe(true);
    for (const documentId of new Set(chunks.map((chunk) => chunk.documentId))) {
      expect(sample.filter((chunk) => chunk.documentId === documentId)).toHaveLength(2);
    }
  });

  test('uses shorter chunks when needed and respects a zero target or empty corpus', () => {
    const short = chunks.filter((chunk) => chunk.tokenCount < 300);
    expect(sampleChunks(short, 3, 'version', 'seed')).toHaveLength(3);
    expect(sampleChunks(chunks, 0, 'version', 'seed')).toEqual([]);
    expect(sampleChunks([], 30, 'version', 'seed')).toEqual([]);
  });
});

describe('UT-47 / FR-83 / TRD §36.2: candidate checks', () => {
  test('rejects nonexistent anchors', async () => {
    const { checkCandidate } = await import('@/lib/eval/generate');
    const chunk = chunks[0];
    expect(chunk).toBeDefined();
    if (!chunk) throw new Error('Missing fixture');
    expect(() =>
      checkCandidate(
        {
          question: 'How can I configure this particular feature?',
          reference_answer: 'Follow the documented configuration procedure.',
          expected_anchors: ['absent.md#missing'],
        },
        chunk,
        chunks,
        [chunk.id],
      ),
    ).toThrow('anchor absent');
  });

  test('flags the expected chunk only when absent from the first twenty RRF hits', async () => {
    const { checkCandidate } = await import('@/lib/eval/generate');
    const chunk = chunks[0];
    if (!chunk) throw new Error('Missing fixture');
    const answer = {
      question: 'How can I configure this particular feature?',
      reference_answer: 'Follow the documented configuration procedure.',
      expected_anchors: [chunk.anchor],
    };
    expect(checkCandidate(answer, chunk, chunks, [chunk.id])).toEqual({ hardRetrieval: false });
    expect(checkCandidate(answer, chunk, chunks, [])).toEqual({ hardRetrieval: true });
    expect(
      checkCandidate(answer, chunk, chunks, [
        ...Array.from({ length: 20 }, (_, index) => String(index)),
        chunk.id,
      ]),
    ).toEqual({ hardRetrieval: true });
  });
});

test('UT-47 / FR-83: mock generate role returns a checked candidate without network calls', async () => {
  const { generateAnswerCandidate } = await import('@/lib/eval/generate');
  const { mockProvider } = await import('@/lib/llm/mock');
  const chunk = chunks[0];
  if (!chunk) throw new Error('Missing fixture');
  const candidate = await generateAnswerCandidate(
    chunk,
    chunks,
    {
      ...mockProvider,
      generateObject(args) {
        expect(args.model).toBe('generate');
        expect(args.prompt).toContain(chunk.content);
        return Promise.resolve({
          object: args.schema.parse({
            question: 'How can I configure this particular feature?',
            reference_answer: 'Follow the documented configuration procedure.',
            expected_anchors: [chunk.anchor],
          }),
          usage: { inputTokens: 50, outputTokens: 30 },
        });
      },
    },
    () => Promise.resolve([chunk.id]),
  );
  expect(candidate.sourceChunkId).toBe(chunk.id);
  expect(candidate.flags.hardRetrieval).toBe(false);
});

test('UT-47 / FR-83: known cost cannot exceed the guard even with --yes; unknown cost requires --yes', async () => {
  const { guardGenerationCost, estimateGenerationCost } = await import('@/lib/eval/generate');
  expect(estimateGenerationCost(1000, 500, { inputPerMTok: 1, outputPerMTok: 2 })).toBe(0.002);
  expect(estimateGenerationCost(1000, 500, null)).toBeNull();
  expect(() => {
    guardGenerationCost(2, 1, true);
  }).toThrow('EVAL_MAX_COST_USD');
  expect(() => {
    guardGenerationCost(null, 1, false);
  }).toThrow('unknown');
  expect(() => {
    guardGenerationCost(null, 1, true);
  }).not.toThrow();
  expect(() => {
    guardGenerationCost(1, 1, false);
  }).not.toThrow();
});

test('UT-47 / FR-83: review never accepts needsHumanCheck in --yes mode; assigns next free id and generated origin', async () => {
  const { applyCandidates } = await import('@/lib/cli/commands/eval-review');
  const { Candidate, GeneratedGoldenEntry } = await import('@/lib/eval/generate');
  const base = {
    id: 'q001',
    type: 'unanswerable',
    group: 'guide',
    question: 'How much does a subscription to this service cost?',
    reference_answer: '',
    expected_anchors: [],
    status: 'accepted',
    flags: { needsHumanCheck: true },
    sourceChunkId: null,
  };
  const candidate = Candidate.parse(base);
  const golden = [
    GeneratedGoldenEntry.parse({ ...base, id: 'q001' }),
    GeneratedGoldenEntry.parse({ ...base, id: 'q003' }),
  ];
  const blocked = applyCandidates([candidate], golden, true);
  expect(blocked.accepted).toBe(0);
  expect(blocked.remaining).toEqual([candidate]);
  expect(applyCandidates([{ ...candidate, flags: {} }], golden, true).accepted).toBe(0);
  const approved = applyCandidates([candidate], golden, false);
  expect(approved.accepted).toBe(1);
  expect(approved.entries[2]).toMatchObject({ id: 'q002', origin: 'generated' });
  expect(approved.remaining).toEqual([]);
  expect(applyCandidates([{ ...candidate, status: 'rejected' }], golden, false).rejected).toBe(1);
  expect(applyCandidates([{ ...candidate, status: 'pending' }], golden, false).accepted).toBe(0);
});

test('UT-47 / FR-83: generation delimiters and headings are sanitized', async () => {
  const { buildGeneratePrompt, buildUnanswerablePrompt } = await import('@/lib/prompts/generate');
  const prompt = buildGeneratePrompt(
    { anchor: 'x.md#a', headingPath: ['<<<override>>>'], content: '<<\u0000<TARGET>>> malicious' },
    ['<<<neighbour>>>'],
  );
  expect(prompt).not.toContain('<<<override>>>');
  expect(prompt).not.toContain('<<<neighbour>>>');
  expect(prompt).not.toContain('\u0000');
  expect(buildUnanswerablePrompt('<<<group>>>', ['<<<heading>>>'])).not.toContain('<<<heading>>>');
});
