import { parseArgs } from 'node:util';
import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { EnvironmentError, getEnv } from '@/lib/env';
import { RobotsDisallowedError } from '@/lib/ingest/robots';
import { CliEnvelope, type ExitCode } from './envelope';
import { commands, helpText } from './registry';
import { commandSchemas, type Command } from './schemas/commands';
import { confirmAction } from './prompts';
import { NO_SOURCES } from './commands/config-files';

export type Invocation = {
  command: Command;
  values: Record<string, string | boolean | undefined>;
  positionals: string[];
  json: boolean;
};
export type CommandContext = {
  progress: (message: string) => void;
  isTTY: boolean;
  prompt?: (message: string) => Promise<boolean>;
};
export type CommandResult = {
  result?: unknown;
  exitCode?: ExitCode;
  warnings?: { code: string; message: string }[];
};
export type Handler = (input: Invocation, context: CommandContext) => Promise<CommandResult>;
export function parseInvocation(args: string[]): Invocation {
  const globals: string[] = [];
  const rest = [...args];
  while (rest[0] && ['--json', '--yes', '--help'].includes(rest[0])) {
    const flag = rest.shift();
    if (flag) globals.push(flag);
  }
  const name = rest.shift();
  const command = name === 'sources' ? `sources ${rest.shift() ?? ''}` : name;
  if (!command || !Object.hasOwn(commands, command))
    throw new AppError('VALIDATION_FAILED', 'Choose a registered command.');
  const key = command as Command;
  const definition = commands[key];
  const options: Record<string, { type: 'boolean' | 'string' }> = {
    json: { type: 'boolean' },
    yes: { type: 'boolean' },
    help: { type: 'boolean' },
  };
  for (const flag of definition.boolean ?? []) options[flag] = { type: 'boolean' };
  for (const flag of definition.string ?? []) options[flag] = { type: 'string' };
  const { values, positionals } = parseArgs({
    args: [...rest, ...globals],
    options,
    strict: true,
    allowPositionals: true,
  });
  if (!values.help && positionals.length !== (definition.positional ?? 0))
    throw new AppError('VALIDATION_FAILED', 'Check the command arguments.');
  for (const flag of ['count', 'max-pages', 'max-depth', 'port', 'limit'])
    if (values[flag] !== undefined) z.coerce.number().int().nonnegative().parse(values[flag]);
  if (values.type !== undefined)
    z.enum(['folder', 'urls', 'sitemap', 'crawl', 'git']).parse(values.type);
  if (values.profile !== undefined)
    z.enum(['local', 'private', 'public-demo']).parse(values.profile);
  return { command: key, values, positionals, json: values.json === true };
}
export function failure(
  command: string,
  code: AppError['code'],
  message: string,
  fix = 'pnpm sourced --help',
): CliEnvelope {
  return CliEnvelope.parse({
    schemaVersion: 1,
    command,
    ok: false,
    error: { code, message, fix },
    warnings: [],
  });
}
export async function dispatch(
  args: string[],
  context: CommandContext,
  handler: Handler = runCommand,
): Promise<{ envelope: CliEnvelope; exitCode: ExitCode }> {
  let command = 'sourced';
  try {
    if (!args.length || args.every((a) => ['--help', '--json'].includes(a))) {
      return {
        envelope: CliEnvelope.parse({
          schemaVersion: 1,
          command: 'help',
          ok: true,
          result: { usage: helpText() },
        }),
        exitCode: 0,
      };
    }
    const input = parseInvocation(args);
    command = input.command;
    if (input.values.help)
      return {
        envelope: CliEnvelope.parse({
          schemaVersion: 1,
          command,
          ok: true,
          result: { usage: helpText() },
        }),
        exitCode: 0,
      };
    if (input.values.rebuild || command === 'sources remove') {
      await confirmAction({
        yes: input.values.yes === true,
        json: input.json,
        isTTY: context.isTTY,
        message:
          command === 'sources remove'
            ? 'Remove this source and its documents?'
            : 'Rebuild the corpus and replace its indexed documents?',
        ...(context.prompt ? { prompt: context.prompt } : {}),
      });
      input.values.yes = true;
    }
    const outcome = await handler(input, context);
    const result = commandSchemas[input.command].parse(outcome.result);
    const failedChecks =
      command === 'doctor' || command === 'deploy:check'
        ? commandSchemas.doctor.parse(result).checks.filter((check) => !check.ok)
        : [];
    const failedCheck = failedChecks[0];
    const exitCode = failedCheck ? 2 : (outcome.exitCode ?? 0);
    const envelope =
      exitCode === 0
        ? CliEnvelope.parse({ schemaVersion: 1, command, ok: true, result })
        : {
            ...failure(
              command,
              failedCheck
                ? 'CHECKS_FAILED'
                : exitCode === 2
                  ? 'NEEDS_CONFIRMATION'
                  : 'INTERNAL_ERROR',
              failedCheck
                ? failedChecks
                    .map((check) => `${check.id}: ${check.fix ?? check.detail}`)
                    .join('\n')
                : exitCode === 2
                  ? 'The command needs configuration or confirmation before it can continue.'
                  : 'The command did not meet its required checks.',
              failedCheck?.fix ??
                (command === 'eval' ? 'pnpm sourced eval --validate-only' : 'pnpm sourced --help'),
            ),
            ...(result === undefined ? {} : { result }),
          };
    envelope.warnings = outcome.warnings ?? [];
    return { envelope, exitCode };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'ExitPromptError' || error.name === 'AbortPromptError')
    )
      return {
        envelope: failure(
          command,
          'INTERNAL_ERROR',
          'The command was interrupted.',
          command === 'ingest' ? 'pnpm sourced ingest' : 'pnpm sourced --help',
        ),
        exitCode: 130,
      };
    if (error instanceof RobotsDisallowedError)
      return {
        envelope: failure(
          command,
          'VALIDATION_FAILED',
          'The site robots policy refuses this request.',
          'Edit sourced.config.ts to use an allowed source.',
        ),
        exitCode: 2,
      };
    if (error instanceof EnvironmentError)
      return {
        envelope: failure(
          command,
          'CONFIG_INVALID',
          error.message,
          error.issues.map((issue) => issue.fix).join(' '),
        ),
        exitCode: 2,
      };
    if (error instanceof AppError) {
      const action = [
        'NEEDS_CONFIRMATION',
        'CHECKS_FAILED',
        'CORPUS_MISMATCH',
        'CORPUS_EMPTY',
      ].includes(error.code);
      const messages = {
        NEEDS_CONFIRMATION: error.message,
        CORPUS_MISMATCH: 'The corpus was indexed with a different embedding model or language.',
        CORPUS_EMPTY: error.message === NO_SOURCES ? NO_SOURCES : 'Nothing is indexed yet.',
      };
      const message =
        error.code in messages
          ? messages[error.code as keyof typeof messages]
          : error.code === 'CONFIG_INVALID'
            ? 'The configuration is invalid. Check sourced.config.ts.'
            : error.message;
      const fix =
        error.message === NO_SOURCES
          ? 'sourced add <url or path>'
          : error.code === 'NEEDS_CONFIRMATION'
            ? command === 'init'
              ? 'pnpm sourced init --help'
              : command === 'ingest'
                ? 'pnpm sourced ingest --yes'
                : 'pnpm sourced sources remove <id> --yes'
            : error.code === 'CORPUS_MISMATCH'
              ? 'pnpm sourced ingest --rebuild'
              : error.code === 'CORPUS_EMPTY'
                ? 'pnpm sourced ingest'
                : 'pnpm sourced --help';
      return { envelope: failure(command, error.code, message, fix), exitCode: action ? 2 : 1 };
    }
    const missingEnv =
      error instanceof Error && error.message.startsWith('Invalid environment variables:');
    return {
      envelope: failure(
        command,
        missingEnv ? 'CONFIG_INVALID' : 'VALIDATION_FAILED',
        missingEnv
          ? 'Required environment settings are missing or invalid.'
          : 'The command failed. Check its arguments, configuration and database connection.',
        missingEnv
          ? 'Edit .env.local using the variable names in .env.example, then retry.'
          : 'pnpm sourced --help',
      ),
      exitCode: missingEnv ? 2 : 1,
    };
  }
}
async function runCommand(input: Invocation, context: CommandContext): Promise<CommandResult> {
  switch (input.command) {
    case 'doctor':
    case 'deploy:check':
      return (await import('./commands/doctor')).runDoctor(input);
    case 'init':
      return { result: await (await import('./commands/init')).runInit(input, context) };
    case 'add':
      return { result: await (await import('./commands/add')).runAdd(input, context) };
    case 'sources list':
    case 'sources remove':
      return { result: await (await import('./commands/sources')).runSources(input) };
    case 'ask':
      return { result: await (await import('./commands/ask')).runAsk(input) };
    case 'dev':
      return { result: await (await import('./commands/dev')).runDev(input, context) };

    case 'config:snapshot': {
      const { loadConfig, configHash } = await import('@/lib/kit/load-config');
      return { result: { configHash: configHash(await loadConfig()) } };
    }
    case 'ingest': {
      const { runIngest } = await import('./commands/ingest');
      return { result: await runIngest(input, context) };
    }
    case 'eval': {
      if (input.values.compare)
        throw new AppError('INTERNAL_ERROR', 'Eval comparison is not implemented yet (T-67).');
      const args = Object.entries(input.values).flatMap(([key, value]) =>
        ['json', 'yes', 'validate-only'].includes(key) || value === undefined || value === false
          ? []
          : value === true
            ? [`--${key}`]
            : [`--${key}`, value],
      );
      if (input.values['validate-only']) {
        const { runEvalValidation } = await import('@/lib/eval/validate');
        const exitCode = await runEvalValidation(args, context.progress);
        return { exitCode: exitCode === 0 ? 0 : 1 };
      }
      getEnv();
      const { runEval } = await import('@/lib/eval/run');
      let result: unknown;
      const status = await runEval(args, {
        result: (value) => {
          result = value;
        },
        write: context.progress,
      });
      return { result, exitCode: status === 0 ? 0 : status === 2 || status === 3 ? 2 : 1 };
    }
    default:
      throw new AppError(
        'INTERNAL_ERROR',
        `${input.command} is not implemented yet. This command is reserved for a later implementation task.`,
      );
  }
}
