'use client';

import { useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { useModalDialog } from './use-modal';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Sticky footer (actions). */
  footer?: ReactNode;
  className?: string;
}

/**
 * Bottom sheet on mobile, side panel (at the inline-end edge, so left in RTL) from md.
 * Built on a native modal <dialog>: focus is trapped, Esc closes, the page behind is inert.
 */
export function Sheet({ open, onOpenChange, title, description, children, footer, className }: SheetProps) {
  const t = useTranslations('common');
  const titleId = useId();
  const descId = useId();
  const modal = useModalDialog(open, onOpenChange);

  return (
    <dialog
      {...modal}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className="modal items-end md:items-stretch md:justify-end"
    >
      {open ? (
        <div
          className={cn(
            'sheet-panel flex max-h-[88dvh] w-full flex-col border-t-[1.5px] border-rule-strong bg-card text-ink',
            'md:max-h-none md:w-[26rem] md:border-s-[1.5px] md:border-t-0',
            className,
          )}
        >
          <header className="flex items-start justify-between gap-4 border-b border-rule px-4 py-3 md:px-6">
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl">
                {title}
              </h2>
              {description ? (
                <p id={descId} className="mt-1 text-sm text-ink-2">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label={t('actions.close')}
              className="-me-2 flex size-11 shrink-0 items-center justify-center rounded-[var(--r)] text-ink tx hover:bg-paper-2"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">{children}</div>
          {footer ? (
            <footer className="border-t border-rule px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
              {footer}
            </footer>
          ) : (
            <div className="pb-[env(safe-area-inset-bottom)]" />
          )}
        </div>
      ) : null}
    </dialog>
  );
}
