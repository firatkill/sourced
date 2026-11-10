import { z } from 'zod';
import { SourceSchema } from '@/lib/kit/config-schema';
import { EvalResult } from '@/lib/eval/results-schema';
import { CitationsEvent } from '@/lib/sse/events';
import { IngestResult } from './ingest';
const count = z.number().int().nonnegative();
const checks = z.object({
  checks: z.array(
    z.object({ id: z.string(), ok: z.boolean(), detail: z.string(), fix: z.string().optional() }),
  ),
});
export const commandSchemas = {
  doctor: checks,
  init: z.object({
    configPath: z.string(),
    envVarsToFill: z.array(z.string()),
    database: z.enum(['started', 'running', 'external']),
  }),
  add: z.object({
    source: SourceSchema,
    detected: z.object({
      type: z.enum(['folder', 'urls', 'sitemap', 'crawl', 'git']),
      sitemapUrl: z.url().optional(),
    }),
  }),
  'sources list': z.object({ sources: z.array(SourceSchema) }),
  'sources remove': z.object({ removedDocuments: count }),
  ingest: IngestResult,
  inspect: z.object({
    findings: z.array(
      z.object({
        code: z.enum([
          'empty_document',
          'needs_ocr',
          'tiny_chunks',
          'oversized_chunks',
          'near_duplicates',
          'boilerplate_removed',
          'language_mismatch',
          'skipped_files',
          'failed_items',
        ]),
        severity: z.enum(['info', 'warn', 'error']),
        affects: z.array(z.enum(['retrieval', 'citations', 'cost'])),
        fix: z.string(),
      }),
    ),
  }),
  ask: z.object({
    outcome: z.enum(['answered', 'not_found', 'error']),
    answer: z.string(),
    citations: CitationsEvent.shape.valid,
    trace: z.record(z.string(), z.unknown()).optional(),
  }),
  'eval:generate': z.object({ written: count, costUsd: z.number().nonnegative() }),
  'eval:review': z.object({ accepted: count, rejected: count, edited: count }),
  eval: EvalResult.omit({ questions: true })
    .extend({ comparison: z.record(z.string(), z.unknown()).optional() })
    .optional(),
  dev: z.object({ url: z.url() }),
  down: z.object({}),
  'deploy:check': checks,
  'config:snapshot': z.object({ configHash: z.string().regex(/^[a-f0-9]{64}$/) }),
};
export type Command = keyof typeof commandSchemas;
