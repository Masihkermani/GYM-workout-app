import { CalendarDays } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BookingRow } from '@/components/booking/BookingRow';
import { ClientBookingFooter } from '@/components/booking/ClientBookingFooter';
import { ButtonLink } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatNumber } from '@/lib/format';
import { MAX_LIVE_BOOKINGS, isLiveStatus } from '@/lib/scheduling';
import { getCoachContact } from '@/lib/scheduling/load';
import { coachDisplayName, getCoachSettings } from '@/lib/settings';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'booking' });
  return { title: t('bookings.title') };
}

export default async function BookingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  if (user.role === 'COACH') redirect(`/${locale}/coach/schedule`);

  const now = new Date();
  const [t, settings, coach, rows] = await Promise.all([
    getTranslations({ locale, namespace: 'booking' }),
    getCoachSettings(),
    getCoachContact(),
    prisma.booking.findMany({
      where: { clientId: user.id },
      orderBy: { startsAt: 'asc' },
      select: { id: true, status: true, startsAt: true, endsAt: true, clientNote: true, coachNote: true },
    }),
  ]);
  const tz = settings.timezone;

  const upcoming = rows.filter((b) => isLiveStatus(b.status) && b.endsAt.getTime() > now.getTime());
  const past = rows.filter((b) => !upcoming.includes(b)).reverse().slice(0, 40);

  return (
    <div className="page-x flex flex-col gap-10 py-8 md:py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <SectionLabel as="h1">{t('bookings.title')}</SectionLabel>
          <p className="text-sm text-ink-2">
            {t('book.quota', {
              used: formatNumber(upcoming.length, locale, { grouping: false }),
              max: formatNumber(MAX_LIVE_BOOKINGS, locale, { grouping: false }),
            })}
          </p>
        </div>
        <ButtonLink href="/app/book" variant="primary">
          {t('bookings.bookNew')}
        </ButtonLink>
      </header>

      <section aria-labelledby="upcoming" className="flex flex-col gap-4">
        <SectionLabel>
          <span id="upcoming">{t('bookings.upcoming')}</span>
        </SectionLabel>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={t('bookings.emptyUpcomingTitle')}
            description={t('bookings.emptyUpcomingBody')}
            // the header already carries the one plate-red "Book" on this screen
            action={
              <ButtonLink href="/app/book" variant="outline">
                {t('bookings.bookNew')}
              </ButtonLink>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {upcoming.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                locale={locale}
                timeZone={tz}
                footer={
                  <ClientBookingFooter
                    booking={b}
                    locale={locale}
                    timeZone={tz}
                    cancelWindowHours={settings.cancelWindowHours}
                    coach={{ name: coachDisplayName(settings, locale) || coach.name, phone: coach.phone }}
                    now={now}
                  />
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="past" className="flex flex-col gap-4">
        <SectionLabel>
          <span id="past">{t('bookings.past')}</span>
        </SectionLabel>
        {past.length === 0 ? (
          <p className="text-ink-2">{t('bookings.emptyPast')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {past.map((b) => (
              <BookingRow key={b.id} booking={b} locale={locale} timeZone={tz} dim />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
