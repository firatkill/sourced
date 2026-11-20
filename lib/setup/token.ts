// T-88 / R2 §6: the one-time setup link. The token lives in `.sourced/setup-token`
// (mode 0600), not in `.env.local`, so `./sourced setup` can issue a new link while
// the app keeps running. The browser exchanges it for an HttpOnly cookie that holds
// only the token's hash; a new token signs every earlier cookie out.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const SETUP_COOKIE = 'sourced_setup';
export const SETUP_TOKEN_FILE = '.sourced/setup-token';
/** 30 days: setup and Settings stay signed in across browser restarts. */
export const SETUP_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const TOKEN = /^[0-9a-f]{48}$/;

export function readSetupToken(root = process.cwd()): string | null {
  try {
    const token = readFileSync(path.join(root, SETUP_TOKEN_FILE), 'utf8').trim();
    return TOKEN.test(token) ? token : null;
  } catch {
    return null;
  }
}

/** Writes a new token atomically; `rotate: false` keeps a valid existing one. */
export function issueSetupToken(root = process.cwd(), rotate = true): string {
  const existing = rotate ? null : readSetupToken(root);
  if (existing) return existing;
  const token = randomBytes(24).toString('hex');
  const file = path.join(root, SETUP_TOKEN_FILE);
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${String(process.pid)}.tmp`;
  writeFileSync(temporary, `${token}\n`, { mode: 0o600 });
  renameSync(temporary, file);
  return token;
}

export function setupCookieValue(token: string): string {
  return createHash('sha256').update(`sourced-setup:${token}`).digest('hex');
}

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function validSetupToken(candidate: string | null | undefined, root?: string): boolean {
  const token = readSetupToken(root);
  return Boolean(token && candidate && same(candidate, token));
}

export function validSetupCookie(value: string | null | undefined, root?: string): boolean {
  const token = readSetupToken(root);
  return Boolean(token && value && same(value, setupCookieValue(token)));
}

export function setupUrl(port: number | string, token: string): string {
  return `http://localhost:${String(port)}/setup?token=${token}`;
}
