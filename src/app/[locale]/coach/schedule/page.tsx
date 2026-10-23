import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AvailabilityEditor } from '@/components/booking/AvailabilityEditor';
import { buildCoachCells } from '@/components/booking/cells';
import { ScheduleBoard } from '@/components/booking/ScheduleBoard';
import { TimeOffEditor } from '@/components/booking/TimeOffEditor';
import type { CoachBookingDTO, TimeOffDTO, WindowDTO } from '@/components/booking/types';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Tabs } from '@/components/ui/Tabs';
import { requireCoach } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateSlots, parseWeekParam, tileWindows, weekRange } from '@/lib/scheduling';
import { loadRules, loadSchedulingData, loadTimeOff } from '@/lib/scheduling/load';
import { getCoachSettings } from '@/lib/settings';
import { addDaysToKey, startOfWeekKey, todayKey, utcToZoned } from '@/lib/time';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'booking' });
  return { title: t('coach.title') };
}

const MS_DAY = 86_400_000;

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?: string; tab?: string; book?: string }>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);
  await requireCoach(locale);

  const now = new Date();
  const [t, settings] = await Promise.all([
    getTranslations({ locale, namespace: 'booking' }),
    getCoachSettings(),
  ]);
  const tz = settings.timezone;
  const today = todayKey(tz, now);
  const weekStart = startOfWeekKey(parseWeekParam(sp.week, today), locale);
  const week = weekRange(weekStart, locale, tz);

  // open slots the coach can place a session in: from now to a bit past the booking horizon
  const openUntil = new Date(now.getTime() + (settings.horizonDays + 14) * MS_DAY);

  const [rules, timeOff, weekBookings, planning, clients, timeOffRows] = await Promise.all([
    loadRules(),
    loadTimeOff(week.from, week.to),
    prisma.booking.findMany({
      where: { startsAt: { gte: week.from, lt: week.to }, status: { not: 'CANCELLED' } },
      orderBy: { startsAt: 'asc' },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
        clientNote: true,
        coachNote: true,
        client: { select: { id: true, name: true, phone: true } },
      },
    }),
    loadSchedulingData(now, openUntil),
    prisma.user.findMany({
      where: { role: 'CLIENT', active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.timeOff.findMany({ orderBy: { startsAt: 'asc' }, select: { id: true, startsAt: true, endsAt: true, reason: true } }),
  ]);

  const tiles = tileWindows({ rules, timeOff, settings, from: week.from, to: week.to });
  const cells = await buildCoachCells({
    tiles,
    bookings: weekBookings.map((b) => ({
      id: b.id,
      clientId: b.client.id,
      clientName: b.client.name,
      status: b.status,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
    })),
    locale,
    timeZone: tz,
    now,
  });

  const bookingDTOs: CoachBookingDTO[] = weekBookings.map((b) => ({
    id: b.id,
    clientId: b.client.id,
    clientName: b.client.name,
    clientPhone: b.client.phone,
    status: b.status,
    startsAt: b.startsAt.getTime(),
    endsAt: b.endsAt.getTime(),
    clientNote: b.clientNote,
    coachNote: b.coachNote,
    started: b.startsAt.getTime() <= now.getTime(),
  }));

  const openSlots = generateSlots({
    rules: planning.rules,
    timeOff: planning.timeOff,
    bookings: planning.bookings,
    settings,
    from: now,
    to: openUntil,
    now,
    audience: 'coach',
  })
    .filter((s) => s.state === 'open')
    .slice(0, 200)
    .map((s) => s.startsAt.getTime());

  const windows: WindowDTO[] = rules.map((r) => ({
    id: r.id,
    weekday: r.weekday,
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    active: r.active,
  }));

  // a time-off range ending at 00:00 of day N+1 covers whole days up to day N
  const toDto = (r: { id: string; startsAt: Date; endsAt: Date; reason: string | null }): TimeOffDTO => ({
    id: r.id,
    startDate: utcToZoned(r.startsAt, tz).dateKey,
    endDate: utcToZoned(new Date(r.endsAt.getTime() - 1), tz).dateKey,
    reason: r.reason,
  });
  const upcomingOff = timeOffRows.filter((r) => r.endsAt > now).map(toDto);
  const pastOff = timeOffRows.length - upcomingOff.length;

  const tab = sp.tab === 'availability' || sp.tab === 'timeoff' ? sp.tab : 'week';

  return (
    <div className="page-x flex flex-col gap-6 py-8 md:py-12">
      <SectionLabel as="h1">{t('coach.title')}</SectionLabel>
      <Tabs
        label={t('coach.tabsLabel')}
        defaultValue={sp.book ? 'week' : tab}
        tabs={[
          {
            id: 'week',
            label: t('coach.tabs.week'),
            panel: (
              <ScheduleBoard
                cells={cells}
                bookings={bookingDTOs}
                openSlots={openSlots}
                clients={clients}
                locale={locale}
                timeZone={tz}
                todayKey={today}
                weekStart={weekStart}
                prevWeek={addDaysToKey(weekStart, -7)}
                nextWeek={addDaysToKey(weekStart, 7)}
                initialClientId={sp.book && clients.some((c) => c.id === sp.book) ? sp.book : null}
              />
            ),
          },
          {
            id: 'availability',
            label: t('coach.tabs.availability'),
            panel: (
              <AvailabilityEditor
                rules={windows}
                slotMinutes={settings.slotMinutes}
                bufferMinutes={settings.bufferMinutes}
                locale={locale}
              />
            ),
          },
          {
            id: 'timeoff',
            label: t('coach.tabs.timeOff'),
            panel: (
              <TimeOffEditor
                items={upcomingOff}
                pastCount={pastOff}
                todayKey={today}
                locale={locale}
                timeZone={tz}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
