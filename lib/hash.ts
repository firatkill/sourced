import { createHash, createHmac } from 'node:crypto';
export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
export function hmacSha256Hex(salt: string, value: string): string {
  return createHmac('sha256', salt).update(value).digest('hex');
}
