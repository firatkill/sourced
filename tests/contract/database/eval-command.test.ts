import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { beforeAll, expect, test } from 'vitest';
import { z } from 'zod';
import { CliEnvelope } from '@/lib/cli/envelope';
import { commandSchemas } from '@/lib/cli/schemas/commands';
import { requireLocalDatabase } from '../../helpers/local-database';

const execute = promisify(execFile);
async function cli(args: string[], expected: number) {
  let stdout: string;
  let stderr: string;
  let code = 0;
  const url = requireLocalDatabase(process.env.TEST_DATABASE_URL);
  try {
    ({ stdout, stderr } = await execute(
      process.execPath,
      ['--import', 'tsx', '--conditions=react-server', 'scripts/sourced.ts', ...args, '--json'],
      {
        env: {
          PATH: process.env.PATH,
          LLM_MODE: 'mock',
          NODE_ENV: 'test',
          DATABASE_URL: url,
          MIGRATION_DATABASE_URL: url,
          QUESTION_HASH_SALT: 'test-only-question-salt-0000000000000000',
          IP_HASH_SALT: 'test-only-ip-salt-00000000000000000000000',
          NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
          MOCK_STREAM_DELAY_MS: '0',
        },
      },
    ));
  } catch (error) {
    ({ stdout, stderr, code } = z
      .object({ stdout: z.string(), stderr: z.string(), code: z.number() })
      .parse(error));
  }
  expect(code, stdout + stderr).toBe(expected);
  expect(stdout.trim().split('\n')).toHaveLength(1);
  const result = CliEnvelope.parse(JSON.parse(stdout));
  expect(result.ok).toBe(expected === 0);
  for (const line of stderr.trim().split('\n').filter(Boolean))
    expect(JSON.parse(line)).toHaveProperty('event');
  return result;
}
beforeAll(async () => {
  const result = await cli(['ingest', '--offline', '--include-fixtures'], 0);
  commandSchemas.ingest.parse(result.result);
});
test('CT-10 / FR-77: real mock eval preserves its result schema when quality floors fail', async () => {
  const envelope = await cli(['eval', '--no-write', '--only', 'q002'], 1);
  expect(envelope.command).toBe('eval');
  const result = commandSchemas.eval.parse(envelope.result);
  expect(result).toBeDefined();
  expect(result?.metrics.counts.total).toBe(1);
  // TRD §17: absent refusal/injection samples score zero, so this focused
  // answerable run must fail their unchanged floors. Validation-only covers
  // eval's exit-0 contract in eval-validate.test.ts.
  expect(result?.pass).toBe(false);
  expect(envelope.error?.code).toBe('CHECKS_FAILED');
  for (const failure of result?.failures ?? [])
    expect(envelope.error?.message).toContain(failure.metric);
  expect(result?.failures).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        metric: 'correctRefusal',
        kind: 'floor',
        likelyCause: 'not-found sentence or model',
      }),
      expect.objectContaining({ metric: 'injectionResistance', kind: 'floor', likelyCause: null }),
    ]),
  );
});
