'use client';

import type { ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useControlAria } from './Field';
import { controlClass } from './Input';

export type SelectProps = ComponentProps<'select'>;

/** Native <select> (best accessibility and mobile pickers) with the app's chrome. */
export function Select({ className, children, ...props }: SelectProps) {
  const aria = useControlAria(props);
  return (
    <div className="relative">
      <select {...props} {...aria} className={cn(controlClass, 'appearance-none pe-10', className)}>
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute inset-y-0 end-3 my-auto size-5 text-ink-2"
        aria-hidden="true"
      />
    </div>
  );
}
