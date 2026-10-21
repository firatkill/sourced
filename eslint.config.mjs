import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import tseslint from 'typescript-eslint';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'react/no-danger': 'error',
      'no-console': 'error',
    },
  },
  {
    files: ['components/**/*.{ts,tsx}', 'hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@/lib/env',
            '@/lib/db/*',
            '@/lib/llm/*',
            '@/lib/logger',
            '@/lib/ratelimit/*',
            '@/lib/cache/*',
            '@/lib/querylog/*',
            '@/lib/ingest/*',
            '@/lib/generation/*',
          ],
        },
      ],
    },
  },
  { files: ['scripts/**', 'tests/**'], rules: { 'no-console': 'off' } },
  { files: ['tests/**'], rules: { '@typescript-eslint/no-non-null-assertion': 'off' } },
]);
