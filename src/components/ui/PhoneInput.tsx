'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Input } from './Input';

export type PhoneInputProps = Omit<ComponentProps<typeof Input>, 'type' | 'inputMode' | 'dir'>;

/**
 * Phone numbers always read in LTR order, but sit at the start edge of an RTL form.
 * Accepts Persian / Arabic / Latin digits; the server normalises with normalizePhone().
 */
export function PhoneInput({ className, autoComplete = 'tel', ...props }: PhoneInputProps) {
  return (
    <Input
      type="tel"
      inputMode="tel"
      dir="ltr"
      autoComplete={autoComplete}
      spellCheck={false}
      autoCapitalize="off"
      className={cn('rtl:text-end', className)}
      {...props}
    />
  );
}
