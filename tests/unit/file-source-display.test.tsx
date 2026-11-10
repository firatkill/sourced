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

test.each(['manual/olcum.html', 'manual/guide.docx'])(
  'T-53 / TC-201 / FR-67 / TRD §33.1: %s citation viewer shows path and quote without an external link',
  (filePath) => {
    const file = PassageDto.parse({ ...passage, officialUrl: null, filePath });
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
    expect(screen.getByText(`${filePath} › ${file.headingPath.join(' › ')}`)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('mark')).not.toBeNull();
    const copied = formatCopy(citations, [file]);
    expect(copied).toContain(filePath);
    expect(copied).not.toContain('file://');
    expect(copied).not.toContain('null');
  },
);

test('T-53 / FR-65: related file passages display path and heading without a link', () => {
  render(<NotFound passages={[file]} onAnother={vi.fn()} />);
  expect(screen.getByText(`manual/olcum.html › ${file.headingPath.join(' › ')}`)).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
});

test('TC-200 / FR-67 / D-102: PDF viewer, related reading and copied citations show path and page without links', () => {
  const pdf = PassageDto.parse({ ...file, filePath: 'manual/guide.pdf', pageFrom: 2, pageTo: 4 });
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const viewer = render(
    <SourceViewer
      passages={[pdf]}
      citations={citations}
      label={pdf.label}
      onSelect={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.getByText('manual/guide.pdf, page 2')).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
  viewer.unmount();
  render(<NotFound passages={[pdf]} onAnother={vi.fn()} />);
  expect(screen.getByText('manual/guide.pdf, page 2')).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
  expect(formatCopy(citations, [pdf])).toContain('manual/guide.pdf, page 2');
});
