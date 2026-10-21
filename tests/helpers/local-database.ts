export function requireLocalDatabase(url: string | undefined): string {
  if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
    throw new Error('Test database must use localhost or 127.0.0.1');
  }
  return url;
}
