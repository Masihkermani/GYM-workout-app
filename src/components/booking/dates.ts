import { formatDate, formatNumber, formatTime, formatWeekday } from '@/lib/format';
import { jalaliParts, parseDateKey, wallClockToUtc, type DateKey } from '@/lib/time';

/** Noon of a calendar day in the coach timezone: a safe instant to format a whole day from. */
export function noonOf(key: DateKey, timeZone: string): Date {
  return wallClockToUtc(key, 12 * 60, timeZone);
}

/** Day of month in the locale's calendar (Jalali for fa), as a localised string. */
export function dayNumber(key: DateKey, locale: string): string {
  const day = locale === 'fa' ? jalaliParts(key).day : parseDateKey(key).day;
  return formatNumber(day, locale, { grouping: false });
}

export function weekdayNarrow(key: DateKey, locale: string, timeZone: string): string {
  return formatWeekday(noonOf(key, timeZone), locale, { timeZone, style: 'narrow' });
}

export function weekdayShort(key: DateKey, locale: string, timeZone: string): string {
  return formatWeekday(noonOf(key, timeZone), locale, { timeZone, style: 'short' });
}

/**
 * `17:00 – 18:00` / «۱۷:۰۰ تا ۱۸:۰۰». Persian uses the word «تا» instead of a dash: between two numbers a
 * dash has no strong direction, so the order depends on the surrounding text; the word pins start-first
 * reading (start at the right) wherever the range is placed.
 */
export function timeRange(startsAt: Date | number, endsAt: Date | number, locale: string, timeZone: string): string {
  const from = formatTime(startsAt, locale, { timeZone });
  const to = formatTime(endsAt, locale, { timeZone });
  return locale === 'fa' ? `${from} تا ${to}` : `${from} – ${to}`;
}

/** `Saturday, 24 October 2026` / «شنبه، ۳ آبان ۱۴۰۵». */
export function longDate(at: Date | number, locale: string, timeZone: string): string {
  return formatDate(at, locale, { timeZone, style: 'long' });
}

/** `24 Oct – 30 Oct 2026` / «۳ آبان – ۹ آبان ۱۴۰۵» for the week starting at `weekStart`. */
export function weekTitle(weekStart: DateKey, lastDay: DateKey, locale: string, timeZone: string): string {
  const first = formatDate(noonOf(weekStart, timeZone), locale, { timeZone, style: 'short' });
  const last = formatDate(noonOf(lastDay, timeZone), locale, { timeZone, style: 'medium' });
  return `${first} – ${last}`;
}
