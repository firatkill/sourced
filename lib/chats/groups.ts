/** REDESIGN-v2 §7: sidebar day groups. Pure; `local` picks the browser's or UTC calendar days. */
export type DayGroup = 'Pinned' | 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';
export const DAY_GROUPS: DayGroup[] = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Older'];

function dayNumber(date: Date, local: boolean): number {
  const [y, m, d] = local
    ? [date.getFullYear(), date.getMonth(), date.getDate()]
    : [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()];
  return Math.floor(Date.UTC(y, m, d) / 86_400_000);
}

export function dayGroup(iso: string, now: Date, local: boolean): Exclude<DayGroup, 'Pinned'> {
  const days = dayNumber(now, local) - dayNumber(new Date(iso), local);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days <= 7) return 'Previous 7 days';
  return 'Older';
}

export function groupChats<T extends { pinned: boolean; updatedAt: string }>(
  chats: readonly T[],
  now: Date,
  local: boolean,
): { group: DayGroup; chats: T[] }[] {
  const buckets = new Map<DayGroup, T[]>();
  for (const chat of chats) {
    const group = chat.pinned ? 'Pinned' : dayGroup(chat.updatedAt, now, local);
    buckets.set(group, [...(buckets.get(group) ?? []), chat]);
  }
  return DAY_GROUPS.filter((group) => buckets.has(group)).map((group) => ({
    group,
    chats: buckets.get(group) ?? [],
  }));
}
