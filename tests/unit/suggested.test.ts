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
