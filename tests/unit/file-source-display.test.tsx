// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { SourceViewer } from '@/components/ask/SourceViewer';
import { NotFound } from '@/components/ask/states/NotFound';
import { formatCopy } from '@/lib/copy-format';
import { PassageDto } from '@/lib/sse/events';
import { passage, citations } from '../fixtures/sse-streams';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const file = PassageDto.parse({ ...passage, officialUrl: null, filePath: 'manual/olcum.html' });

test('T-53 / FR-65 / TRD §33.1: file citation viewer shows path and quote without an external link', () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  render(
    <SourceViewer
      passages={[file]}
      citations={citations}
      label={file.label}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText(`manual/olcum.html › ${file.headingPath.join(' › ')}`)).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
  expect(document.querySelector('mark')).not.toBeNull();
  const copied = formatCopy(citations, [file]);
  expect(copied).toContain('manual/olcum.html');
  expect(copied).not.toContain('file://');
  expect(copied).not.toContain('null');
});

test('T-53 / FR-65: related file passages display path and heading without a link', () => {
  render(<NotFound passages={[file]} onAnother={vi.fn()} />);
  expect(screen.getByText(`manual/olcum.html › ${file.headingPath.join(' › ')}`)).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
});
