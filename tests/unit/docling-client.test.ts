// T-100 / D-152: the Docling HTTP client with a fake service; no test reaches a network.
/* eslint-disable @typescript-eslint/require-await -- the fakes stand in for async APIs */
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  DoclingUnavailableError,
  createDoclingConverter,
  doclingStatus,
  doclingUrl,
} from '@/lib/ingest/docling';

const document = { schema_name: 'DoclingDocument', body: { self_ref: '#/body', children: [] } };
const input = { fileName: 'a.pdf', kind: 'pdf' as const, language: 'en', contentHash: 'abc' };

type Call = { url: string; method: string; form?: FormData };
function fakeDocling(options: { ready?: number; polls?: number; status?: string } = {}) {
  const calls: Call[] = [];
  let polls = options.polls ?? 1;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = url instanceof Request ? url.url : url.toString();
    calls.push({
      url: href,
      method: init?.method ?? 'GET',
      ...(init?.body instanceof FormData ? { form: init.body } : {}),
    });
    if (href.endsWith('/ready')) return new Response('{}', { status: options.ready ?? 200 });
    if (href.endsWith('/v1/convert/file/async'))
      return Response.json({ task_id: 't1', task_status: 'pending' });
    if (href.includes('/v1/status/poll/t1')) {
      polls -= 1;
      return Response.json({ task_id: 't1', task_status: polls > 0 ? 'started' : 'success' });
    }
    if (href.endsWith('/v1/result/t1'))
      return Response.json({
        status: options.status ?? 'success',
        document: { json_content: document },
        errors: [],
      });
    return new Response('', { status: 404 });
  }) as typeof fetch;
  return { calls, fetcher };
}

let cacheDir = '';
beforeEach(async () => {
  cacheDir = await mkdtemp(path.join(tmpdir(), 'docling-cache-'));
});
afterEach(async () => {
  await rm(cacheDir, { recursive: true, force: true });
});

describe('T-100: Docling client', () => {
  test('converts with the async API, sends the options and caches the result', async () => {
    const { calls, fetcher } = fakeDocling({ polls: 2 });
    const convert = createDoclingConverter({
      url: 'http://docling.test',
      fetch: fetcher,
      cacheDir,
      wait: async () => undefined,
    });
    await expect(convert(new Uint8Array([1, 2]), input)).resolves.toEqual(document);
    const submit = calls.find((call) => call.url.endsWith('/v1/convert/file/async'));
    expect(submit?.method).toBe('POST');
    expect(submit?.form?.get('to_formats')).toBe('json');
    expect(submit?.form?.get('from_formats')).toBe('pdf');
    expect(submit?.form?.get('ocr_lang')).toBe('en');
    expect(submit?.form?.get('do_ocr')).toBe('true');
    expect(submit?.form?.get('include_images')).toBe('false');
    expect((submit?.form?.get('files') as File).name).toBe('a.pdf');
    expect(calls.filter((call) => call.url.includes('/status/poll/'))).toHaveLength(2);
    expect(await readdir(cacheDir)).toHaveLength(1);

    // The same file again comes from the cache without calling Docling.
    const before = calls.length;
    await expect(convert(new Uint8Array([1, 2]), input)).resolves.toEqual(document);
    expect(calls).toHaveLength(before);
  });

  test('cacheOnly returns undefined for a file not converted yet, without a request', async () => {
    const { calls, fetcher } = fakeDocling();
    const convert = createDoclingConverter({
      url: 'http://docling.test',
      fetch: fetcher,
      cacheDir,
    });
    await expect(convert(new Uint8Array(), input, { cacheOnly: true })).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  test('a stopped service stops the run with the command that starts it', async () => {
    const fetcher = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const convert = createDoclingConverter({
      url: 'http://docling.test',
      fetch: fetcher,
      cacheDir,
    });
    const error = await convert(new Uint8Array(), input).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(DoclingUnavailableError);
    expect((error as Error).message).toContain('sourced docling on');
  });

  test('a service still loading its models is reported as starting', async () => {
    const { fetcher } = fakeDocling({ ready: 503 });
    expect(await doclingStatus({ url: 'http://docling.test', fetch: fetcher })).toBe('starting');
    const convert = createDoclingConverter({
      url: 'http://docling.test',
      fetch: fetcher,
      cacheDir,
    });
    await expect(convert(new Uint8Array(), input)).rejects.toThrow(/still starting/);
  });

  test('a failed conversion fails that file only', async () => {
    const { fetcher } = fakeDocling({ status: 'failure' });
    const convert = createDoclingConverter({
      url: 'http://docling.test',
      fetch: fetcher,
      cacheDir,
    });
    const error = await convert(new Uint8Array(), input).catch((cause: unknown) => cause);
    expect(error).not.toBeInstanceOf(DoclingUnavailableError);
    expect((error as Error).message).toBe('Docling could not read a.pdf.');
  });

  test('the URL comes from DOCLING_URL, else the published local port', () => {
    expect(doclingUrl({ DOCLING_URL: 'http://docling:5001/' })).toBe('http://docling:5001');
    expect(doclingUrl({})).toBe('http://127.0.0.1:5001');
    expect(doclingUrl({ DOCLING_URL: 'not a url' })).toBe('http://127.0.0.1:5001');
  });
});
