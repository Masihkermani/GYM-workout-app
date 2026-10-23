'use client';

import { useState, useTransition } from 'react';
import { Check, UserX, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { ActionButton } from './ActionButton';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import type { ActionResult, BookingStatusCode } from '@/lib/scheduling';
import { confirmBooking, declineBooking, markCompleted, markNoShow } from '@/server/booking';

type Kind = 'confirm' | 'decline' | 'completed' | 'noShow';

/**
 * Quick actions under a booking, chosen from its status and whether it has started:
 *   PENDING            Confirm, Decline
 *   CONFIRMED, future  Cancel (asks first)
 *   started, not done  Completed, No-show
 * Every action is a server action that re-checks the coach session and the transition.
 */
export function CoachBookingActions({
  bookingId,
  status,
  started,
  locale,
  allowCorrect = false,
  onDone,
}: {
  bookingId: string;
  status: BookingStatusCode;
  /** The session has begun (startsAt <= now when the page rendered). */
  started: boolean;
  locale: string;
  /** Offer to flip COMPLETED <-> NO_SHOW (the booking sheet does; dashboards stay quiet). */
  allowCorrect?: boolean;
  /** Called after an action succeeds (the booking sheet closes itself so the toast is not hidden behind it). */
  onDone?: () => void;
}) {
  const t = useTranslations('booking');
  const { toast } = useToast();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [askCancel, setAskCancel] = useState(false);
  const [, startTransition] = useTransition();

  const run = (kind: Kind, fn: () => Promise<ActionResult>) => {
    setBusy(kind);
    startTransition(async () => {
      const res = await fn();
      setBusy(null);
      setAskCancel(false);
      if (res.ok) {
        onDone?.();
        toast({ message: t(`coach.toast.${kind}`), tone: 'success' });
      } else {
        toast({ message: t(`errors.${res.error}`), tone: 'error' });
      }
    });
  };
  const arg = { locale, bookingId };

  const disabled = busy !== null;

  if (status === 'PENDING' && !started) {
    return (
      <div className="flex flex-wrap gap-2 pt-1">
        <ActionButton tone="confirm" loading={busy === 'confirm'} disabled={disabled} onClick={() => run('confirm', () => confirmBooking(arg))}>
          <Check className="size-4" aria-hidden="true" />
          {t('coach.confirm')}
        </ActionButton>
        <ActionButton tone="neutral" loading={busy === 'decline'} disabled={disabled} onClick={() => run('decline', () => declineBooking(arg))}>
          <X className="size-4" aria-hidden="true" />
          {t('coach.decline')}
        </ActionButton>
      </div>
    );
  }

  if (allowCorrect && (status === 'COMPLETED' || status === 'NO_SHOW')) {
    const toCompleted = status === 'NO_SHOW';
    return (
      <div className="pt-1">
        <ActionButton
          tone="neutral"
          loading={busy === (toCompleted ? 'completed' : 'noShow')}
          disabled={disabled}
          onClick={() =>
            toCompleted ? run('completed', () => markCompleted(arg)) : run('noShow', () => markNoShow(arg))
          }
        >
          {toCompleted ? t('coach.changeToCompleted') : t('coach.changeToNoShow')}
        </ActionButton>
      </div>
    );
  }

  if ((status === 'PENDING' || status === 'CONFIRMED') && started) {
    return (
      <div className="flex flex-wrap gap-2 pt-1">
        <ActionButton tone="confirm" loading={busy === 'completed'} disabled={disabled} onClick={() => run('completed', () => markCompleted(arg))}>
          <Check className="size-4" aria-hidden="true" />
          {t('coach.markCompleted')}
        </ActionButton>
        <ActionButton tone="neutral" loading={busy === 'noShow'} disabled={disabled} onClick={() => run('noShow', () => markNoShow(arg))}>
          <UserX className="size-4" aria-hidden="true" />
          {t('coach.markNoShow')}
        </ActionButton>
      </div>
    );
  }

  if (status === 'CONFIRMED') {
    return (
      <div className="pt-1">
        <ActionButton tone="neutral" disabled={disabled} onClick={() => setAskCancel(true)}>
          <X className="size-4" aria-hidden="true" />
          {t('coach.cancelBooking')}
        </ActionButton>
        <Dialog
          open={askCancel}
          onOpenChange={(next) => busy === null && setAskCancel(next)}
          role="alertdialog"
          title={t('coach.cancelTitle')}
          description={t('coach.cancelBody')}
          actions={
            <>
              <Button variant="danger" loading={busy === 'decline'} onClick={() => run('decline', () => declineBooking(arg))}>
                {t('coach.cancelBooking')}
              </Button>
              <Button variant="outline" disabled={busy !== null} onClick={() => setAskCancel(false)}>
                {t('cancel.keep')}
              </Button>
            </>
          }
        />
      </div>
    );
  }
  return null;
}
