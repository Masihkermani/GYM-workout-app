'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { useControlAria } from './Field';

/** Shared look for text-like controls. 44px minimum height; boundary is ink-3 (>= 3:1 on paper). */
export const controlClass =
  'block w-full min-h-11 rounded-[var(--r)] border-[1.5px] border-ink-3 bg-card px-3 text-base text-ink ' +
  'placeholder:text-ink-3 tx hover:border-ink-2 focus:border-ink ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger';

export type InputProps = ComponentProps<'input'>;

export function Input({ className, type = 'text', ...props }: InputProps) {
  const aria = useControlAria(props);
  return <input type={type} {...props} {...aria} className={cn(controlClass, className)} />;
}
