'use client';

import { useActionState, useTransition, type FormEvent } from 'react';

/**
 * `useActionState` without React 19's automatic form reset. A plain `<form action={fn}>` empties
 * uncontrolled fields after every submit, which would throw away what the coach typed whenever a
 * field fails validation. Here the submit is intercepted and the action runs inside a transition,
 * so the DOM keeps its values and `pending` still tracks the request.
 */
export function useManualForm<S>(action: (prev: Awaited<S>, formData: FormData) => Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const [, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };

  return { state, pending, onSubmit };
}
