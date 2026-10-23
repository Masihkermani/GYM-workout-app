import { CalendarDays } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { prisma } from '@/lib/db';
import { formatNumber } from '@/lib/format';
import { getCoachSettings } from '@/lib/settings';
import { BookingRow } from './BookingRow';
import { CoachBookingActions } from './CoachBookingActions';

/**
 * Coach side, on a client's page: their sessions (upcoming first, then history) with the actions
 * that apply (confirm / decline, completed / no-show) and a shortcut to book a slot for them.
 */
export async function ClientBookingsPanel({ clientId, locale }: { clientId: string; locale: string }) {
  const now = new Date();
  const [t, settings, rows] = await Promise.all([
    getTranslations({ locale, namespace: 'booking' }),
    getCoachSettings(),
    prisma.booking.findMany({
      where: { clientId },
      orderBy: { startsAt: 'asc' },
      select: { id: true, status: true, startsAt: true, endsAt: true, clientNote: true, coachNote: true },
    }),
  ]);
  const tz = settings.timezone;
  const num = (n: number) => formatNumber(n, locale, { grouping: false });

  const upcoming = rows.filter((b) => (b.status === 'PENDING' || b.status === 'CONFIRMED') && b.endsAt > now);
  const history = rows.filter((b) => !upcoming.includes(b)).reverse();
  const shownHistory = history.slice(0, 12);
  const count = (s: string) => rows.filter((b) => b.status === s).length;

  return (
    <section className="flex flex-col gap-4" data-testid="client-bookings">
      <SectionLabel
        action={
          <ButtonLink href={`/coach/schedule?book=${clientId}`} variant="outline" size="sm">
            {t('coach.bookForThisClient')}
          </ButtonLink>
        }
      >
        {t('clientPanel.title')}
      </SectionLabel>

      {rows.length === 0 ? (
        <EmptyState icon={CalendarDays} title={t('clientPanel.emptyTitle')} description={t('clientPanel.emptyBody')} />
      ) : (
        <>
          <p className="text-sm text-ink-2">
            {t('clientPanel.summary', {
              completed: num(count('COMPLETED')),
              noShow: num(count('NO_SHOW')),
              cancelled: num(count('CANCELLED')),
              upcoming: num(upcoming.length),
            })}
          </p>
          {upcoming.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {upcoming.map((b) => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  locale={locale}
                  timeZone={tz}
                  coachView
                  footer={
                    <CoachBookingActions
                      bookingId={b.id}
                      status={b.status}
                      started={b.startsAt.getTime() <= now.getTime()}
                      locale={locale}
                    />
                  }
                />
              ))}
            </ul>
          ) : null}
          {shownHistory.length > 0 ? (
            <>
              <h3 className="label-caps mt-2 text-ink-2">{t('clientPanel.history')}</h3>
              <ul className="flex flex-col gap-3">
                {shownHistory.map((b) => (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    locale={locale}
                    timeZone={tz}
                    coachView
                    dim
                    footer={
                      // a session that already ran but was never closed out still needs an answer
                      (b.status === 'PENDING' || b.status === 'CONFIRMED') && b.startsAt <= now ? (
                        <CoachBookingActions bookingId={b.id} status={b.status} started locale={locale} />
                      ) : null
                    }
                  />
                ))}
              </ul>
              {history.length > shownHistory.length ? (
                <p className="text-sm text-ink-2">
                  {t('clientPanel.more', { count: num(history.length - shownHistory.length) })}
                </p>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
