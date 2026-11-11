// T-48 step 4 / FR-74: exercise the real lint command, including an untracked violation.
// The violation lives in a throwaway git repository under the OS temp directory, so tests
// that scan the real tree (for example generated-imports.test.ts) never see it.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { checkCorpusLiterals } from '@/scripts/check-corpus-literals';

const repoRoot = process.cwd();
const script = path.join(repoRoot, 'scripts/check-corpus-literals.ts');
const tsx = path.join(repoRoot, 'node_modules/.bin/tsx');

test('UT-33: literal gate passes the tree and language aliases, rejects temporary corpus copy', async () => {
  expect(checkCorpusLiterals()).toEqual([]);
  const root = await mkdtemp(path.join(os.tmpdir(), 'sourced-literal-check-'));
  const file = path.join(root, 'lib', 'violation.tsx');
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "export const language = 'postgresql';\n");
    expect(checkCorpusLiterals(root)).toEqual([]);
    await writeFile(
      file,
      'export const copy = "PostgreSQL";\nexport const node = <p>35 pages</p>;\nexport const domain = `Open on postgresql.org`;\n',
    );
    expect(checkCorpusLiterals(root)).toHaveLength(3);
    const command = spawnSync(tsx, [script], { cwd: root, encoding: 'utf8' });
    expect(command.status).toBe(1);
    expect(command.stderr).toContain('violation.tsx:1: corpus-specific literal');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  expect(checkCorpusLiterals()).toEqual([]);
});
