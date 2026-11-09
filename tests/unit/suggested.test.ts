import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { SUGGESTED, SUGGESTED_IDS } from '@/lib/suggested';

it('TC-008 / UT-19: the six public questions match normative TRD §11.2', () => {
  expect(SUGGESTED.map(({ id }) => id)).toEqual(SUGGESTED_IDS);
  expect(SUGGESTED_IDS).toHaveLength(6);
  const trd = readFileSync('docs/TRD.md', 'utf8');
  for (const { id, question } of SUGGESTED) {
    expect(trd).toContain(`{ id: '${id}', question: '${question}' }`);
  }
});

it('TC-067 / UT-19 / FR-02: normalizes all six questions and rejects near misses', async () => {
  const { matchSuggested } = await import('@/lib/suggested');
  for (const { id, question } of SUGGESTED) {
    expect(matchSuggested(question)).toBe(id);
    expect(matchSuggested(`  ${question.toUpperCase().replaceAll(' ', '\n  ')}  `)).toBe(id);
    expect(matchSuggested(question.replace(/[?,.-]/g, ' '))).toBe(id);
    expect(matchSuggested(question + ' extra')).toBeNull();
    expect(matchSuggested(question.split(' ').slice(1).join(' '))).toBeNull();
  }
  expect(matchSuggested('')).toBeNull();
  expect(matchSuggested('What is PostgreSQL?')).toBeNull();
});
