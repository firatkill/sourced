// @vitest-environment jsdom
// D-153: after "Reset the library" the app stays open; asking waits for documents.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AskApp } from '@/components/ask/AskApp';
import { ASK_COPY } from '../helpers/runtime-copy';
import { SUGGESTED } from '@/lib/suggested';

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('an empty library shows the Add documents banner and turns asking off', () => {
  render(
    <AskApp
      demoMode="on"
      publicDemo={false}
      emptyLibrary
      example={{ notice: 'This is the example.' }}
      limits={{ ipDaily: 3, globalDaily: 300 }}
      suggested={SUGGESTED}
      copy={ASK_COPY}
    />,
  );
  const banner = screen.getByRole('complementary', { name: 'Library' });
  expect(banner.textContent).toContain('Your library is empty');
  expect(screen.getByRole('link', { name: 'Add documents' }).getAttribute('href')).toBe(
    '/settings/library',
  );
  const box = screen.getByRole('textbox', { name: 'Your question' });
  expect(box.getAttribute('placeholder')).toBe('Add documents to start asking');
  expect((box as HTMLTextAreaElement).disabled).toBe(true);
  // Neither the example banner nor suggested questions offer to ask.
  expect(screen.queryByText('This is the example.')).toBeNull();
  expect(screen.queryByText(SUGGESTED[0]?.question ?? '')).toBeNull();
});
