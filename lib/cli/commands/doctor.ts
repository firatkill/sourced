import { access, statfs, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { z } from 'zod';
import { getCliEnvironment } from '@/lib/env';
import { loadConfig, configHash } from '@/lib/kit/load-config';
import {
  readSnapshot,
  getKitConfig,
  setCliKitConfig,
  sourcedCommand,
} from '@/lib/kit/runtime-config';
import { checkCorpusSchema } from '@/lib/kit/vector-schema';
import { ftsConfig } from '@/lib/kit/fts';
import type { KitConfig } from '@/lib/kit/config-schema';
import type { Invocation, CommandResult } from '../router';
import { connectDatabase, execute, migrationStatus, repositoryRoot } from './database';
import { checkProviderKeys, checkDimensions } from './provider-checks';
import { requiredVariables } from './config-files';

type Check = { id: string; ok: boolean; detail: string; fix?: string };
async function writable(target: string): Promise<void> {
  try {
    await access(target, constants.W_OK);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return writable(path.dirname(target));
    throw error;
  }
}
type PortProbe = (port: number, host: string) => Promise<boolean>;
async function freePort(port: number, host: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') resolve(false);
      // An unavailable address family cannot have a listener.
      else if (error.code === 'EAFNOSUPPORT' || error.code === 'EADDRNOTAVAIL') resolve(true);
      else reject(error);
    });
    server.listen({ port, host, ipv6Only: host.includes(':') }, () =>
      server.close(() => {
        resolve(true);
      }),
    );
  });
}

