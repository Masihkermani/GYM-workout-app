'use client';

import { useOptimistic, useTransition } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { Link } from '@/i18n/navigation';
import type { ActionResult } from '@/lib/scheduling';
import { confirmBooking, declineBooking } from '@/server/booking';

export interface PendingItem {
  id: string;
  clientId: string;
  clientName: string;
  /** Pre-formatted on the server in the coach timezone: «شنبه، ۳ آبان ۱۴۰۵» */
  date: string;
  /** «۱۷:۰۰ – ۱۸:۰۰» */
  time: string;
  note: string | null;
}

/**
 * Pending requests with one-tap Confirm / Decline. The row leaves the list at once (useOptimistic);
 * if the server refuses, React puts it back and a toast says why.
 */
export function PendingRequestsList({ items, locale }: { items: PendingItem[]; locale: string }) {
  const t = useTranslations('booking');
  const { toast } = useToast();
  const [visible, drop] = useOptimistic(items, (state, id: string) => state.filter((i) => i.id !== id));
  const [, startTransition] = useTransition();

  const act = (id: string, kind: 'confirm' | 'decline') => {
    startTransition(async () => {
      drop(id);
      const run: Promise<ActionResult> =
        kind === 'confirm' ? confirmBooking({ locale, bookingId: id }) : declineBooking({ locale, bookingId: id });
      const res = await run;
      if (res.ok) toast({ message: t(`coach.toast.${kind}`), tone: 'success' });
      else toast({ message: t(`errors.${res.error}`), tone: 'error' });
    });
  };

  if (visible.length === 0) return <p className="text-ink-2">{t('coach.pendingNone')}</p>;

  return (
    <ul className="flex flex-col gap-3">
      {visible.map((item) => (
        <li key={item.id} className="border-[1.5px] border-rule-strong bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <Link
                href={`/coach/clients/${item.clientId}`}
                className="inline-flex min-h-11 items-center text-lg font-bold underline-offset-4 hover:underline"
              >
                {item.clientName}
              </Link>
              <p className="text-sm text-ink-2">{item.date}</p>
              <p className="num text-xl">
                <bdi>{item.time}</bdi>
              </p>
              {item.note ? (
                <p className="mt-1 text-sm">
                  <span className="font-semibold">{t('row.clientNote')}</span> <bdi>{item.note}</bdi>
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="blue" size="sm" onClick={() => act(item.id, 'confirm')}>
                <Check className="size-4" aria-hidden="true" />
                {t('coach.confirm')}
              </Button>
              <Button variant="neutral" size="sm" onClick={() => act(item.id, 'decline')}>
                <X className="size-4" aria-hidden="true" />
                {t('coach.decline')}
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
