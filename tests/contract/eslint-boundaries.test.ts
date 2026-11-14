import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

// TC-151 / NFR-14: TRD §8, including aliases and relative imports.
// Virtual files need no TypeScript project membership; retain the project import rules.
const eslint = new ESLint({ overrideConfig: tseslint.configs.disableTypeChecked });
const clientForbidden = [
  'lib/env',
  'lib/env.ts',
  'lib/db/client',
  'lib/llm/provider',
  'lib/logger',
  'lib/logger.ts',
  'lib/ratelimit/check',
  'lib/cache/answer',
  'lib/querylog/write',
  'lib/ingest/chunk',
  'lib/generation/answer',
];
const clientAllowed = [
  'lib/config',
  'lib/suggested',
  'lib/errors',
  'lib/sse/events',
  'lib/sse/parse',
  'lib/citations/normalize',
  'lib/copy-format',
  'lib/markdown/remark-citations',
  'components/ui/button',
];
const cases = [
  ...['components/security-probe.tsx', 'hooks/security-probe.ts'].map((filePath) => ({
    filePath,
    forbidden: clientForbidden,
    allowed: clientAllowed,
    packages: [],
  })),
  {
    filePath: 'app/api/security-probe/route.ts',
    forbidden: ['components/ui/button', 'hooks/use-ask'],
    allowed: ['lib/db/client', 'lib/env'],
    packages: [],
  },
  ...['retrieval', 'generation', 'citations'].map((directory) => ({
    filePath: `lib/${directory}/security-probe.ts`,
    forbidden: [],
    allowed: ['lib/llm/provider', 'lib/db/client', 'lib/config', 'lib/env'],
    packages: ['next/server', 'next/headers', 'next/navigation'],
  })),
  {
    filePath: 'middleware.ts',
    forbidden: ['lib/db/client', 'lib/logger', 'lib/logger.ts', 'lib/llm/provider'],
    allowed: ['lib/env', 'lib/config'],
    packages: [],
  },
  {
    filePath: 'scripts/security-probe.ts',
    forbidden: ['components/ui/button'],
    allowed: ['lib/db/client', 'lib/env'],
    packages: ['next/server', 'next/headers', 'next/navigation'],
  },
];

async function lintImport(filePath: string, specifier: string) {
  const results = await eslint.lintText(`import '${specifier}';\n`, { filePath });
  expect(results).toHaveLength(1);
  return results[0]!;
}

for (const { filePath, forbidden, allowed, packages } of cases) {
  describe(`TC-151: ${filePath}`, () => {
    const depth = filePath.split('/').length - 1;
    const relative = depth === 0 ? './' : '../'.repeat(depth);
    for (const prefix of ['@/', relative]) {
      it.each(forbidden)(`rejects ${prefix}%s with exactly one import error`, async (specifier) => {
        const result = await lintImport(filePath, prefix + specifier);
        expect(result.messages).toEqual([
          expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2 }),
        ]);
        expect(result.errorCount).toBe(1);
      });
      it.each(allowed)(`allows ${prefix}%s`, async (specifier) => {
        expect((await lintImport(filePath, prefix + specifier)).messages).toEqual([]);
      });
    }
    it.each(packages)('rejects framework import %s', async (specifier) => {
      expect((await lintImport(filePath, specifier)).messages).toEqual([
        expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2 }),
      ]);
    });
  });
}

it.each(['app/security-probe/page.tsx', 'app/layout.tsx'])(
  'TC-151: server component %s may import server modules and components',
  async (filePath) => {
    for (const specifier of ['@/lib/env', '@/lib/db/client', '@/components/ui/button']) {
      expect((await lintImport(filePath, specifier)).messages).toEqual([]);
    }
  },
);

it.each(['components/security-probe.tsx', 'hooks/security-probe.ts'])(
  'TC-151: %s may import eval schema types',
  async (filePath) => {
    const results = await eslint.lintText(
      "export type { EvalResults } from '@/lib/eval/results-schema';\n",
      { filePath },
    );
    expect(results[0]?.messages).toEqual([]);
  },
);

// T-58 regression: copied application builds deliberately omit scripts/.
it.each([
  'lib/cli/probe.ts',
  'lib/eval/probe.ts',
  'lib/retrieval/probe.ts',
  'lib/generation/probe.ts',
  'lib/citations/probe.ts',
  'app/page.tsx',
  'app/api/probe/route.ts',
  'components/probe.tsx',
  'hooks/probe.ts',
])('T-58: %s cannot depend on scripts through any import entry point', async (filePath) => {
  for (const specifier of ['@/scripts/eval', '../../scripts/eval']) {
    for (const source of [`import '${specifier}';`, `export * from '${specifier}';`]) {
      const [result] = await eslint.lintText(source, { filePath });
      expect(result?.messages).toEqual([
        expect.objectContaining({ ruleId: 'no-restricted-imports', severity: 2 }),
      ]);
    }
    for (const source of [
      `void import('${specifier}');`,
      `require('${specifier}');`,
      `import run = require('${specifier}');`,
    ]) {
      const [result] = await eslint.lintText(source, { filePath });
      expect(result?.messages).toContainEqual(
        expect.objectContaining({ ruleId: 'no-restricted-syntax', severity: 2 }),
      );
    }
  }
});
