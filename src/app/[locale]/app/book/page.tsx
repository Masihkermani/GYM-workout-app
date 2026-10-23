import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BookTimetable } from '@/components/booking/BookTimetable';
import { buildClientCells } from '@/components/booking/cells';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Link } from '@/i18n/navigation';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatNumber } from '@/lib/format';
import { MAX_LIVE_BOOKINGS, bookableWeekStarts, generateSlots } from '@/lib/scheduling';
import { getCoachContact, loadSchedulingData } from '@/lib/scheduling/load';
import { coachDisplayName, getCoachSettings } from '@/lib/settings';
import { addDaysToKey, todayKey, wallClockToUtc } from '@/lib/time';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'booking' });
  return { title: t('book.title') };
}

export default async function BookPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  if (user.role === 'COACH') redirect(`/${locale}/coach/schedule`);

  const now = new Date();
  const t = await getTranslations({ locale, namespace: 'booking' });

  // this week (including its past days) through the week that holds the last day of the horizon
  const settings = await getCoachSettings();
  const tz = settings.timezone;
  const weekStarts = bookableWeekStarts(now, settings.horizonDays, locale, tz);
  const from = wallClockToUtc(weekStarts[0], 0, tz);
  const to = wallClockToUtc(addDaysToKey(weekStarts[weekStarts.length - 1], 7), 0, tz);

  const [data, coach, liveCount] = await Promise.all([
    loadSchedulingData(from, to),
    getCoachContact(),
    prisma.booking.count({ where: { clientId: user.id, status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { gt: now } } }),
  ]);

  const slots = generateSlots({
    rules: data.rules,
    timeOff: data.timeOff,
    bookings: data.bookings,
    settings,
    from,
    to,
    now,
    viewerId: user.id,
  });
  const cells = await buildClientCells({ slots, locale, timeZone: tz });

  // open on the first week that still has something to book
  const firstOpen = slots.find((s) => s.state === 'open');
  const initialWeek = firstOpen
    ? ([...weekStarts].reverse().find((w) => wallClockToUtc(w, 0, tz).getTime() <= firstOpen.startsAt.getTime()) ??
      weekStarts[0])
    : weekStarts[0];

  const num = (n: number) => formatNumber(n, locale, { grouping: false });

  return (
    <div className="page-x flex flex-col gap-6 py-8 md:py-12">
      <header className="flex flex-col gap-4">
        <SectionLabel as="h1">{t('book.title')}</SectionLabel>
        <p className="max-w-prose text-lg text-ink-2">
          {settings.requireApproval ? t('book.leadApproval') : t('book.leadInstant')}
        </p>
        <p className="text-sm text-ink-2">
          {t('book.quota', { used: num(liveCount), max: num(MAX_LIVE_BOOKINGS) })}{' '}
          <Link href="/app/bookings" className="font-semibold text-ink underline underline-offset-4">
            {t('book.mySessions')}
          </Link>
        </p>
      </header>

      <BookTimetable
        cells={cells}
        locale={locale}
        timeZone={tz}
        todayKey={todayKey(tz, now)}
        weekStarts={weekStarts}
        initialWeek={initialWeek}
        policy={{
          cancelWindowHours: settings.cancelWindowHours,
          requireApproval: settings.requireApproval,
          slotMinutes: settings.slotMinutes,
        }}
        coach={{ name: coachDisplayName(settings, locale) || coach.name, phone: coach.phone }}
        liveCount={liveCount}
      />
    </div>
  );
}