/** FR-78 / D-135: host checks are meaningful only on the Node path. */
export async function checkPorts(
  env = getCliEnvironment(),
  probe: PortProbe = freePort,
  mapping: (service: string, internal: string) => Promise<string> = async (service, internal) =>
    (await execute('docker', ['compose', 'port', service, internal], { cwd: repositoryRoot }))
      .stdout,
): Promise<Check> {
  if (env.SOURCED_DOCKER === '1')
    return {
      id: 'ports',
      ok: true,
      detail: 'Host ports not checked inside the CLI container; the launcher reports taken ports.',
    };
  const fix =
    'Free the application and database ports, or set SOURCED_PORT / SOURCED_DB_PORT in .env.local.';
  try {
    const appPort = z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(env.SOURCED_PORT ?? 3000);
    const dbPort = z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .parse(
        env.DATABASE_URL ? new URL(env.DATABASE_URL).port || 5432 : (env.SOURCED_DB_PORT ?? 5433),
      );
    for (const [service, port, internal] of [
      ['app', appPort, '3000'],
      ['db', dbPort, '5432'],
    ] as const) {
      let owned: string[] | undefined;
      for (const host of ['127.0.0.1', '0.0.0.0', '::1', '::']) {
        if (await probe(port, host)) continue;
        if (!owned) {
          try {
            owned = (await mapping(service, internal)).trim().split('\n');
          } catch {
            owned = [];
          }
        }
        const ipv6 = host.includes(':');
        const wildcard = ipv6 ? '::' : '0.0.0.0';
        const ownedHere = owned.some((line) => {
          const match = /^(.*):(\d+)$/.exec(line.trim());
          const address = match?.[1]?.replace(/^\[|\]$/g, '');
          return (
            Number(match?.[2]) === port &&
            address !== undefined &&
            address.includes(':') === ipv6 &&
            (address === host || address === wildcard || host === wildcard)
          );
        });
        if (!ownedHere)
          return {
            id: 'ports',
            ok: false,
            detail: `${service} port ${String(port)} is taken on ${host}.`,
            fix,
          };
      }
    }
    return {
      id: 'ports',
      ok: true,
      detail: 'Application and database ports available or owned by project containers.',
    };
  } catch {
    return { id: 'ports', ok: false, detail: 'ports check failed.', fix };
  }
}
export async function runDoctor(
  input: Invocation,
  fetcher: typeof fetch = fetch,
): Promise<CommandResult> {
  const checks: Check[] = [];
  const warnings: { code: string; message: string }[] = [];
  const check = async (id: string, fix: string, run: () => Promise<string> | string) => {
    try {
      checks.push({ id, ok: true, detail: await run() });
    } catch {
      checks.push({ id, ok: false, detail: `${id} check failed.`, fix });
    }
  };
  const deploy = input.command === 'deploy:check';
  const env = getCliEnvironment();
  let config: KitConfig | undefined;
  await check(
    'config',
    `Edit sourced.config.ts and run ${sourcedCommand()} config:snapshot.`,
    async () => {
      config = await loadConfig(process.cwd(), { writeSnapshot: false });
      if (deploy && typeof input.values.profile === 'string')
        config = {
          ...config,
          profile: z.enum(['local', 'private', 'public-demo']).parse(input.values.profile),
        };
      setCliKitConfig(config);
      if (
        !deploy &&
        configHash(readSnapshot(path.resolve('.sourced/config.json'))) !== configHash(config)
      )
        throw new Error();
      return 'Configuration valid; snapshot current.';
    },
  );
  if (!deploy) {
    await check('node', 'Install Node >=22 and the pnpm version in package.json.', async () => {
      const pkg = z
        .object({ packageManager: z.string() })
        .parse(JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8')));
      const pnpm = (await execute('pnpm', ['--version'])).stdout.trim();
      if (Number(process.versions.node.split('.')[0]) < 22 || `pnpm@${pnpm}` !== pkg.packageManager)
        throw new Error();
      return `Node ${process.versions.node}; pnpm ${pnpm}.`;
    });
    checks.push(await checkPorts(env));
    await check('disk', 'Free at least 2 GB on the repository volume.', async () => {
      const disk = await statfs(process.cwd());
      if (disk.bavail * disk.bsize < 2 * 1024 ** 3) throw new Error();
      return 'At least 2 GB free on the repository volume.';
    });
  }
  const selected = config;
  if (selected) {
    if (deploy) {
      await check(
        'profile',
        'Set profile to local, private or public-demo in sourced.config.ts.',
        () => selected.profile,
      );
      await check(
        'variables',
        'Fill the required variable names in .env.local or the deployment environment.',
        () => {
          const values: Record<string, string | undefined> = env;
          const names = requiredVariables(selected).filter(
            (n) => env.LLM_MODE !== 'mock' || !n.endsWith('_API_KEY'),
          );
          const missing = names.filter((name) => !values[name]?.trim());
          if (missing.length) {
            checks.push({
              id: 'missing-variables',
              ok: false,
              detail: missing.join(', '),
              fix: 'Set these variable names in the deployment environment.',
            });
            throw new Error();
          }
          return names.join(', ');
        },
      );
      if (selected.profile === 'private')
        await check('access-token', 'Set SOURCED_ACCESS_TOKEN to at least 24 characters.', () => {
          if ((env.SOURCED_ACCESS_TOKEN?.length ?? 0) < 24) throw new Error();
          return 'SOURCED_ACCESS_TOKEN present.';
        });
      if (selected.profile === 'public-demo')
        await check(
          'quotas',
          'Set RATE_LIMIT_IP_DAILY, RATE_LIMIT_GLOBAL_DAILY, DEMO_MODE and IP_HASH_SALT.',
          () => {
            z.coerce.number().int().positive().parse(env.RATE_LIMIT_IP_DAILY);
            z.coerce.number().int().positive().parse(env.RATE_LIMIT_GLOBAL_DAILY);
            z.enum(['on', 'readonly', 'off']).parse(env.DEMO_MODE);
            if ((env.IP_HASH_SALT?.length ?? 0) < 32) throw new Error();
            return 'Public-demo quotas and IP hash salt configured.';
          },
        );
    }
    await check(
      'database',
      'Set DATABASE_URL, enable vector and run pnpm db:migrate.',
      async () => {
        const sql = connectDatabase();
        try {
          const rows = await sql<
            { extversion: string }[]
          >`SELECT extversion FROM pg_extension WHERE extname='vector'`;
          if (!rows[0] || !(await migrationStatus(sql))) throw new Error();
          return `Database reachable; vector ${rows[0].extversion}; migrations current.`;
        } finally {
          await sql.end();
        }
      },
    );
    await check('fts', 'Choose an installed full-text language or use simple.', async () => {
      const sql = connectDatabase();
      const fts = ftsConfig(selected.corpus.language);
      try {
        const rows = await sql`SELECT oid FROM pg_ts_config WHERE cfgname=${fts}`;
        if (!rows.length) throw new Error();
        return `${selected.corpus.language} uses ${fts} text search.`;
      } finally {
        await sql.end();
      }
    });
    await check(
      'corpus',
      'Run pnpm sourced ingest (or ingest --rebuild for a configuration mismatch).',
      async () => {
        const sql = connectDatabase();
        try {
          const state = await checkCorpusSchema(sql, getKitConfig());
          const rows = await sql<
            { present: boolean }[]
          >`SELECT EXISTS(SELECT 1 FROM chunks) AS present`;
          if (state.empty || !rows[0]?.present) throw new Error();
          return 'Corpus ingested with the configured embedding model, dimensions and language.';
        } finally {
          await sql.end();
        }
      },
    );
    if (!deploy) {
      const noNetwork = input.values['no-network'] === true;
      await check(
        'keys',
        'Set configured provider keys in .env.local; for Ollama, pull the configured models.',
        () => checkProviderKeys(selected, env, noNetwork, fetcher),
      );
      if (noNetwork) {
        warnings.push({
          code: 'NETWORK_SKIPPED',
          message: 'Provider authentication and embedding dimensions skipped (--no-network).',
        });
        checks.push({ id: 'dimensions', ok: true, detail: 'Skipped (--no-network).' });
      } else
        await check(
          'dimensions',
          'Set the configured embedding model and dimensions, then re-ingest.',
          () => checkDimensions(selected, env, fetcher),
        );
      await check(
        'writable',
        'Grant write access to the corpus and eval directories.',
        async () => {
          await writable(path.resolve('corpus', selected.corpus.name));
          await writable(path.resolve('eval', selected.corpus.name));
          return 'Corpus and eval directories writable.';
        },
      );
    }
  }
  return { result: { checks }, warnings, exitCode: checks.every((c) => c.ok) ? 0 : 2 };
}
