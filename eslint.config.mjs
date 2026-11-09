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
    '.codex-prompts/**',
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
            {
              regex:
                '^(@/|(?:\\.\\.?/)+)lib/(?:env(?:\\.ts)?|logger(?:\\.ts)?|(?:db|llm|ratelimit|cache|querylog|ingest|generation)(?:/.*)?)$',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['app/api/**/route.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ regex: '^(@/|(?:\\.\\.?/)+)(?:components|hooks)(?:/.*)?$' }] },
      ],
    },
  },
  {
    files: ['lib/{retrieval,generation,citations}/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { patterns: ['next/*'] }] },
  },
  {
    files: ['middleware.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ regex: '^(@/|(?:\\.\\.?/)+)lib/(?:logger(?:\\.ts)?|(?:db|llm)(?:/.*)?)$' }],
        },
      ],
    },
  },
  {
    files: ['scripts/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['next/*'] }, { regex: '^(@/|(?:\\.\\.?/)+)components(?:/.*)?$' }],
        },
      ],
    },
  },
  { files: ['scripts/**', 'tests/**'], rules: { 'no-console': 'off' } },
  { files: ['tests/**'], rules: { '@typescript-eslint/no-non-null-assertion': 'off' } },
]);
