import { createHash } from 'node:crypto';
import type { TestInfo } from '@playwright/test';

export function uniqueIp(testInfo: TestInfo): string {
  const bytes = createHash('sha256')
    .update(`${testInfo.testId}:${String(testInfo.retry)}`)
    .digest();
  return `10.${String(bytes[0])}.${String(bytes[1])}.${String(bytes[2])}`;
}
