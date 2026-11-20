// T-88 / R2 §6 (security 1–2): what the local app accepts before any route runs.
// The port is bound to 127.0.0.1; checking `Host` as well stops DNS rebinding, and
// a mutating request whose `Origin` names another host is refused.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

export type LocalDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: 'host' | 'origin' }
  | { kind: 'exchange' }
  | { kind: 'setup' };

function hostname(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

/** Extra hosts come from ALLOWED_ORIGINS (full origins, comma-separated). */
export function allowedHosts(allowedOrigins: string): Set<string> {
  const hosts = new Set<string>();
  for (const value of allowedOrigins.split(',')) {
    try {
      if (value.trim()) hosts.add(new URL(value.trim()).host);
    } catch {
      /* An invalid entry allows nothing. */
    }
  }
  return hosts;
}

const SETUP_FREE = ['/setup', '/api/setup', '/api/health', '/how-it-works'];
function setupFree(path: string): boolean {
  return (
    SETUP_FREE.some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) ||
    path.startsWith('/_next/') ||
    /\.[a-z0-9]+$/i.test(path)
  );
}

export function localDecision(input: {
  host: string | null;
  origin: string | null;
  method: string;
  path: string;
  hasToken: boolean;
  setupRequired: boolean;
  extraHosts: Set<string>;
}): LocalDecision {
  const host = input.host ?? '';
  const name = hostname(host);
  if (!name || (!LOOPBACK.has(name) && !input.extraHosts.has(host)))
    return { kind: 'deny', reason: 'host' };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(input.method) && input.origin !== null) {
    let originHost: string | null = null;
    try {
      originHost = new URL(input.origin).host;
    } catch {
      /* "null" and malformed origins never match. */
    }
    if (originHost !== host) return { kind: 'deny', reason: 'origin' };
  }
  if (input.method === 'GET' && input.path === '/setup' && input.hasToken)
    return { kind: 'exchange' };
  if (
    input.setupRequired &&
    input.method === 'GET' &&
    !input.path.startsWith('/api/') &&
    !setupFree(input.path)
  )
    return { kind: 'setup' };
  return { kind: 'allow' };
}
