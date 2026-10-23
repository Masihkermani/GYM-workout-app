import { CalendarX2 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Stamp } from '@/components/ui/Stamp';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { prisma } from '@/lib/db';
import { formatPhone } from '@/lib/phone';
import { formatTime } from '@/lib/format';
import { getCoachSettings } from '@/lib/settings';
import { dayBoundsUtc, todayKey } from '@/lib/time';
import { StartSessionButton } from '@/components/training/StartSessionButton';
import { CoachBookingActions } from './CoachBookingActions';
import { timeRange } from './dates';

const MARK: Record<string, string> = {
  PENDING: 'bg-plate-yellow',
  CONFIRMED: 'bg-plate-blue',
  COMPLETED: 'bg-plate-green',
  NO_SHOW: 'bg-danger',
};

/** Coach dashboard: today's sessions as a vertical timeline (time, client, stamp, quick actions). */
export async function CoachTodayAgenda({ locale }: { locale: string }) {
  const [t, settings] = await Promise.all([getTranslations({ locale, namespace: 'booking' }), getCoachSettings()]);
  const tz = settings.timezone;
  const now = new Date();
  const { start, end } = dayBoundsUtc(todayKey(tz, now), tz);

  const rows = await prisma.booking.findMany({
    where: { startsAt: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
    orderBy: { startsAt: 'asc' },
    select: {
      id: true,
      status: true,
      startsAt: true,
      endsAt: true,
      clientNote: true,
      client: { select: { id: true, name: true, phone: true } },
    },
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarX2}
        title={t('coach.agendaEmptyTitle')}
        description={t('coach.agendaEmptyBody')}
        action={
          <ButtonLink href="/coach/schedule" variant="outline">
            {t('coach.openSchedule')}
          </ButtonLink>
        }
      />
    );
  }

  return (
    <ol className="flex flex-col" data-testid="today-agenda">
      {rows.map((b, i) => {
        const started = b.startsAt.getTime() <= now.getTime();
        return (
          <li key={b.id} className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3">
            <p className="num pt-3.5 text-end text-lg text-ink">
              <bdi>{formatTime(b.startsAt, locale, { timeZone: tz })}</bdi>
            </p>
            <div className={cn('relative border-s-[1.5px] border-rule-strong ps-4', i < rows.length - 1 ? 'pb-4' : 'pb-0')}>
              <span
                aria-hidden="true"
                className={cn('absolute start-0 top-[1.15rem] size-3 -translate-x-1/2 rtl:translate-x-1/2', MARK[b.status])}
              />
              <div className="border-[1.5px] border-rule-strong bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <Link
                    href={`/coach/clients/${b.client.id}`}
                    className="inline-flex min-h-11 items-center text-base font-bold underline-offset-4 hover:underline"
                  >
                    {b.client.name}
                  </Link>
                  <Stamp status={b.status} label={b.status === 'PENDING' ? t('legend.awaiting') : undefined} />
                </div>
                <p className="num text-sm text-ink-2">
                  <bdi>{timeRange(b.startsAt, b.endsAt, locale, tz)}</bdi>
                  {locale === 'fa' ? '\u060c ' : ' \u00b7 '}
                  <span dir="ltr" className="ltr-isolate">
                    {formatPhone(b.client.phone, locale)}
                  </span>
                </p>
                {b.clientNote ? (
                  <p className="mt-1 text-sm">
                    <span className="font-semibold">{t('row.clientNote')}</span> <bdi>{b.clientNote}</bdi>
                  </p>
                ) : null}
                {b.status === 'CONFIRMED' ? (
                  <div className="pt-2">
                    <StartSessionButton bookingId={b.id} clientId={b.client.id} locale={locale} variant="ink" size="sm" />
                  </div>
                ) : null}
                <CoachBookingActions bookingId={b.id} status={b.status} started={started} locale={locale} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
