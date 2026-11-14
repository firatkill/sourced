import { randomUUID } from 'node:crypto';
import { expect, type Page, type Response, type TestInfo } from '@playwright/test';
import { SseEvent } from '../../../lib/sse/events';
import { createSseParser } from '../../../lib/sse/parse';
import { uniqueIp } from './ip';

// Observe the real response; never intercept or replace the browser's request.
export async function submitAnswer(page: Page, testInfo: TestInfo) {
  await page.setExtraHTTPHeaders({ 'x-real-ip': uniqueIp(testInfo) });
  await page.goto('http://localhost:3100/');
  const question = `When does a partial index help PostgreSQL queries? ${randomUUID()}`;
  await page.getByRole('textbox', { name: 'Your question' }).fill(question);
  // Chromium may discard getResponseBody after useAsk cancels its completed reader.
  // CDP's passive stream capture preserves bytes as they arrive; it does not
  // intercept, duplicate, delay, or alter the request or response.
  const network = await page.context().newCDPSession(page);
  await network.send('Network.enable');
  let requestId: string | undefined;
  let buffered = '';
  const chunks: Buffer[] = [];
  const captureReady = new Promise<void>((resolve, reject) => {
    network.on(
      'Network.responseReceived',
      (event: { requestId: string; response: { url: string } }) => {
        if (event.response.url !== 'http://localhost:3100/api/ask') return;
        requestId = event.requestId;
        void network
          .send('Network.streamResourceContent', { requestId })
          .then((result: { bufferedData: string }) => {
            buffered = result.bufferedData;
            resolve();
          }, reject);
      },
    );
  });
  network.on('Network.dataReceived', (event: { requestId: string; data?: string }) => {
    if (event.requestId === requestId && event.data) chunks.push(Buffer.from(event.data, 'base64'));
  });
  const wire = () => Buffer.concat([Buffer.from(buffered, 'base64'), ...chunks]).toString('utf8');
  const response = page
    .waitForResponse(
      (result) =>
        result.url() === 'http://localhost:3100/api/ask' && result.request().method() === 'POST',
    )
    .then(async (response) => {
      await captureReady;
      await expect.poll(wire).toContain('event: done\n');
      await network.detach();
      return { response, wire: wire() };
    });
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  return { question, response };
}

export function readAnswer({ response, wire }: { response: Response; wire: string }) {
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/event-stream');
  expect(response.request().postDataJSON()).not.toHaveProperty('suggestedId');
  const events: SseEvent[] = [];
  const parser = createSseParser(({ event, data }) => {
    events.push(SseEvent.parse({ event, data: JSON.parse(data) as unknown }));
  });
  parser.push(wire);
  parser.end();
  const meta = events.find((event) => event.event === 'meta')?.data;
  const citations = events.find((event) => event.event === 'citations')?.data;
  const done = events.find((event) => event.event === 'done')?.data;
  expect(meta).toBeDefined();
  expect(citations).toBeDefined();
  expect(done).toBeDefined();
  if (!meta || !citations || !done) throw new Error('Missing successful SSE events');
  expect(meta.cached).toBe(false);
  expect(done.cached).toBe(false);
  expect(meta.passages).toHaveLength(6);
  expect(citations.notFound).toBe(false);
  expect(citations.valid.map((citation) => citation.label)).toEqual(['P1', 'P2']);
  expect(citations.invalid).toEqual([]);
  expect(citations.answer).toMatch(/^According to the documentation, /);
  return { events, meta, citations, done };
}

export async function completeAnswer(page: Page, testInfo: TestInfo) {
  const { response } = await submitAnswer(page, testInfo);
  await expect(page.getByRole('status')).toHaveText('Answer ready with 2 verified sources.');
  return readAnswer(await response);
}

// FR-07's expected text, independent of the production copy formatter.
// The default mock script emits plain corpus sentences, not Markdown formatting.
export function expectedCopy(answer: Awaited<ReturnType<typeof readAnswer>>) {
  return `${answer.citations.answer.replace(/\[P([1-6])\]/g, '[$1]')}\n\nSources:\n${answer.meta.passages
    .filter((passage) => ['P1', 'P2'].includes(passage.label))
    .map(
      (passage) =>
        `[${passage.label.slice(1)}] ${passage.documentTitle} › ${passage.headingPath.join(' › ')} — ${passage.officialUrl ?? passage.filePath}`,
    )
    .join('\n')}`;
}
