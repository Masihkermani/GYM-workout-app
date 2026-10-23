import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Stamp } from '@/components/ui/Stamp';
import { cn } from '@/lib/cn';
import type { BookingStatusCode } from '@/lib/scheduling';
import { formatMonthYear } from '@/lib/format';
import { utcToZoned } from '@/lib/time';
import { dayNumber, longDate, timeRange, weekdayShort } from './dates';

export interface BookingRowData {
  id: string;
  status: BookingStatusCode;
  startsAt: Date;
  endsAt: Date;
  clientNote?: string | null;
  /** The coach's note on the session; shown to the client in their history. */
  coachNote?: string | null;
}

/**
 * A booking as a ruled card: date block at the start side, time + stamp, notes, then `footer`
 * (cancel control, coach actions). Server-renderable; `footer` may contain client components.
 */
export function BookingRow({
  booking,
  locale,
  timeZone,
  footer,
  heading,
  dim = false,
  coachView = false,
}: {
  booking: BookingRowData;
  locale: string;
  timeZone: string;
  footer?: ReactNode;
  /** Replaces the long date line (the coach agenda shows the client's name here). */
  heading?: ReactNode;
  dim?: boolean;
  /** Coach wording: «در انتظار تأیید» on the stamp, «یادداشت شاگرد» instead of «یادداشت تو». */
  coachView?: boolean;
}) {
  const t = useTranslations('booking');
  const day = utcToZoned(booking.startsAt, timeZone).dateKey;
  return (
    <li className={cn('border-[1.5px] border-rule-strong bg-card', dim && 'opacity-90')}>
      <div className="flex items-stretch">
        <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 border-e border-rule px-2 py-3 text-center">
          <span className="text-xs font-semibold text-ink-2">{weekdayShort(day, locale, timeZone)}</span>
          <span className="num text-3xl leading-none">{dayNumber(day, locale)}</span>
          <span className="text-xs text-ink-2">{formatMonthYear(booking.startsAt, locale, { timeZone })}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="num text-xl">
              <bdi>{timeRange(booking.startsAt, booking.endsAt, locale, timeZone)}</bdi>
            </p>
            <Stamp
              status={booking.status}
              label={coachView && booking.status === 'PENDING' ? t('legend.awaiting') : undefined}
            />
          </div>
          <p className="text-sm text-ink-2">{heading ?? longDate(booking.startsAt, locale, timeZone)}</p>
          {booking.clientNote ? (
            <p className="text-sm">
              <span className="font-semibold">{coachView ? t('row.clientNote') : t('row.yourNote')}</span> <bdi>{booking.clientNote}</bdi>
            </p>
          ) : null}
          {booking.coachNote ? (
            <p className="border-s-[3px] border-ink ps-3 text-sm">
              <span className="font-semibold">{t('row.coachNote')}</span> <bdi>{booking.coachNote}</bdi>
            </p>
          ) : null}
          {footer}
        </div>
      </div>
    </li>
  );
}
