// T-48 step 4 / FR-74: exercise the real lint command, including an untracked violation.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from 'vitest';
import { checkCorpusLiterals } from '@/scripts/check-corpus-literals';

test('UT-33: literal gate passes the tree and language aliases, rejects temporary corpus copy', async () => {
  expect(checkCorpusLiterals()).toEqual([]);
  const directory = await mkdtemp(path.join(process.cwd(), 'lib/t48-literal-check-'));
  const file = path.join(directory, 'violation.tsx');
  try {
    await writeFile(file, "export const language = 'postgresql';\n");
    expect(checkCorpusLiterals()).toEqual([]);
    await writeFile(
      file,
      'export const copy = "PostgreSQL";\nexport const node = <p>35 pages</p>;\nexport const domain = `Open on postgresql.org`;\n',
    );
    const violations = checkCorpusLiterals();
    expect(violations).toHaveLength(3);
    const command = spawnSync('pnpm', ['check:corpus-literals'], { encoding: 'utf8' });
    expect(command.status).toBe(1);
    expect(command.stderr).toContain('violation.tsx:1: corpus-specific literal');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  expect(checkCorpusLiterals()).toEqual([]);
});
