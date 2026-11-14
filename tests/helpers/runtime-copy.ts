import example from '@/sourced.config';
import { getCopy } from '@/lib/kit/copy';
import { KitConfigSchema } from '@/lib/kit/config-schema';
import { ASK_COPY as defaults } from '@/lib/copy';
export const CORPUS_COPY = getCopy(KitConfigSchema.parse(example));
export const ASK_COPY = { ...defaults, ...CORPUS_COPY };
