import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('TC-001: T-01 exact dependencies, strict TypeScript and normative scripts', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    assert.match(version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/, name);
  }
  const config = JSON.parse(read('tsconfig.json'));
  for (const option of [
    'strict',
    'noUncheckedIndexedAccess',
    'exactOptionalPropertyTypes',
    'noImplicitOverride',
    'noFallthroughCasesInSwitch',
  ]) {
    assert.equal(config.compilerOptions[option], true, option);
  }
  const block = read('docs/TRD.md').match(/### 3\.1[\s\S]*?```json\n([\s\S]*?)\n```/);
  assert.ok(block);
  assert.deepEqual(pkg.scripts, JSON.parse(block[1]).scripts);
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(read('.nvmrc').trim(), '22');
});

test('TC-002: T-01 server-only and SDK imports under react-server', () => {
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'tsx',
      '--conditions=react-server',
      '-e',
      "Promise.all(['server-only','postgres','drizzle-orm','ai'].map(p => import(p))).then(() => console.log('ok'))",
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'ok');
});
