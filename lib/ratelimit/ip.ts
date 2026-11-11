import 'server-only';
import { createHmac } from 'node:crypto';
import { getEnv } from '@/lib/env';
import { hmacSha256Hex } from '@/lib/hash';
import { utcDate } from '@/lib/time';

export function hashVisitor(headers: Headers, now = new Date(), accessToken?: string): string {
  const ip = (
    headers.get('x-real-ip')?.split(',')[0] ||
    headers.get('x-forwarded-for')?.split(',')[0] ||
    'unknown'
  )
    .trim()
    .toLowerCase()
    .replace(/%.*$/, '');
  const message = utcDate(now) + ':' + ip;
  if (accessToken !== undefined) {
    const key = createHmac('sha256', accessToken).update('sourced-visitor-v1').digest();
    return createHmac('sha256', key).update(message).digest('hex');
  }
  return hmacSha256Hex(getEnv().IP_HASH_SALT, message);
}
