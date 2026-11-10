// TC-209 / UT-43 / FR-75 / TRD §33.6: mixed-folder persistence and D-109 counts.
import { expect, test, vi } from 'vitest';
import { getSql } from '@/lib/db/client';
import { EMBEDDING } from '@/lib/config';
import { getKitConfig, setCliKitConfig } from '@/lib/kit/runtime-config';
import { SourceSchema } from '@/lib/kit/config-schema';
import { loadCorpus } from '@/lib/ingest/load';
import { ingestCorpus } from '@/lib/ingest/upsert';
import { mockProvider } from '@/lib/llm/mock';
import { planIngest } from '@/lib/cli/commands/ingest-report';

test('TC-209: flag off/on/off re-embeds every chunk once; repeated flag is a no-op', async () => {
  const sql = getSql();
  const original = getKitConfig();
  const config = structuredClone(original);
  config.sources = [
    SourceSchema.parse({ id: 'mixed', type: 'folder', path: 'tests/fixtures/mixed-folder' }),
  ];
  const loaded = await loadCorpus({
    config,
    offline: true,
    refresh: false,
    includeFixtures: false,
  });
  expect(loaded).toHaveLength(6);
  const chunks = loaded.flatMap((doc) => doc.chunks);
  const embed = vi.fn(mockProvider.embed.bind(mockProvider));
  let baseline: unknown;
  try {
    for (const [index, flag] of [false, true, true, false, false].entries()) {
      config.overrides.contextualEmbedding = flag;
      setCliKitConfig(config);
      embed.mockClear();
      const changing = index === 1 || index === 3;
      const planned = await planIngest(sql, loaded, [], EMBEDDING.MOCK_MODEL, 0);
      expect(planned[0]?.chunks).toEqual({
        new: index === 0 ? chunks.length : 0,
        changed: changing ? chunks.length : 0,
        unchanged: index === 2 || index === 4 ? chunks.length : 0,
        deleted: 0,
      });
      const report = await ingestCorpus({
        sql,
        loadDocuments: () => Promise.resolve(loaded),
        provider: { embed },
        embeddingModel: EMBEDDING.MOCK_MODEL,
        includeFixtures: false,
        pricePerMillion: 0,
      });
      expect(report.embeddingInputs).toBe(index === 0 || changing ? chunks.length : 0);
      const inputs = embed.mock.calls.flatMap(([texts]) => texts);
      expect(inputs).toHaveLength(report.embeddingInputs);
      if (inputs.length)
        expect(inputs.sort()).toEqual(
          loaded
            .flatMap((doc) =>
              doc.chunks.map(
                (chunk) =>
                  `${flag ? `${doc.title}\n` : ''}${chunk.headingPath.join(' › ')}\n\n${chunk.content}`,
              ),
            )
            .sort(),
        );
      const rows = await sql<
        {
          slug: string;
          ordinal: number;
          content: string;
          heading_path: string[];
          anchor: string;
          content_hash: string;
          embed_text_version: number;
        }[]
      >`SELECT d.slug,c.ordinal,c.content,c.heading_path,c.anchor,c.content_hash,c.embed_text_version FROM chunks c JOIN documents d ON d.id=c.document_id ORDER BY d.slug,c.ordinal`;
      expect(rows).toHaveLength(chunks.length);
      expect(rows.every((row) => row.embed_text_version === (flag ? 1 : 0))).toBe(true);
      expect(rows.map((row) => row.content).sort()).toEqual(
        chunks.map((chunk) => chunk.content).sort(),
      );
      if (index === 0) baseline = rows;
      if (index === 3 || index === 4) expect(rows).toEqual(baseline);
      expect((await planIngest(sql, loaded, [], EMBEDDING.MOCK_MODEL, 0))[0]?.chunks).toEqual({
        new: 0,
        changed: 0,
        unchanged: chunks.length,
        deleted: 0,
      });
    }
  } finally {
    setCliKitConfig(original);
  }
});
