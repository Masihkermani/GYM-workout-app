import { Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { formatDateTime } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { cancelDeadline, clientCancelState, type BookingStatusCode } from '@/lib/scheduling';
import { CancelBooking } from './CancelBooking';
import { longDate, timeRange } from './dates';
import type { CoachContact } from './types';

/**
 * Under a client's upcoming booking:
 *   PENDING    "Withdraw request", always: the coach has not committed, so the cancel window does not apply
 *   CONFIRMED  "Cancel session" until the cancel window starts; inside it the button is replaced by an
 *              explanation and the coach's contact (ARCHITECTURE.md, booking rules)
 */
export function ClientBookingFooter({
  booking,
  locale,
  timeZone,
  cancelWindowHours,
  coach,
  now,
}: {
  booking: { id: string; status: BookingStatusCode; startsAt: Date; endsAt: Date };
  locale: string;
  timeZone: string;
  cancelWindowHours: number;
  coach: CoachContact;
  now: Date;
}) {
  const t = useTranslations('booking');
  const state = clientCancelState(booking, cancelWindowHours, now);
  if (state === 'final') return null;

  const when = `${longDate(booking.startsAt, locale, timeZone)}, ${timeRange(booking.startsAt, booking.endsAt, locale, timeZone)}`;

  if (booking.status === 'PENDING') {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
        <CancelBooking bookingId={booking.id} locale={locale} when={when} mode="withdraw" />
        <p className="text-sm text-ink-2">{t('row.pendingHint')}</p>
      </div>
    );
  }

  if (state === 'allowed') {
    const deadline = formatDateTime(cancelDeadline(booking.startsAt, cancelWindowHours), locale, { timeZone });
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
        <CancelBooking bookingId={booking.id} locale={locale} when={when} />
        <p className="text-sm text-ink-2">{t('row.cancelUntil', { when: deadline })}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-rule pt-3 text-sm" data-testid="cancel-late">
      <p className="text-ink-2">{t('row.late', { hours: cancelWindowHours })}</p>
      {coach.phone ? (
        <p className="flex flex-wrap items-center gap-x-2">
          <Phone className="size-4 shrink-0" aria-hidden="true" />
          <span className="font-semibold">{coach.name}</span>
          <a
            href={`tel:${coach.phone}`}
            dir="ltr"
            className="num inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
          >
            {formatPhone(coach.phone, locale)}
          </a>
        </p>
      ) : null}
    </div>
  );
}
