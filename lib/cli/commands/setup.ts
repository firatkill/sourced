import { z } from 'zod';
import { getCliEnvironment } from '@/lib/env';
import { issueSetupToken, setupUrl } from '@/lib/setup/token';
import type { Invocation } from '../router';

/** T-88: a new one-time setup link; earlier links and signed-in browsers stop working. */
export function runSetup(input: Invocation): { url: string } {
  const port = z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .parse(input.values.port ?? getCliEnvironment().SOURCED_PORT ?? 3000);
  return { url: setupUrl(port, issueSetupToken(process.cwd(), true)) };
}
