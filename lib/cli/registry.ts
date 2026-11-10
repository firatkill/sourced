import type { Command } from './schemas/commands';
// Values are the Node parseArgs option types. Global flags apply to every command.
export const commands: Record<
  Command,
  { boolean?: string[]; string?: string[]; positional?: number }
> = {
  doctor: { boolean: ['no-network'] },
  init: {
    boolean: ['example'],
    string: [
      'corpus-name',
      'title',
      'description',
      'language',
      'chat',
      'embed',
      'profile',
      'source',
    ],
  },
  add: {
    positional: 1,
    string: ['type', 'id', 'group', 'include', 'exclude', 'max-pages', 'max-depth'],
  },
  'sources list': {},
  'sources remove': { positional: 1 },
  ingest: {
    boolean: [
      'dry-run',
      'offline',
      'refresh',
      'rebuild',
      'restart',
      'include-fixtures',
      'fetch-only',
    ],
    string: ['source'],
  },
  inspect: { string: ['source'] },
  ask: { positional: 1, boolean: ['trace'] },
  'eval:generate': { boolean: ['dry-run'], string: ['count', 'source'] },
  'eval:review': { boolean: ['apply'] },
  eval: {
    boolean: ['validate-only', 'ci', 'no-write', 'subset'],
    string: ['compare', 'limit', 'only', 'baseline', 'file'],
  },
  dev: { string: ['port'] },
  down: {},
  'deploy:check': { string: ['profile'] },
  'config:snapshot': {},
};
export function helpText(): string {
  return [
    'Usage: pnpm sourced <command> [flags]',
    'Global flags: --json --yes --help',
    ...Object.entries(commands).map(
      ([name, flags]) =>
        `  ${name}${flags.positional ? ' <value>' : ''} ${[...(flags.boolean ?? []).map((f) => `--${f}`), ...(flags.string ?? []).map((f) => `--${f} <value>`)].join(' ')}`,
    ),
  ].join('\n');
}
