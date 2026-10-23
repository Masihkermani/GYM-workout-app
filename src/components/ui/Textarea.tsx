'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { useControlAria } from './Field';
import { controlClass } from './Input';

export type TextareaProps = ComponentProps<'textarea'>;

export function Textarea({ className, rows = 4, ...props }: TextareaProps) {
  const aria = useControlAria(props);
  return <textarea rows={rows} {...props} {...aria} className={cn(controlClass, 'min-h-28 resize-y py-2', className)} />;
}
