import { expect, test } from 'vitest';
import { requireLocalDatabase } from '../helpers/local-database';

test('TC-014: TRD §23.2/23.4 refuse non-local test databases before connecting', () => {
  for (const url of [
    undefined,
    'postgres://example.com/sourced',
    'postgres://localhost.example.com/sourced',
  ]) {
    expect(() => requireLocalDatabase(url)).toThrow(
      'Test database must use localhost or 127.0.0.1',
    );
  }
  for (const host of ['localhost', '127.0.0.1']) {
    const url = `postgres://${host}:5433/sourced_test`;
    expect(requireLocalDatabase(url)).toBe(url);
  }
});
