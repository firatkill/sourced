import 'server-only';
import { z } from 'zod';
import { getSql } from '@/lib/db/client';
import { getCopy } from './copy';
import { getKitConfig } from './runtime-config';

/** Counts are runtime metadata, never guessed from a source's URL list. */
export async function getPageCopy() {
  const config = getKitConfig();
  const copy = getCopy(config);
  if (![copy.notFoundBody, copy.searched].some((text) => text.includes('{documentCount}')))
    return copy;
  const rows = await getSql()`SELECT documents_total FROM corpus_meta WHERE id = 1`;
  // A reset library has no corpus_meta row yet (D-153): that is zero documents, not an error.
  const row = z
    .object({ documents_total: z.number().int().nonnegative() })
    .optional()
    .parse(rows[0]);
  return getCopy(config, row?.documents_total ?? 0);
}

export function getRuntimeCopy() {
  return getCopy(getKitConfig());
}
