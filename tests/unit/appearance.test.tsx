// @vitest-environment jsdom
// T-79 / D-142: real radios, browser-only state, SSR hydration and unavailable storage.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ThemePicker } from '@/components/settings/ThemePicker';
import { TextSize } from '@/components/settings/TextSize';
import { THEME_SCRIPT } from '@/lib/theme';
import { runInNewContext } from 'node:vm';

function Controls() {
  return (
    <>
      <ThemePicker />
      <TextSize />
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.textSize;
});
it('applies and saves all choices using real radio inputs', async () => {
  render(<Controls />);
  expect(screen.getAllByRole('radio')).toHaveLength(9);
  for (const [label, value] of [
    ['Graphite', 'graphite'],
    ['Paper', 'paper'],
    ['Midnight', 'midnight'],
    ['Linen', 'linen'],
    ['High contrast', 'contrast'],
    ['Match my system', 'system'],
  ]) {
    const radio = screen.getByRole<HTMLInputElement>('radio', { name: new RegExp(`^${label!}`) });
    fireEvent.click(radio);
    await waitFor(() => {
      expect(radio.checked).toBe(true);
    });
    expect(document.documentElement.dataset.theme).toBe(value === 'system' ? undefined : value);
    expect(localStorage.getItem('sourced-theme')).toBe(value);
  }
  for (const [label, value] of [
    ['Small', 'small'],
    ['Large', 'large'],
    ['Default', 'default'],
  ]) {
    const radio = screen.getByRole<HTMLInputElement>('radio', { name: label! });
    fireEvent.click(radio);
    await waitFor(() => {
      expect(radio.checked).toBe(true);
    });
    expect(document.documentElement.dataset.textSize).toBe(value === 'default' ? undefined : value);
    expect(localStorage.getItem('sourced-text-size')).toBe(value);
  }
});
it('remains usable when accessing localStorage throws', async () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new Error('Storage blocked');
  });
  render(<Controls />);
  fireEvent.click(screen.getByRole('radio', { name: /^Midnight/ }));
  fireEvent.click(screen.getByRole('radio', { name: 'Large' }));
  await waitFor(() => {
    expect(screen.getByRole<HTMLInputElement>('radio', { name: /^Midnight/ }).checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Large' }).checked).toBe(true);
  });
  expect(document.documentElement.dataset).toMatchObject({ theme: 'midnight', textSize: 'large' });
});
it('hydrates server defaults against stored preferences without warnings', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const container = document.createElement('div');
  container.innerHTML = renderToString(<Controls />);
  document.body.append(container);
  localStorage.setItem('sourced-theme', 'dark');
  localStorage.setItem('sourced-text-size', 'large');
  runInNewContext(THEME_SCRIPT, { document, localStorage });
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => {
    await Promise.resolve();
    root = hydrateRoot(container, <Controls />);
  });
  expect(container.querySelector<HTMLInputElement>('input[value="graphite"]')?.checked).toBe(true);
  expect(container.querySelector<HTMLInputElement>('input[value="large"]')?.checked).toBe(true);
  expect(error).not.toHaveBeenCalled();
  await act(async () => {
    await Promise.resolve();
    root?.unmount();
  });
  container.remove();
});
