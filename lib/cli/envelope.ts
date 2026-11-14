import { z } from 'zod';
import { ERROR_CODES } from '@/lib/errors';

export const CliEnvelope = z.object({
  schemaVersion: z.literal(1),
  command: z.string(),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z
    .object({
      // Browser access failures are HTTP-only; preserve the versioned CLI contract.
      code: z.enum(ERROR_CODES.filter((code) => code !== 'ACCESS_DENIED')),
      message: z.string(),
      fix: z.string().optional(),
    })
    .optional(),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })).default([]),
});
export type CliEnvelope = z.infer<typeof CliEnvelope>;
export type ExitCode = 0 | 1 | 2 | 130;
