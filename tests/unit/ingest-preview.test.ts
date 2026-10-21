import { expect, test } from 'vitest';
import { previewCorpus } from '@/lib/ingest/preview';
import { countTokens } from '@/lib/ingest/tokenizer';
import { sha256Hex } from '@/lib/hash';

test('TC-041: dry-run hashes sorted content identities and prices heading-prefixed embedding input', () => {
  const document = {
    title: 'Title',
    root: {
      id: 'ROOT',
      heading: 'Title',
      level: 1,
      blocks: [{ kind: 'paragraph' as const, text: 'Example text.' }],
      children: [],
    },
  };
  const inputs = [
    { slug: 'a.html', document },
    { slug: 'b.html', document },
  ];
  const preview = previewCorpus(inputs, 0.02);
  expect(previewCorpus([...inputs].reverse(), 0.02)).toEqual(preview);
  expect(preview).toMatchObject({
    documents: 2,
    chunks: 2,
    embeddingTokens: 2 * countTokens('Title\n\nExample text.'),
  });
  expect(preview.estimatedCostUsd).toBe((preview.embeddingTokens * 0.02) / 1_000_000);
  expect(preview.corpusVersion).toBe(
    sha256Hex(
      inputs
        .map(({ slug }) => sha256Hex(`${slug}\n${slug}#ROOT\nExample text.`))
        .sort()
        .join('\n'),
    ),
  );
  expect(previewCorpus([], 0)).toMatchObject({
    chunks: 0,
    embeddingTokens: 0,
    tokens: { min: 0, p50: 0, p95: 0, max: 0 },
  });
});
