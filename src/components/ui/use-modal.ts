'use client';

import { useEffect, useRef, type MouseEvent, type SyntheticEvent } from 'react';
import { pushModal, removeModal } from './modal-stack';

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
 * A native modal dialog keeps focus away from the page but lets Tab escape to the browser chrome;
 * wrap it so the dialog is a real focus trap. Attached natively (not as a React prop) so it also
 * sees keys pressed inside things portalled into the dialog, like the toast region.
 */
function trapTab(e: globalThis.KeyboardEvent) {
  if (e.key !== 'Tab') return;
  const dialog = e.currentTarget as HTMLDialogElement;
  const nodes = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    // rendered = has a box (offsetParent is null for position:fixed, e.g. the toast's dismiss button)
    (el) => el.getClientRects().length > 0 || el === document.activeElement,
  );
  if (nodes.length === 0) {
    e.preventDefault();
    return;
  }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !dialog.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Drives a native <dialog> as a modal. The browser supplies the focus trap, inert background,
 * Esc handling and focus restoration; this hook adds controlled open state, backdrop click and
 * scroll locking.
 */
export function useModalDialog(open: boolean, onOpenChange: (open: boolean) => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);
  // How many native `close` events are still on their way because the effect cleanup (not the
  // user) closed the dialog. A native `close` event is queued as a task, so it arrives AFTER React
  // Strict Mode has already re-run the effect and re-opened the dialog; without this the stale
  // event would call onOpenChange(false) and a sheet that mounts open would close itself in dev.
  const closeFromCleanup = useRef(0);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // Remember what had focus: dialog.close() hands focus back by itself, but not when the whole
      // dialog is unmounted with its parent (it is already detached by the time this cleanup runs).
      const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      lockScroll();
      pushModal(dialog);
      dialog.addEventListener('keydown', trapTab);
      return () => {
        dialog.removeEventListener('keydown', trapTab);
        removeModal(dialog);
        // unmounted, or closed by the parent (open -> false): the parent already knows
        if (dialog.open) {
          closeFromCleanup.current += 1;
          dialog.close(); // also hands focus back to whatever opened the dialog
        }
        unlockScroll();
        const focus = document.activeElement;
        if (opener?.isConnected && (!focus || focus === document.body || dialog.contains(focus))) {
          opener.focus({ preventScroll: true });
        }
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
    // Native close (e.g. <form method="dialog">) while still "open" in React. Closes that our own
    // effect cleanup caused are not user intent: skip them (see closeFromCleanup).
    onClose: () => {
      if (closeFromCleanup.current > 0) {
        closeFromCleanup.current -= 1;
        return;
      }
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
