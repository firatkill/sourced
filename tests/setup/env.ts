import { beforeAll } from 'vitest';

process.env.LLM_MODE = 'mock';
// D-138: tests that reload the shipped config rewrite the shared snapshot; keep it the
// hosted example's profile, as the suite's global setup generates it.
process.env.SOURCED_PROFILE ??= 'public-demo';
process.env.DATABASE_URL ||= 'postgres://sourced:sourced@localhost:5433/sourced';
process.env.IP_HASH_SALT ??= 'test-only-ip-salt-00000000000000000000000';
process.env.QUESTION_HASH_SALT ??= 'test-only-question-salt-0000000000000000';
process.env.NEXT_PUBLIC_SITE_URL ??= 'http://localhost:3000';

const originalFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
      return Promise.reject(new Error('Non-localhost fetch is forbidden in tests'));
    }
    return originalFetch(input, init);
  };
});
