'use client';

import { useSyncExternalStore } from 'react';

/**
 * The modal <dialog>s that are open right now, oldest first. A modal dialog lives in the browser's
 * top layer and makes the rest of the page inert, so anything that must stay visible and announced
 * above it (the toast region) has to be rendered INSIDE the topmost dialog. useModalDialog
 * registers and unregisters here; the Toast provider subscribes.
 */
let stack: readonly HTMLDialogElement[] = [];
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

export function pushModal(dialog: HTMLDialogElement) {
  stack = [...stack.filter((d) => d !== dialog), dialog];
  emit();
}

export function removeModal(dialog: HTMLDialogElement) {
  if (!stack.includes(dialog)) return;
  stack = stack.filter((d) => d !== dialog);
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const top = () => stack[stack.length - 1] ?? null;

/** The topmost open modal dialog, or null (always null on the server and during hydration). */
export function useTopModal(): HTMLDialogElement | null {
  return useSyncExternalStore(subscribe, top, () => null);
}
