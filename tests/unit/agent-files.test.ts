import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const commandNames = [
  'setup',
  'add-docs',
  'ingest',
  'check-quality',
  'tune',
  'troubleshoot',
  'deploy',
];
const launchers = ['./sourced', 'pnpm sourced'];
const settingsSchema = z.object({
  includeCoAuthoredBy: z.boolean(),
  attribution: z.object({
    commit: z.string(),
    pr: z.string(),
    sessionUrl: z.boolean(),
  }),
  permissions: z.object({ allow: z.array(z.string()) }),
});

function readSettings() {
  return settingsSchema.parse(JSON.parse(readFileSync('.claude/settings.json', 'utf8')));
}

// Check exact, legacy prefix (:*) and glob (*) Bash rules against commands.
function allowsCommand(rule: string, command: string): boolean {
  if (rule === 'Bash') return true;
  if (!rule.startsWith('Bash(') || !rule.endsWith(')')) return false;
  const pattern = rule.slice(5, -1);
  if (pattern.endsWith(':*')) {
    const prefix = pattern.slice(0, -2);
    return command === prefix || command.startsWith(`${prefix} `);
  }
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`).test(command);
}

describe('TC-236: agent command files (FR-88; TRD §37.1, §37.4, §37.5)', () => {
  it('preserves attribution and allows exactly the twelve specified rules', () => {
    const settings = readSettings();
    expect(settings.includeCoAuthoredBy).toBe(false);
    expect(settings.attribution).toEqual({
      commit: '',
      pr: '',
      sessionUrl: false,
    });
    const readOnlyCommands = [
      'doctor',
      'sources list',
      'inspect',
      'ingest --dry-run',
      'ask',
      'eval:generate --dry-run',
    ];
    expect(settings.permissions.allow.toSorted()).toEqual(
      launchers
        .flatMap((launcher) => readOnlyCommands.map((command) => `Bash(${launcher} ${command}:*)`))
        .toSorted(),
    );
  });

  it.each(launchers)('keeps protected %s commands outside the allowlist', (launcher) => {
    const { allow } = readSettings().permissions;
    const protectedCommands = [
      'init',
      'add',
      'ingest',
      'eval:generate',
      'eval',
      'eval:review',
      'sources remove',
      'dev',
      'down',
      'deploy:check',
    ];
    for (const command of protectedCommands) {
      for (const suffix of ['', ' --json', ' --yes --json']) {
        const invocation = `${launcher} ${command}${suffix}`;
        // Ensure broad legacy/glob permissions would be detected as matches.
        expect(allowsCommand(`Bash(${launcher}:*)`, invocation)).toBe(true);
        expect(allowsCommand(`Bash(${launcher} *)`, invocation)).toBe(true);
        expect(allow.filter((rule) => allowsCommand(rule, invocation))).toEqual([]);
      }
    }
  });

  it('has exactly seven thin pointers and covers every skill folder', () => {
    const files = readdirSync('.claude/commands').filter((file) => file.endsWith('.md'));
    expect(files.toSorted()).toEqual(commandNames.map((name) => `${name}.md`).toSorted());
    for (const name of commandNames) {
      const content = readFileSync(`.claude/commands/${name}.md`, 'utf8');
      const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
      expect(lines.length).toBeGreaterThanOrEqual(3);
      expect(lines.length).toBeLessThanOrEqual(5);
      const skillPath = `.agents/skills/sourced-${name}/SKILL.md`;
      expect(content.match(/\.agents\/skills\/[^\s`]+\/SKILL\.md/g)).toEqual([skillPath]);
      expect(existsSync(skillPath)).toBe(true);
    }
    const skillFolders = readdirSync('.agents/skills', { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() && existsSync(join('.agents/skills', entry.name, 'SKILL.md')),
      )
      .map((entry) => entry.name);
    expect(skillFolders.toSorted()).toEqual(
      commandNames.map((name) => `sourced-${name}`).toSorted(),
    );
  });

  it('runs check-skills in the existing lint job after installation', () => {
    const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
    const lintJob = workflow.match(/^  lint:\n(?:(?!^  \S)[\s\S])*/m)?.[0];
    expect(lintJob).toBeDefined();
    expect(lintJob).toMatch(/name: Lint and format/);
    expect(lintJob).toMatch(
      /- run: pnpm install --frozen-lockfile\s+- run: pnpm check-skills\s+- run: pnpm lint/,
    );
  });
});
