// T-84: file citations are served only from configured sources; saved turns restore exactly.
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { containedFile, fileContentType, sourceRoots } from '@/lib/files/resolve';
import { restoreTurn } from '@/components/ask/restore';
import { citations, done, meta } from '../fixtures/sse-streams';

test('sourceRoots uses folder and git sources only, resolved from the project root', () => {
  expect(
    sourceRoots(
      [
        { id: 'docs', type: 'folder', path: 'my-docs', commitRaw: false },
        { id: 'repo', type: 'git', path: '/srv/repo', subdir: 'guide' },
        { id: 'web', type: 'urls', urls: ['https://example.com/'], commitRaw: false },
      ] as never,
      '/work',
    ),
  ).toEqual(['/work/my-docs', '/srv/repo/guide']);
});

test('containedFile accepts files inside a root and rejects traversal, symlinks out and folders', async () => {
  const base = await mkdtemp(path.join(tmpdir(), 'sourced-files-'));
  const root = path.join(base, 'docs');
  await mkdir(path.join(root, 'sub'), { recursive: true });
  await writeFile(path.join(root, 'sub', 'a.pdf'), '%PDF-1.4');
  await writeFile(path.join(base, 'secret.txt'), 'secret');
  await symlink(path.join(base, 'secret.txt'), path.join(root, 'link.txt'));
  await mkdir(path.join(base, 'docs-evil'));
  await writeFile(path.join(base, 'docs-evil', 'x.txt'), 'x');
  expect(await containedFile(path.join(root, 'sub', 'a.pdf'), [root])).toMatch(/a\.pdf$/);
  expect(await containedFile(path.join(root, '..', 'secret.txt'), [root])).toBeNull();
  expect(await containedFile(path.join(root, 'link.txt'), [root])).toBeNull();
  expect(await containedFile(path.join(base, 'docs-evil', 'x.txt'), [root])).toBeNull();
  expect(await containedFile(path.join(root, 'sub'), [root])).toBeNull();
  expect(await containedFile(path.join(root, 'missing.pdf'), [root])).toBeNull();
  expect(
    await containedFile(path.join(root, 'sub', 'a.pdf'), [path.join(base, 'nope')]),
  ).toBeNull();
});

test('fileContentType never serves HTML as HTML', () => {
  expect(fileContentType('a.PDF')).toEqual({ type: 'application/pdf', inline: true });
  expect(fileContentType('a.html').type).toBe('text/plain; charset=utf-8');
  expect(fileContentType('a.md').inline).toBe(true);
  expect(fileContentType('a.docx').inline).toBe(false);
  expect(fileContentType('a.exe')).toEqual({ type: 'application/octet-stream', inline: false });
});

test('restoreTurn maps each saved status to its finished phase', () => {
  const answer = { meta, answerText: citations.answer, citations, done };
  expect(restoreTurn({ question: 'Q', status: 'done', answer }, 3)).toMatchObject({
    id: 3,
    question: 'Q',
    citations,
    phase: { kind: 'done', meta, citations, done },
  });
  expect(
    restoreTurn({ question: 'Q', status: 'not_found', answer: { ...answer, citations: null } }, 1)
      .phase,
  ).toMatchObject({ kind: 'notFound', meta, done });
  expect(restoreTurn({ question: 'Q', status: 'stopped', answer }, 1).phase).toMatchObject({
    kind: 'stopped',
    partialText: citations.answer,
  });
  expect(restoreTurn({ question: 'Q', status: 'error', answer }, 1).phase).toEqual({
    kind: 'serverError',
    question: 'Q',
    requestId: meta.requestId,
  });
});
