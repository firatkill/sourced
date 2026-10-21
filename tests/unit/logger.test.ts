import { expect, it } from 'vitest';
import { createLogger, withRequest } from '@/lib/logger';

it('TC-009: FR-52 JSON logs include requestId and redact private fields', () => {
  let output = '';
  const logger = createLogger({
    write: (chunk: string) => {
      output += chunk;
    },
  }).child({ requestId: 'request-test' });
  logger.info(
    {
      question: 'PRIVATE_QUESTION',
      ip: 'PRIVATE_IP',
      apiKey: 'PRIVATE_KEY',
      context: { question: 'NESTED_QUESTION', apiKey: 'NESTED_KEY' },
      req: { headers: { authorization: 'PRIVATE_AUTH', cookie: 'PRIVATE_COOKIE' } },
    },
    'ask.received',
  );
  const entry: unknown = JSON.parse(output);
  expect(entry).toMatchObject({ requestId: 'request-test', app: 'sourced', msg: 'ask.received' });
  for (const value of [
    'PRIVATE_QUESTION',
    'PRIVATE_IP',
    'PRIVATE_KEY',
    'NESTED_QUESTION',
    'NESTED_KEY',
    'PRIVATE_AUTH',
    'PRIVATE_COOKIE',
  ])
    expect(output).not.toContain(value);
  expect(withRequest('child-test').bindings()).toMatchObject({ requestId: 'child-test' });
});
