'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastOptions {
  message: ReactNode;
  tone?: ToastTone;
  /** ms before it dismisses itself (default 4500; errors stay 7000). */
  duration?: number;
}

interface ToastItem extends Required<Pick<ToastOptions, 'tone'>> {
  id: number;
  message: ReactNode;
  duration: number;
}

const ToastContext = createContext<{ toast: (options: ToastOptions) => void } | null>(null);

/** `const { toast } = useToast(); toast({ message: 'Saved', tone: 'success' })` */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const ICON = { info: Info, success: CircleCheck, error: CircleAlert } as const;
const BORDER = { info: 'border-s-plate-blue', success: 'border-s-plate-green', error: 'border-s-danger' } as const;

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const t = useTranslations('common');
  const [paused, setPaused] = useState(false);
  const Icon = ICON[item.tone];

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [paused, item.id, item.duration, onDismiss]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'toast-in pointer-events-auto flex w-full max-w-md items-start gap-3 border-[1.5px] border-s-4 border-rule-strong bg-card py-2 ps-4 pe-1 text-ink',
        BORDER[item.tone],
      )}
    >
      <Icon className={cn('mt-3 size-5 shrink-0', item.tone === 'error' && 'text-danger')} aria-hidden="true" />
      <div className="min-w-0 flex-1 py-2.5 text-sm font-medium">{item.message}</div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label={t('toast.dismiss')}
        className="flex size-11 shrink-0 items-center justify-center rounded-[var(--r)] text-ink-2 tx hover:bg-paper-2 hover:text-ink"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Transient confirmations ("Saved"). Mount once near the root; the region sits above the mobile tab bar. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((i) => i.id !== id)), []);
  const toast = useCallback((options: ToastOptions) => {
    const tone = options.tone ?? 'info';
    const duration = options.duration ?? (tone === 'error' ? 7000 : 4500);
    setItems((all) => [...all.slice(-3), { id: nextId.current++, message: options.message, tone, duration }]);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label={t('toast.region')}
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[var(--bottom-bar)] z-[60] flex flex-col items-center gap-2 p-4"
      >
        {items.map((item) => (
          <ToastView key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
