'use client';

import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from './Button';

/** Submit button that shows its loading state while the parent <form action> is pending. */
export function SubmitButton({ loading, ...props }: Omit<ButtonProps, 'type'>) {
  const { pending } = useFormStatus();
  return <Button type="submit" loading={loading || pending} {...props} />;
}
