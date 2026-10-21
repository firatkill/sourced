import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { test } from 'node:test';

test('TC-021: T-06 first-load JavaScript is at most 120 KB gzip (TRD §22)', async () => {
  const base = 'http://localhost:3000';
  const html = await (await fetch(base)).text();
  const paths = [...new Set(html.match(/\/_next\/static\/[^"]+\.js/g))];
  assert.ok(paths.length > 0, 'page must reference built scripts');
  let bytes = 0;
  for (const path of paths) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    bytes += gzipSync(Buffer.from(await response.arrayBuffer()), { level: 9 }).length;
  }
  console.log(`First-load JavaScript: ${(bytes / 1024).toFixed(1)} KB gzip`);
  assert.ok(bytes <= 120 * 1024, `Expected <=120 KB, received ${(bytes / 1024).toFixed(1)} KB`);
});
