// T-89: masking, upload paths and the `.env.local` writer's allow-list.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { maskKey, validEnvValue, writeEnvValues } from '@/lib/setup/env-file';
import { uploadPath } from '@/lib/setup/documents';

const roots: string[] = [];
afterEach(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('maskKey', () => {
  it('keeps a recognisable prefix and the last four characters only', () => {
    expect(maskKey('sk-proj-abcdefghijklmnopA91F')).toBe('sk-proj-…A91F');
    expect(maskKey('sk-ant-api03-abcdefghijkl9Zz1')).toBe('sk-ant-…9Zz1');
    expect(maskKey('AIzaSyabcdefghijklmnop1234')).toBe('AIza…1234');
    expect(maskKey('plainkeyvalue0042')).toBe('…0042');
    expect(maskKey('short')).toBe('••••');
    expect(maskKey(undefined)).toBeNull();
  });
});

describe('uploadPath', () => {
  it('keeps safe relative paths and refuses traversal, hidden and absolute names', () => {
    expect(uploadPath('notes/a.md')).toBe('notes/a.md');
    expect(uploadPath('notes\\sub\\b.pdf')).toBe('notes/sub/b.pdf');
    expect(uploadPath('/abs/c.md')).toBe('abs/c.md');
    for (const name of ['', '../x.md', 'a/../../x.md', '.env', 'a/.git/config', 'a\0b.md'])
      expect(uploadPath(name)).toBeNull();
  });
});

describe('writeEnvValues', () => {
  it('rewrites only allow-listed names and refuses values that could break the file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'sourced-env-'));
    roots.push(root);
    await writeFile(path.join(root, '.env.local'), '# comment\nDATABASE_URL=keep\r\n');
    await writeEnvValues({ ANTHROPIC_API_KEY: 'sk-ant-valid-0001' }, root);
    expect(await readFile(path.join(root, '.env.local'), 'utf8')).toBe(
      '# comment\nDATABASE_URL=keep\nANTHROPIC_API_KEY=sk-ant-valid-0001\n',
    );
    await expect(
      writeEnvValues(
        { DATABASE_URL: 'x' } as unknown as Parameters<typeof writeEnvValues>[0],
        root,
      ),
    ).rejects.toThrow('Refusing to write DATABASE_URL.');
    for (const value of ['a b', 'x\nEVIL=1', '"quoted"', '$(id)', ''])
      expect(validEnvValue(value)).toBe(false);
  });
});
