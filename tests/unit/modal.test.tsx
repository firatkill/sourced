// @vitest-environment jsdom
// REDESIGN §3.1, §3.3: both modal surfaces trap Tab and restore their opener on Escape.
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '@/components/ask/Modal';

const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
beforeEach(() => {
  // jsdom has no layout or native modal implementation; exercise our key handling directly.
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({
    length: 1,
    item: () => new DOMRect(),
    [Symbol.iterator]: () => [new DOMRect()][Symbol.iterator](),
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const [name, descriptor] of [
    ['showModal', originalShow],
    ['close', originalClose],
  ] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

function Harness({ label, empty = false }: { label: string; empty?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
        }}
      >
        Open
      </button>
      {open && (
        <Modal
          label={label}
          className=""
          onClose={() => {
            setOpen(false);
          }}
        >
          {!empty && (
            <>
              <button disabled>Disabled first</button>
              <button>First</button>
              <a href="#middle">Middle</a>
              <button>Last</button>
              <button hidden>Hidden last</button>
              <button tabIndex={-1}>Programmatic only</button>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

for (const label of ['Source viewer', 'Main menu']) {
  describe(label, () => {
    it('wraps Tab last-to-first and Shift+Tab first-to-last, skipping unavailable controls', () => {
      render(<Harness label={label} />);
      fireEvent.click(screen.getByRole('button', { name: 'Open' }));
      const first = screen.getByRole('button', { name: 'First' });
      const last = screen.getByRole('button', { name: 'Last' });
      last.focus();
      expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(false);
      expect(document.activeElement).toBe(first);
      expect(fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })).toBe(false);
      expect(document.activeElement).toBe(last);
      const middle = screen.getByRole('link', { name: 'Middle' });
      middle.focus();
      expect(fireEvent.keyDown(middle, { key: 'Tab' })).toBe(true);
      expect(fireEvent.keyDown(middle, { key: 'Tab', shiftKey: true })).toBe(true);
    });
    it('handles initial dialog focus in both directions and preserves cancel/return-to-opener', () => {
      render(<Harness label={label} />);
      const opener = screen.getByRole('button', { name: 'Open' });
      opener.focus();
      fireEvent.click(opener);
      const dialog = screen.getByRole('dialog', { name: label });
      dialog.focus();
      fireEvent.keyDown(dialog, { key: 'Tab' });
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }));
      dialog.focus();
      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Last' }));
      // Browsers dispatch cancel on Escape; jsdom does not synthesize that default action.
      fireEvent(dialog, new Event('cancel', { cancelable: true }));
      expect(screen.queryByRole('dialog', { name: label })).toBeNull();
      expect(document.activeElement).toBe(opener);
    });
  });
}
it('keeps focus on the dialog when no controls are available', () => {
  render(<Harness label="Empty dialog" empty />);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  const dialog = screen.getByRole('dialog');
  dialog.focus();
  for (const shiftKey of [false, true]) {
    expect(fireEvent.keyDown(dialog, { key: 'Tab', shiftKey })).toBe(false);
    expect(document.activeElement).toBe(dialog);
  }
});
