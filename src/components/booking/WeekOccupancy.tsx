import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/cn';
import { prisma } from '@/lib/db';
import { formatNumber, formatWeekday } from '@/lib/format';
import { DASHBOARD_WINDOW_DAYS, rollingRange, tileWindows } from '@/lib/scheduling';
import { loadRules, loadTimeOff } from '@/lib/scheduling/load';
import { getCoachSettings } from '@/lib/settings';
import { todayKey, utcToZoned, weekdayOfKey, weekendWeekday } from '@/lib/time';
import { dayNumber, noonOf } from './dates';

const MS_MINUTE = 60_000;

/**
 * Coach dashboard: the next seven days (today first, in the coach timezone, rolling rather than the
 * calendar week so that on a Friday it is not a row of past days) as compact columns. Per
 * day: hours booked and hours still open as numbers (never colour alone) plus a bar of how much of
 * the day's capacity is taken.
 */
export async function WeekOccupancy({ locale }: { locale: string }) {
  const [t, settings] = await Promise.all([getTranslations({ locale, namespace: 'booking' }), getCoachSettings()]);
  const tz = settings.timezone;
  const now = new Date();
  const today = todayKey(tz, now);
  const week = rollingRange(today, DASHBOARD_WINDOW_DAYS, tz);

  const [rules, timeOff, bookings] = await Promise.all([
    loadRules(),
    loadTimeOff(week.from, week.to),
    prisma.booking.findMany({
      where: { startsAt: { gte: week.from, lt: week.to }, status: { not: 'CANCELLED' } },
      select: { startsAt: true, endsAt: true },
    }),
  ]);
  const tiles = tileWindows({ rules, timeOff, settings, from: week.from, to: week.to }).filter((x) => !x.timeOff);

  const days = week.keys.map((key) => {
    const dayTiles = tiles.filter((x) => utcToZoned(x.startsAt, tz).dateKey === key);
    const dayBookings = bookings.filter((b) => utcToZoned(b.startsAt, tz).dateKey === key);
    const bookedMin = dayBookings.reduce((sum, b) => sum + (b.endsAt.getTime() - b.startsAt.getTime()) / MS_MINUTE, 0);
    const openMin = dayTiles
      .filter(
        (x) =>
          x.startsAt.getTime() >= now.getTime() &&
          !bookings.some((b) => b.startsAt < x.endsAt && b.endsAt > x.startsAt),
      )
      .reduce((sum, x) => sum + (x.endsAt.getTime() - x.startsAt.getTime()) / MS_MINUTE, 0);
    return { key, bookedMin, openMin, hasWindow: dayTiles.length > 0 };
  });

  const hours = (min: number) => formatNumber(min / 60, locale, { maxFractionDigits: 1, grouping: false });
  const totalBooked = days.reduce((s, d) => s + d.bookedMin, 0);
  const totalOpen = days.reduce((s, d) => s + d.openMin, 0);
  const weekend = weekendWeekday(locale);

  return (
    <div className="flex flex-col gap-3" data-testid="week-occupancy">
      <p className="text-sm text-ink-2">
        {t('occupancy.summary', { booked: hours(totalBooked), open: hours(totalOpen) })}
      </p>
      <ol aria-label={t('occupancy.title')} className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {days.map((d) => {
          const share = d.bookedMin + d.openMin > 0 ? Math.min(100, Math.round((d.bookedMin / (d.bookedMin + d.openMin)) * 100)) : d.bookedMin > 0 ? 100 : 0;
          const isToday = d.key === today;
          const noon = noonOf(d.key, tz);
          const isWeekend = weekend !== null && weekdayOfKey(d.key) === weekend;
          const full = formatWeekday(noon, locale, { timeZone: tz, style: 'long' });
          return (
            <li
              key={d.key}
              aria-current={isToday ? 'date' : undefined}
              aria-label={t('occupancy.dayLabel', { day: full, booked: hours(d.bookedMin), open: hours(d.openMin) })}
              className={cn(
                'flex min-w-0 flex-col items-center gap-1 border-[1.5px] bg-card px-1 py-2 text-center',
                isToday ? 'border-ink' : 'border-rule',
                isWeekend && 'bg-paper-2',
              )}
            >
              <span aria-hidden="true" className="text-xs font-semibold">
                <span className="sm:hidden">{formatWeekday(noon, locale, { timeZone: tz, style: 'narrow' })}</span>
                <span className="hidden sm:inline">{formatWeekday(noon, locale, { timeZone: tz, style: 'short' })}</span>
              </span>
              <span aria-hidden="true" className="num text-sm text-ink-2">
                {dayNumber(d.key, locale)}
              </span>
              <span aria-hidden="true" className="relative h-14 w-3 border border-ink-3 bg-paper sm:w-4">
                <span className="absolute inset-x-0 bottom-0 bg-plate-blue" style={{ height: `${share}%` }} />
              </span>
              <span aria-hidden="true" className="num text-lg leading-none">
                {d.hasWindow || d.bookedMin > 0 ? hours(d.bookedMin) : '–'}
              </span>
              <span aria-hidden="true" className="text-xs text-ink-2">
                {d.hasWindow ? t('occupancy.open', { hours: hours(d.openMin) }) : t('occupancy.off')}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-ink-2">{t('occupancy.legend')}</p>
    </div>
  );
}
