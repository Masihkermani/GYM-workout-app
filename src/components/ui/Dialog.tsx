'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useModalDialog } from './use-modal';

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Action buttons, laid out at the inline-end. Put the primary action first in DOM order. */
  actions?: ReactNode;
  /** `alertdialog` for confirmations that interrupt (delete, cancel booking). */
  role?: 'dialog' | 'alertdialog';
  className?: string;
}

/** Centered modal on a native <dialog>: focus trap, Esc, inert background, focus restored on close. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  actions,
  role = 'dialog',
  className,
}: DialogProps) {
  const titleId = useId();
  const descId = useId();
  const modal = useModalDialog(open, onOpenChange);

  return (
    <dialog
      {...modal}
      role={role}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className="modal items-center justify-center p-4"
    >
      {open ? (
        <div
          className={cn(
            'dialog-panel w-full max-w-md border-[1.5px] border-rule-strong bg-card p-6 text-ink',
            className,
          )}
        >
          <h2 id={titleId} className="text-xl">
            {title}
          </h2>
          {description ? (
            <p id={descId} className="mt-2 text-base text-ink-2">
              {description}
            </p>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
          {actions ? <div className="mt-6 flex flex-wrap justify-end gap-3">{actions}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}
