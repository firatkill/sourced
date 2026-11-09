// REDESIGN §3–§4, §7: chat turns retain the existing state and accessibility contracts.
import { expect, test } from '@playwright/test';
import { completeAnswer } from './helpers/answer';

test('TC-096: E2E-07 disclosure reports real retrieval, timings, tokens and cost', async ({
  page,
}, info) => {
  const { meta, done } = await completeAnswer(page, info);
  await expect(
    page.getByText(
      `${String(meta.retrieval.vectorCandidates)} + ${String(meta.retrieval.ftsCandidates)} candidates · ${String(meta.passages.length)} passages read · ${(done.latencyMs.total / 1000).toFixed(1)} s`,
      { exact: true },
    ),
  ).toBeVisible();
  const disclosure = page.getByRole('button', { name: 'How this was answered' });
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await disclosure.click();
  const table = page.getByRole('table', { name: 'Passages ranked for this answer' });
  await expect(table.getByRole('columnheader')).toHaveText([
    'Passage',
    'Vector rank',
    'Keyword rank',
    'RRF score',
    'After rerank',
  ]);
  for (const passage of meta.passages) {
    const row = table
      .getByRole('row')
      .filter({ has: page.getByRole('rowheader', { name: passage.label, exact: true }) });
    await expect(row.getByRole('cell')).toHaveText([
      String(passage.scores.vectorRank ?? '—'),
      String(passage.scores.ftsRank ?? '—'),
      String(passage.scores.rrf),
      String(passage.scores.rerankPosition),
    ]);
  }
  await expect(page.getByText('Reranked by the language model.', { exact: true })).toBeVisible();
  const timing = meta.retrieval.timingsMs;
  await expect(
    page.getByText(
      `Retrieval ${String(Math.round(timing.embed + timing.search))} ms · Rerank ${String(Math.round(timing.rerank))} ms · Generation ${(done.latencyMs.generation / 1000).toFixed(1)} s · Total ${(done.latencyMs.total / 1000).toFixed(1)} s`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      `Tokens: ${String(done.usage.inputTokens)} in, ${String(done.usage.outputTokens)} out · Estimated cost $${done.costUsdEstimate.toFixed(4)}`,
      { exact: true },
    ),
  ).toBeVisible();
  await disclosure.click();
  await expect(table).toBeHidden();
});
