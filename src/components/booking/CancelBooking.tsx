'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Flash } from '@/components/ui/Flash';
import { useToast } from '@/components/ui/Toast';
import type { BookingErrorCode } from '@/lib/scheduling';
import { ActionButton } from './ActionButton';
import { cancelBooking } from '@/server/booking';

/**
 * The client's Cancel / Withdraw button. Only rendered while it is allowed (a pending request any time,
 * a confirmed booking outside the cancel window); the server re-checks, so a stale page cannot cancel a
 * late session.
 */
export function CancelBooking({
  bookingId,
  locale,
  when,
  mode = 'cancel',
}: {
  bookingId: string;
  locale: string;
  /** e.g. «شنبه، ۳ آبان ۱۴۰۵، ۱۷:۰۰ تا ۱۸:۰۰» for the dialog text. */
  when: string;
  /** `withdraw` is a PENDING request (always allowed); `cancel` is a CONFIRMED booking outside the window. */
  mode?: 'cancel' | 'withdraw';
}) {
  const t = useTranslations('booking');
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<BookingErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const res = await cancelBooking({ locale, bookingId });
      if (res.ok) {
        setOpen(false);
        toast({ message: t(`${mode}.done`), tone: 'success' });
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <>
      <ActionButton
        tone="neutral"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {t(`${mode}.button`)}
      </ActionButton>
      <Dialog
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
        role="alertdialog"
        title={t(`${mode}.title`)}
        description={when}
        actions={
          <>
            <Button variant="danger" loading={pending} onClick={confirm}>
              {t(`${mode}.confirm`)}
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              {t(`${mode}.keep`)}
            </Button>
          </>
        }
      >
        <p className="text-base text-ink-2">{t(`${mode}.body`)}</p>
        {error ? (
          <Flash tone="error" className="mt-4">
            {t(`errors.${error}`)}
          </Flash>
        ) : null}
      </Dialog>
    </>
  );
}
