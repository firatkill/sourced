import 'server-only';
export function accessDecision(input: {
  profile: 'local' | 'private' | 'public-demo';
  path: string;
  method: string;
  validCookie: boolean;
}): 'allow' | 'redirect' | 'deny' {
  if (input.profile !== 'private' || input.validCookie) return 'allow';
  if (
    ['/access', '/api/access', '/api/health', '/favicon.svg', '/robots.txt'].includes(input.path) ||
    input.path.startsWith('/_next/')
  )
    return 'allow';
  return input.path.startsWith('/api/') ? 'deny' : 'redirect';
}
