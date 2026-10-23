'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { formatClock } from './clock';
import { useNow } from './use-now';

export interface RestState {
  /** Epoch ms when the rest ends. */
  endsAt: number;
  /** Seconds the rest started with (grows by 30 per "+30 s"); drives the progress bar. */
  totalSec: number;
}

/**
 * Rest countdown that never blocks logging. It follows the wall clock (not a decrementing counter),
 * so a throttled background tab or a locked phone still shows the right time. Announces only the
 * end ("Rest is over"), not every tick.
 */
export function RestTimer({
  rest,
  locale,
  onSkip,
  onAdd,
  onFinished,
}: {
  rest: RestState;
  locale: string;
  onSkip: () => void;
  onAdd: () => void;
  onFinished: () => void;
}) {
  const t = useTranslations('training');
  const now = useNow(true, 250);
  const remainingMs = rest.endsAt - now;
  const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
  const over = remainingMs <= 0;
  const notified = useRef(false);

  useEffect(() => {
    if (over && !notified.current) {
      notified.current = true;
      try {
        navigator.vibrate?.([140, 80, 140]);
      } catch {
        /* vibration is a nicety */
      }
      onFinished();
    }
    if (!over) notified.current = false;
  }, [over, onFinished]);

  const fraction = over ? 0 : Math.min(1, Math.max(0, remainingMs / (rest.totalSec * 1000)));

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-ink-2">{over ? t('rest.over') : t('rest.label')}</span>
          <span role="timer" aria-label={t('rest.remaining')} className="num text-2xl leading-none text-ink">
            {formatClock(remaining, locale)}
          </span>
        </p>
        <div aria-hidden="true" className="mt-1.5 h-1 w-full overflow-hidden bg-paper-2">
          <div className={cn('h-full bg-ink', over && 'opacity-30')} style={{ inlineSize: `${fraction * 100}%` }} />
        </div>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="num min-h-11 min-w-11 shrink-0 rounded-[var(--r)] border-[1.5px] border-ink px-3 text-base tx hover:bg-paper-2 active:translate-y-px"
      >
        {t('rest.add30')}
      </button>
      <button
        type="button"
        onClick={onSkip}
        className="min-h-11 shrink-0 rounded-[var(--r)] border-[1.5px] border-ink-3 px-3 text-sm font-semibold text-ink tx hover:border-ink hover:bg-paper-2 active:translate-y-px"
      >
        {t('rest.skip')}
      </button>
      <p role="status" className="sr-only">
        {over ? t('rest.over') : ''}
      </p>
    </div>
  );
}
