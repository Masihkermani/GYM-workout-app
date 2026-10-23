'use client';

import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type SyntheticEvent } from 'react';

let lockCount = 0;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function lockScroll() {
  lockCount += 1;
  document.documentElement.classList.add('modal-open');
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.documentElement.classList.remove('modal-open');
}

/**
 * Drives a native <dialog> as a modal. The browser supplies the focus trap, inert background,
 * Esc handling and focus restoration; this hook adds controlled open state, backdrop click and
 * scroll locking.
 */
export function useModalDialog(open: boolean, onOpenChange: (open: boolean) => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      lockScroll();
      return () => {
        // unmounted or closed by the parent
        if (dialog.open) dialog.close();
        unlockScroll();
      };
    }
    return undefined;
  }, [open]);

  return {
    ref,
    // A native modal dialog keeps focus away from the page but lets Tab escape to the browser chrome;
    // wrap it so the dialog is a real focus trap.
    onKeyDown: (e: KeyboardEvent<HTMLDialogElement>) => {
      if (e.key !== 'Tab') return;
      const nodes = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (nodes.length === 0) {
        e.preventDefault();
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !e.currentTarget.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !e.currentTarget.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    },
    // Esc: keep React in charge of the state.
    onCancel: (e: SyntheticEvent<HTMLDialogElement>) => {
      e.preventDefault();
      onOpenChange(false);
    },
    // Native close (e.g. <form method="dialog">) while still "open" in React.
    onClose: () => {
      if (open) onOpenChange(false);
    },
    // Close only when both press and release happen on the backdrop (not after a drag from the panel).
    onMouseDown: (e: MouseEvent<HTMLDialogElement>) => {
      pressedOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent<HTMLDialogElement>) => {
      if (pressedOnBackdrop.current && e.target === e.currentTarget) onOpenChange(false);
      pressedOnBackdrop.current = false;
    },
  };
}
