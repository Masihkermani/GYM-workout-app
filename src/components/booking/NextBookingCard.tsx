import { CalendarDays } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Stamp } from '@/components/ui/Stamp';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { getCoachContact } from '@/lib/scheduling/load';
import { clientCancelState } from '@/lib/scheduling';
import { coachDisplayName, getCoachSettings } from '@/lib/settings';
import { longDate, timeRange } from './dates';

/** Client Today page: the next live session, or a way to book one. */
export async function NextBookingCard({ userId, locale }: { userId: string; locale: string }) {
  const now = new Date();
  const [t, settings, next] = await Promise.all([
    getTranslations({ locale, namespace: 'booking' }),
    getCoachSettings(),
    prisma.booking.findFirst({
      where: { clientId: userId, status: { in: ['PENDING', 'CONFIRMED'] }, endsAt: { gt: now } },
      orderBy: { startsAt: 'asc' },
      select: { id: true, status: true, startsAt: true, endsAt: true },
    }),
  ]);
  const tz = settings.timezone;

  if (!next) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={t('next.emptyTitle')}
        description={t('next.emptyBody')}
        action={<ButtonLink href="/app/book">{t('next.book')}</ButtonLink>}
      />
    );
  }

  const coach = await getCoachContact();
  const cancel = clientCancelState(next, settings.cancelWindowHours, now);
  const coachName = coachDisplayName(settings, locale);

  return (
    <section aria-label={t('next.title')} className="border-[1.5px] border-rule-strong bg-card" data-testid="next-booking">
      <header className="flex items-center justify-between gap-3 border-b-[1.5px] border-rule-strong px-4 py-2.5">
        <h2 className="label-caps text-ink-2">{t('next.title')}</h2>
        <Stamp status={next.status} />
      </header>
      <div className="flex flex-col gap-1 px-4 py-4">
        <p className="text-base font-semibold">{longDate(next.startsAt, locale, tz)}</p>
        <p className="num text-4xl">
          <bdi>{timeRange(next.startsAt, next.endsAt, locale, tz)}</bdi>
        </p>
        <p className="mt-1 text-sm text-ink-2">{t('next.with', { name: coachName || coach.name })}</p>
        {next.status === 'PENDING' ? <p className="text-sm text-ink-2">{t('row.pendingHint')}</p> : null}
        {next.status === 'CONFIRMED' && cancel === 'allowed' ? (
          <p className="text-sm text-ink-2">
            {t('row.cancelUntil', {
              when: formatDateTime(new Date(next.startsAt.getTime() - settings.cancelWindowHours * 3_600_000), locale, {
                timeZone: tz,
              }),
            })}
          </p>
        ) : null}
      </div>
      <footer className="border-t border-rule px-4 py-3">
        <ButtonLink href="/app/bookings" variant="outline" size="sm">
          {t('next.manage')}
        </ButtonLink>
      </footer>
    </section>
  );
}
