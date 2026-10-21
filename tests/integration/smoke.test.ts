import { expect, test } from 'vitest';
import { getSql } from '@/lib/db/client';

test('TC-014: T-05 integration smoke uses the isolated test database', async () => {
  const [row] = await getSql()<
    { value: number; name: string }[]
  >`SELECT 1 AS value, current_database() AS name`;
  expect(row?.value).toBe(1);
  expect(row?.name).toBe(new URL(process.env.TEST_DATABASE_URL!).pathname.slice(1));
});
