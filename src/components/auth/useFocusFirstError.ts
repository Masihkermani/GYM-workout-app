'use client';

import { useEffect, useRef } from 'react';

/** After a failed submit, move focus to the first invalid field so keyboard and screen-reader users land on it. */
export function useFocusFirstError<T extends HTMLElement>(state: unknown) {
  const ref = useRef<T>(null);
  const seen = useRef(state);
  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  return ref;
}
