// REDESIGN §3–§4, §7: chat turns retain the existing state and accessibility contracts.
import { expect, test } from '@playwright/test';
import { openAsk, cachedAnswer } from './helpers/ask';

test('TC-102: E2E-13 readonly banner disables live input but allows cached answers', async ({
  page,
}, info) => {
  await openAsk(page, info, 3101);
  await expect(page.getByRole('status').filter({ hasText: 'Live answers are paused.' })).toHaveText(
    'Live answers are paused. The six suggested questions below were answered in advance and still work.',
  );
  const input = page.getByRole('textbox', { name: 'Your question' });
  await expect(input).toBeDisabled();
  await expect(input).toHaveAttribute('placeholder', 'Live answers are paused');
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled();
  await cachedAnswer(page);
});
