import 'server-only';

export const ACCESS_COOKIE = 'sourced_access';
const encoder = new TextEncoder();
async function key(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
export async function deriveCookie(token: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await key(token),
    encoder.encode('sourced-access-v1'),
  );
  return Buffer.from(signature).toString('base64url');
}
/** Native HMAC verification compares fixed-size signatures in constant time. */
export async function constantTimeEqual(expected: string, actual: string): Promise<boolean> {
  const comparisonKey = await key('sourced-constant-time-comparison-v1');
  const signature = await crypto.subtle.sign('HMAC', comparisonKey, encoder.encode(expected));
  return crypto.subtle.verify('HMAC', comparisonKey, signature, encoder.encode(actual));
}
export async function validCookie(token: string | undefined, cookie: string | undefined) {
  if (!token || token.length < 24 || !cookie) return false;
  return constantTimeEqual(await deriveCookie(token), cookie);
}
