import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSkill } from '../../lib/skills/check';

const readme = readFileSync('README.md', 'utf8');

// Reuse the skill checker's registry-backed command/flag parsing, including
// quoted arguments, multiword commands and global flags. It does not yet
// recognize the Windows launcher, which has the same CLI contract.
function commandProblems(markdown: string) {
  return checkSkill(
    'README.md',
    markdown.replace(/\bsourced\.cmd(?=\s)/g, './sourced'),
    'readme',
    new Set(),
  ).filter(({ message }) => /^Unknown (command|flag) /.test(message));
}

describe('TC-243: README kit instructions (T-76, FR-57, G-6)', () => {
  it('names only registered CLI commands and flags in the README and the guide', () => {
    const guide = readFileSync('docs/GUIDE.md', 'utf8');
    for (const launcher of ['./sourced', 'pnpm sourced']) {
      expect(readme + guide).toContain(`${launcher} ingest`);
    }
    expect(readme).toContain('`sourced.cmd`');
    expect(commandProblems(readme)).toEqual([]);
    expect(commandProblems(guide)).toEqual([]);
  });

  it.each(['./sourced', 'sourced.cmd', 'pnpm sourced'])(
    'rejects unknown commands and flags through %s',
    (launcher) => {
      expect(commandProblems(`\`${launcher} invented-command\``)).toEqual([
        expect.objectContaining({ message: 'Unknown command invented-command' }),
      ]);
      expect(commandProblems(`\`\`\`sh\n${launcher} ingest --invented-flag\n\`\`\``)).toEqual([
        expect.objectContaining({ message: 'Unknown flag --invented-flag for ingest' }),
      ]);
      expect(
        commandProblems(
          `${launcher} sources list --json\n${launcher} ask "--not-a-flag" --trace --json`,
        ),
      ).toEqual([]);
    },
  );

  it('lists the six agent commands and each has a command pointer', () => {
    const names = [...readme.matchAll(/^\|\s*`\/([\w-]+)`\s*\|/gm)].map((match) => match[1] ?? '');
    expect(names).toEqual(['setup', 'add-docs', 'ingest', 'check-quality', 'tune', 'troubleshoot']);
    for (const name of names) {
      expect(existsSync(`.claude/commands/${name}.md`), `Missing pointer for /${name}`).toBe(true);
    }
  });

  it('leads with the Docker path and keeps the Node path in the guide', () => {
    const quick = readme.indexOf('## Quick start\n');
    const own = readme.indexOf('## Use your own documents\n');
    expect(quick).toBeGreaterThan(readme.indexOf('## Demo\n'));
    expect(own).toBeGreaterThan(quick);
    expect(readme).toContain('Docker is the only runtime prerequisite');
    const guide = readFileSync('docs/GUIDE.md', 'utf8');
    expect(guide).toContain('## Node path (contributors)');
    expect(guide).toContain('Node.js 22');
  });

  it('records the v2.0.0 release', () => {
    const entry = readFileSync('CHANGELOG.md', 'utf8')
      .split(/^## \[2\.0\.0\] - \d{4}-\d{2}-\d{2}\n/m)[1]
      ?.split('\n## [')[0];
    expect(entry).toBeDefined();
    for (const heading of ['Added', 'Changed', 'Notes']) {
      expect(entry).toContain(`### ${heading}`);
    }
  });
});
