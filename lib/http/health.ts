import { z } from 'zod';

export const HealthResponse = z.object({
  status: z.enum(['ok', 'degraded']),
  db: z.enum(['ok', 'error']),
  demoMode: z.enum(['on', 'readonly', 'off']),
  llmMode: z.enum(['live', 'mock']),
  version: z.string(),
  corpus: z
    .object({
      version: z.string().nullable(),
      documents: z.number().int(),
      chunks: z.number().int(),
    })
    .nullable(),
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- TRD §11.3 schema
  time: z.string().datetime(),
});
