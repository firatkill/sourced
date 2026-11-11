// @vitest-environment jsdom
// TC-239 / PRD §9.9: form semantics, exact copy and error states.
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AccessForm } from '@/components/access/AccessForm';
import { ACCESS_COPY } from '@/lib/copy';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
for (const [code, message] of [
  ['ACCESS_DENIED', ACCESS_COPY.error],
  ['RATE_LIMITED_IP', ACCESS_COPY.limited],
])
  test(`TC-239: accessible form renders ${String(code)} state`, async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code, message, requestId: '00000000-0000-4000-8000-000000000000' } },
            { status: code === 'ACCESS_DENIED' ? 401 : 429 },
          ),
        ),
    );
    render(<AccessForm />);
    const input = screen.getByLabelText('Access token');
    expect(input.getAttribute('type')).toBe('password');
    expect(input.className).toContain('focus-visible:');
    fireEvent.change(input, { target: { value: 'wrong' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(message);
    });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('access-error');
  });
