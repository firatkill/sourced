'use client';

import { useEffect, useRef, type ReactNode } from 'react';

// Native dialogs make the page inert; explicit Tab wrapping keeps focus inside the dialog.
export function Modal({
  label,
  children,
  onClose,
  className,
}: {
  label: string;
  children: ReactNode;
  onClose: () => void;
  className: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const dialog = event.currentTarget;
        const controls = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'a[href], button, input, select, textarea, summary, [tabindex]',
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(':disabled, input[type="hidden"]') &&
            !element.closest('[hidden], [inert]') &&
            element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility !== 'hidden',
        );
        const first = controls[0];
        const last = controls.at(-1);
        const active = document.activeElement;
        if (!first || !last) {
          event.preventDefault();
          dialog.focus();
        } else if (
          !controls.some((element) => element === active) ||
          (event.shiftKey ? active === first : active === last)
        ) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }}
      className={className}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
