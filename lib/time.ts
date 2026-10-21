export function utcDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
export function nextUtcMidnight(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
