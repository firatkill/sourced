import 'server-only';
import { getEnv } from '@/lib/env';
import { hmacSha256Hex } from '@/lib/hash';
import { utcDate } from '@/lib/time';

export function hashVisitor(headers: Headers, now = new Date()): string {
  const ip = (
    headers.get('x-real-ip')?.split(',')[0] ||
    headers.get('x-forwarded-for')?.split(',')[0] ||
    'unknown'
  )
    .trim()
    .toLowerCase()
    .replace(/%.*$/, '');
  return hmacSha256Hex(getEnv().IP_HASH_SALT, utcDate(now) + ':' + ip);
}
