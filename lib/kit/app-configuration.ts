import 'server-only';
import { EnvironmentError, getEnv } from '@/lib/env';
import { AppError } from '@/lib/errors';
import { CONFIGURATION_COPY } from '@/lib/copy';
import { getRuntimeCopy } from './copy-server';

/** Public diagnostics contain only owned copy and schema-derived variable names. */
export function readAppConfiguration() {
  try {
    const copy = getRuntimeCopy();
    const env = getEnv();
    return { ok: true as const, copy, env };
  } catch (error) {
    if (error instanceof EnvironmentError)
      return { ok: false as const, fixes: error.issues.map(({ fix }) => fix) };
    if (error instanceof AppError && error.code === 'CONFIG_INVALID')
      return { ok: false as const, fixes: [CONFIGURATION_COPY.snapshot] };
    throw error;
  }
}
