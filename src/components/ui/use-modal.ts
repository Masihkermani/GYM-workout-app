'use client';

import { useEffect, useRef, type MouseEvent, type SyntheticEvent } from 'react';

let lockCount = 0;

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
