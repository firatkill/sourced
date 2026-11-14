// T-48 / TRD §29.2 / FR-18–22: P7–P9 survive every boundary; unknown labels are removed.
import { afterEach, expect, test, vi } from 'vitest';
import example from '@/sourced.config';
import { KitConfigSchema } from '@/lib/kit/config-schema';
import * as runtime from '@/lib/kit/runtime-config';
import { parseMarkers } from '@/lib/citations/parse';
import { verifyCitations } from '@/lib/citations/verify';
import { QuotesOutput, buildQuotesPrompt } from '@/lib/prompts/quotes';
import { PassageDto, CitationsEvent, MetaEvent } from '@/lib/sse/events';
import { formatCopy } from '@/lib/copy-format';
import type { Passage } from '@/lib/retrieval/types';
import { passage as dto, meta } from '../fixtures/sse-streams';

afterEach(() => vi.restoreAllMocks());
test('UT-33: nine verified passages cross quote and SSE schemas and copy as numbered sources', async () => {
  const config = KitConfigSchema.parse(example);
  config.overrides.retrieval.finalPassages = 9;
  vi.spyOn(runtime, 'getKitConfig').mockReturnValue(config);
  const content = 'These exact words support the answer.';
  const labels = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'] as const;
  const passages: Passage[] = labels.map((label, index) => ({
    label,
    content,
    chunkId: String(index + 1),
    documentTitle: 'Guide',
    documentUrl: 'https://example.test/guide',
    slug: 'guide',
    anchor: 'section',
    headingPath: ['Guide'],
    tokenCount: 7,
    rrfScore: 1,
    vectorRank: index + 1,
    ftsRank: null,
    vectorDistance: 0,
    ftsScore: null,
    rerankPosition: index + 1,
    officialUrl: 'https://example.test/guide#section',
  }));
  const answer = labels.map((label) => `Fact [${label}].`).join(' ');
  expect(parseMarkers(answer).markers.map(({ label }) => label)).toEqual(labels);
  const block = QuotesOutput.parse({ citations: labels.map((id) => ({ id, quote: content })) });
  const prompt = buildQuotesPrompt(
    answer,
    passages.map(({ label: id, content }) => ({ id, content })),
  );
  expect(prompt).toContain('Cited ids: P1, P2, P3, P4, P5, P6, P7, P8, P9');
  const result = await verifyCitations(
    answer + ' Unknown [P10].',
    JSON.stringify(block),
    passages,
    () => Promise.resolve(new Map<string, string>()),
  );
  expect(result.valid.map(({ label }) => label)).toEqual(labels);
  expect(result.invalid).toEqual([{ label: 'P10', reason: 'UNKNOWN_PASSAGE' }]);
  expect(result.answer).not.toContain('[P10]');
  const event = CitationsEvent.parse(result);
  const dtos = labels.map((label) => PassageDto.parse({ ...dto, label, content }));
  expect(MetaEvent.parse({ ...meta, passages: dtos }).passages).toHaveLength(9);
  const copied = formatCopy(event, dtos);
  expect(copied).toContain('Fact [7]. Fact [8]. Fact [9].');
  expect(copied).toContain('[9] ');
  expect(PassageDto.safeParse({ ...dto, label: 'P10' }).success).toBe(false);
  expect(QuotesOutput.safeParse({ citations: [{ id: 'P10', quote: content }] }).success).toBe(
    false,
  );
});
