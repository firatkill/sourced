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
  it('names only registered CLI commands and flags for all three launchers', () => {
    for (const launcher of ['./sourced', 'sourced.cmd', 'pnpm sourced']) {
      expect(readme).toContain(`${launcher} init`);
    }
    expect(commandProblems(readme)).toEqual([]);
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

  it('lists the seven agent commands and each has a command pointer', () => {
    const names = [...readme.matchAll(/^\|\s*`\/([\w-]+)`\s*\|/gm)].map((match) => match[1] ?? '');
    expect(names).toEqual([
      'setup',
      'add-docs',
      'ingest',
      'check-quality',
      'tune',
      'troubleshoot',
      'deploy',
    ]);
    for (const name of names) {
      expect(existsSync(`.claude/commands/${name}.md`), `Missing pointer for /${name}`).toBe(true);
    }
  });

  it('puts Docker-led kit setup before the mock example and includes the Node path', () => {
    const kit = readme.indexOf('## Use your own documents\n');
    const example = readme.indexOf('## Run locally without an API key\n');
    expect(kit).toBeGreaterThan(readme.indexOf('## Demo\n'));
    expect(example).toBeGreaterThan(kit);
    const section = readme.slice(kit, readme.indexOf('\n## ', kit + 1));
    expect(section).toContain('### Docker path (default)');
    expect(section).toContain('### Node path (contributors)');
    expect(section.indexOf('### Docker path')).toBeLessThan(section.indexOf('### Node path'));
    expect(section).toContain('Docker is the only runtime prerequisite');
    expect(section).toContain('Node.js 22');
  });

  it('records the v2.0.0 changes as unreleased', () => {
    const entry = readFileSync('CHANGELOG.md', 'utf8')
      .split('## [Unreleased]\n')[1]
      ?.split('\n## [')[0];
    expect(entry).toContain('v2.0.0');
    for (const heading of ['Added', 'Changed', 'Notes']) {
      expect(entry).toContain(`### ${heading}`);
    }
  });
});
