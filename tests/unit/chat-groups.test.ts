// T-83 / REDESIGN-v2 §7: sidebar day groups.
import { expect, test } from 'vitest';
import { dayGroup, groupChats } from '@/lib/chats/groups';

const now = new Date('2026-11-20T10:00:00Z');

test('UTC day groups', () => {
  expect(dayGroup('2026-11-20T00:01:00Z', now, false)).toBe('Today');
  expect(dayGroup('2026-11-19T23:59:00Z', now, false)).toBe('Yesterday');
  expect(dayGroup('2026-11-13T12:00:00Z', now, false)).toBe('Previous 7 days');
  expect(dayGroup('2026-11-12T12:00:00Z', now, false)).toBe('Older');
  expect(dayGroup('2026-11-21T08:00:00Z', now, false)).toBe('Today'); // clock skew
});

test('pinned first, then groups in order, keeping input order inside a group', () => {
  const chats = [
    { id: 'a', pinned: false, updatedAt: '2026-11-20T09:00:00Z' },
    { id: 'b', pinned: false, updatedAt: '2026-11-01T09:00:00Z' },
    { id: 'c', pinned: true, updatedAt: '2026-10-01T09:00:00Z' },
    { id: 'd', pinned: false, updatedAt: '2026-11-20T08:00:00Z' },
    { id: 'e', pinned: false, updatedAt: '2026-11-19T08:00:00Z' },
  ];
  expect(
    groupChats(chats, now, false).map(({ group, chats: list }) => [group, list.map((c) => c.id)]),
  ).toEqual([
    ['Pinned', ['c']],
    ['Today', ['a', 'd']],
    ['Yesterday', ['e']],
    ['Older', ['b']],
  ]);
});
