import { expect } from 'vitest';

// Only DB-backed contracts may reset the integration database. Normalizing the
// separator also keeps this boundary explicit on Windows.
const file = expect.getState().testPath?.replaceAll('\\', '/');
if (!file) throw new Error('Contract test path is unavailable; refusing to run without setup.');
if (file.includes('/tests/contract/database/')) {
  await import('./integration-setup');
}
