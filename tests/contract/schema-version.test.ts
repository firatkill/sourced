import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';
import { z } from 'zod';
import { CliEnvelope } from '@/lib/cli/envelope';
import { commandSchemas } from '@/lib/cli/schemas/commands';

test('CT-01–CT-14 / NFR-22: pins schemas by envelope schemaVersion', () => {
  const version = CliEnvelope.shape.schemaVersion.value;
  expect({
    envelope: z.toJSONSchema(CliEnvelope),
    commands: Object.fromEntries(
      Object.entries(commandSchemas).map(([name, schema]) => [
        name,
        z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }),
      ]),
    ),
  }).toMatchSnapshot(`schemaVersion=${String(version)}`);
});

// D-125: the approved inspect placeholder completion updates the version-1 baseline.
// Mutate released config:snapshot below, never an unreleased placeholder; the guard stays strict.
test('CT-01–CT-14 / NFR-22: changing a released schema in a temporary copy fails without a version bump', async () => {
  const root = process.cwd();
  const dir = await mkdtemp(join(tmpdir(), 'sourced-schema-mutation-'));
  try {
    await cp('lib', join(dir, 'lib'), { recursive: true });
    await mkdir(join(dir, 'tests/contract/__snapshots__'), { recursive: true });
    await cp(
      'tests/contract/schema-version.test.ts',
      join(dir, 'tests/contract/schema-version.test.ts'),
    );
    await cp(
      'tests/contract/__snapshots__/schema-version.test.ts.snap',
      join(dir, 'tests/contract/__snapshots__/schema-version.test.ts.snap'),
    );
    await symlink(resolve('node_modules'), join(dir, 'node_modules'), 'dir');
    await writeFile(join(dir, 'package.json'), '{"type":"module"}');
    await writeFile(join(dir, 'empty.ts'), 'export {};');
    await writeFile(
      join(dir, 'vitest.config.ts'),
      `export default {resolve:{alias:{'@':${JSON.stringify(dir)},'server-only':${JSON.stringify(join(dir, 'empty.ts'))}}},test:{include:['tests/contract/schema-version.test.ts'],update:false}};`,
    );
    const run = async () => {
      try {
        const result = await promisify(execFile)(
          process.execPath,
          [
            join(root, 'node_modules/vitest/vitest.mjs'),
            'run',
            '--config',
            join(dir, 'vitest.config.ts'),
            '-t',
            'pins schemas by envelope schemaVersion',
          ],
          {
            cwd: dir,
            env: { PATH: process.env.PATH, CI: 'true', LLM_MODE: 'mock', NODE_ENV: 'test' },
            maxBuffer: 1024 * 1024,
          },
        );
        return { code: 0, output: result.stdout + result.stderr };
      } catch (error) {
        const result = z
          .object({ code: z.number(), stdout: z.string(), stderr: z.string() })
          .parse(error);
        return { code: result.code, output: result.stdout + result.stderr };
      }
    };
    const unchanged = await run();
    expect(unchanged.code, unchanged.output).toBe(0);
    const filename = join(dir, 'lib/cli/schemas/commands.ts');
    const original = await readFile(filename, 'utf8');
    const mutated = original.replace(
      'configHash: z.string().regex(/^[a-f0-9]{64}$/)',
      'configHash: z.number()',
    );
    expect(mutated).not.toBe(original);
    await writeFile(filename, mutated);
    const changed = await run();
    expect(changed.code, changed.output).toBe(1);
    expect(changed.output).toContain('Snapshot');
    expect(changed.output).toContain('mismatched');
    expect(changed.output).toContain('schemaVersion=1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
