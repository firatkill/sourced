// E2E-28 / FR-67: UI boundary fixture; PDF ingestion-to-SSE is covered by IT-17.
import { readFile } from 'node:fs/promises';
import { extractPdf } from '../../lib/ingest/parse-pdf';
import { expect, test } from '@playwright/test';
import { meta, citations, done, passage } from '../fixtures/sse-streams';
import { ask, openAsk } from './helpers/ask';
for (const source of [
  { filePath: 'tests/fixtures/mixed-folder/guide.pdf', pageFrom: 1, pageTo: 1 },
  { filePath: 'tests/fixtures/mixed-folder/guide.md', lineFrom: 1, lineTo: 8 },
]) {
  test(`E2E-28: ${source.filePath} citation has a location and no link`, async ({ page }, info) => {
    const bytes = await readFile(source.filePath);
    let content = bytes.toString('utf8');
    if ('pageFrom' in source) {
      const pdf = await extractPdf(bytes);
      expect(pdf.status).toBe('ok');
      if (pdf.status !== 'ok') throw new Error('PDF fixture must contain searchable text');
      content = (pdf.pages[0] ?? []).map((line) => line.text).join(' ');
    }
    const quote = content.trim().split(/\s+/).slice(0, 8).join(' ');
    const fixtureCitations = {
      ...citations,
      answer: `${quote} [P1].`,
      valid: [{ label: 'P1', quote, quoteSpan: { start: 0, end: quote.length } }],
    };
    await page.route('**/api/ask', async (route) => {
      const events = [
        {
          event: 'meta',
          data: {
            ...meta,
            passages: [
              { ...passage, ...source, content, snippet: content.slice(0, 200), officialUrl: null },
            ],
          },
        },
        { event: 'token', data: { delta: fixtureCitations.answer } },
        { event: 'citations', data: fixtureCitations },
        { event: 'done', data: done },
      ];
      await route.fulfill({
        contentType: 'text/event-stream',
        body: events
          .map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          .join(''),
      });
    });
    await openAsk(page, info, 3103);
    await ask(page);
    await expect(page.getByRole('status').filter({ hasText: /^Answer ready/ })).toHaveText(
      'Answer ready with 1 verified source.',
    );
    await page.getByRole('button', { name: /Source P1:/ }).click();
    const viewer = page.getByRole('complementary', { name: 'Source viewer' });
    await expect(
      viewer.getByText(`${source.filePath}, ${'pageFrom' in source ? 'page' : 'line'} 1`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(viewer.getByRole('link')).toHaveCount(0);
  });
}
