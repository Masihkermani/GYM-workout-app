/**
 * Time helpers. No external timezone library: everything is built on Intl.
 *
 * Vocabulary:
 *  - instant      a JS Date (UTC under the hood). All instants are stored in UTC.
 *  - dateKey      a calendar date as 'YYYY-MM-DD' (no timezone, no clock)
 *  - minuteOfDay  wall-clock minutes from 00:00, e.g. 17:00 = 1020 (as in AvailabilityRule)
 *  - wall clock   (dateKey, minuteOfDay) interpreted in an IANA timezone, e.g. the coach's Asia/Tehran
 *
 * Tehran is UTC+03:30 with no DST since 2022, but the helpers are DST-correct for other zones.
 */
import {
  getDate as jGetDate,
  getDaysInMonth as jGetDaysInMonth,
  getMonth as jGetMonth,
  getYear as jGetYear,
  newDate as jNewDate,
} from 'date-fns-jalali';

import { DEFAULT_TIME_ZONE, MINUTES_PER_DAY } from './constants';

export { DEFAULT_TIME_ZONE, MINUTES_PER_DAY };
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

export type DateKey = string; // 'YYYY-MM-DD'

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday ... 6 = Saturday (JS convention, same as AvailabilityRule.weekday) */
  weekday: number;
  dateKey: DateKey;
  minuteOfDay: number;
}

// ---------------------------------------------------------------------------------------------
// dateKey arithmetic (pure calendar maths via Date.UTC; never touches the host timezone)
// ---------------------------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, '0');

export function makeDateKey(year: number, month: number, day: number): DateKey {
  return `${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(day)}`;
}

export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new RangeError(`Invalid dateKey: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

/** dateKey -> UTC midnight of that calendar date, used purely for day arithmetic. */
function keyToUtcMs(key: DateKey): number {
  const { year, month, day } = parseDateKey(key);
  return Date.UTC(year, month - 1, day);
}

function utcMsToKey(ms: number): DateKey {
  const d = new Date(ms);
  return makeDateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDaysToKey(key: DateKey, days: number): DateKey {
  return utcMsToKey(keyToUtcMs(key) + days * MS_PER_DAY);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((keyToUtcMs(b) - keyToUtcMs(a)) / MS_PER_DAY);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOfKey(key: DateKey): number {
  return new Date(keyToUtcMs(key)).getUTCDay();
}

// ---------------------------------------------------------------------------------------------
// instant <-> wall clock in a timezone
// ---------------------------------------------------------------------------------------------

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      weekday: 'short',
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock components of an instant in the given timezone. */
export function utcToZoned(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): ZonedParts {
  const parts = zonedFormatter(timeZone).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const second = Number(get('second'));
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
    dateKey: makeDateKey(year, month, day),
    minuteOfDay: hour * 60 + minute,
  };
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (Tehran: +210). */
export function getTimeZoneOffsetMinutes(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): number {
  const p = utcToZoned(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(instant.getTime() / 1000) * 1000;
  return Math.round((asUtc - truncated) / MS_PER_MINUTE);
}

/**
 * Convert a wall-clock time in `timeZone` to the UTC instant.
 * `minuteOfDay` may exceed 1440 (rolls into the next day). Times skipped by a DST jump resolve
 * forward; ambiguous times resolve to the earlier occurrence.
 */
export function wallClockToUtc(
  date: DateKey,
  minuteOfDay: number,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date {
  const naive = keyToUtcMs(date) + minuteOfDay * MS_PER_MINUTE; // wall clock as if it were UTC
  // Two passes converge for every real-world zone transition.
  let guess = naive - getTimeZoneOffsetMinutes(new Date(naive), timeZone) * MS_PER_MINUTE;
  const offset2 = getTimeZoneOffsetMinutes(new Date(guess), timeZone);
  guess = naive - offset2 * MS_PER_MINUTE;
  return new Date(guess);
}

/** The inverse of wallClockToUtc, shaped for slot logic. */
export function utcToWallClock(
  instant: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): { date: DateKey; minuteOfDay: number; weekday: number } {
  const p = utcToZoned(instant, timeZone);
  return { date: p.dateKey, minuteOfDay: p.minuteOfDay, weekday: p.weekday };
}

/** Today's calendar date in the timezone. */
export function todayKey(timeZone: string = DEFAULT_TIME_ZONE, now: Date = new Date()): DateKey {
  return utcToZoned(now, timeZone).dateKey;
}

/** [start, end) instants of a calendar day in the timezone. */
export function dayBoundsUtc(
  date: DateKey,
  timeZone: string = DEFAULT_TIME_ZONE,
): { start: Date; end: Date } {
  return {
    start: wallClockToUtc(date, 0, timeZone),
    end: wallClockToUtc(addDaysToKey(date, 1), 0, timeZone),
  };
}

// ---------------------------------------------------------------------------------------------
// weeks (Saturday-first for fa, Monday-first for en)
// ---------------------------------------------------------------------------------------------

/** JS weekday (0 = Sun) on which the week starts: Saturday for fa, Monday for en. */
export function weekStartsOn(locale: string): number {
  return locale === 'fa' ? 6 : 1;
}

/** The weekend day shown muted in the UI: Friday for fa (5). en has no highlighted weekend day. */
export function weekendWeekday(locale: string): number | null {
  return locale === 'fa' ? 5 : null;
}

export function startOfWeekKey(key: DateKey, locale: string): DateKey {
  const diff = (weekdayOfKey(key) - weekStartsOn(locale) + 7) % 7;
  return addDaysToKey(key, -diff);
}

/** Seven consecutive dateKeys beginning at the locale's week start for `key`. */
export function weekKeys(key: DateKey, locale: string): DateKey[] {
  const start = startOfWeekKey(key, locale);
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(start, i));
}

/**
 * Instant of 00:00 (in `timeZone`) on the first day of the locale's week containing `instant`.
 */
export function startOfWeek(
  instant: Date,
  locale: string,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date {
  const key = startOfWeekKey(utcToZoned(instant, timeZone).dateKey, locale);
  return wallClockToUtc(key, 0, timeZone);
}

// ---------------------------------------------------------------------------------------------
// Jalali calendar helpers (date-fns-jalali)
//
// date-fns works on host-local Date objects. We therefore only ever build local *noon* dates from a
// dateKey, so results never depend on the host timezone or DST, and read components back from them.
// ---------------------------------------------------------------------------------------------

function keyToLocalNoon(key: DateKey): Date {
  const { year, month, day } = parseDateKey(key);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function localToKey(d: Date): DateKey {
  return makeDateKey(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export interface JalaliParts {
  year: number;
  month: number; // 1-12 (1 = Farvardin)
  day: number;
}

export function jalaliParts(key: DateKey): JalaliParts {
  const d = keyToLocalNoon(key);
  return { year: jGetYear(d), month: jGetMonth(d) + 1, day: jGetDate(d) };
}

/** Gregorian dateKey for a Jalali (year, month 1-12, day). */
export function fromJalali(year: number, month: number, day: number): DateKey {
  const d = jNewDate(year, month - 1, day);
  d.setHours(12, 0, 0, 0);
  return localToKey(d);
}

export function jalaliMonthLength(year: number, month: number): number {
  return jGetDaysInMonth(jNewDate(year, month - 1, 1));
}

export interface CalendarMonth {
  /** 'jalali' for fa, 'gregory' for en */
  calendar: 'jalali' | 'gregory';
  year: number;
  month: number; // 1-12 in that calendar
  firstKey: DateKey;
  lastKey: DateKey;
  days: number;
}

/** The calendar month (Jalali for fa, Gregorian for en) containing `key`. */
export function monthOf(key: DateKey, locale: string): CalendarMonth {
  if (locale === 'fa') {
    const j = jalaliParts(key);
    const days = jalaliMonthLength(j.year, j.month);
    return {
      calendar: 'jalali',
      year: j.year,
      month: j.month,
      firstKey: fromJalali(j.year, j.month, 1),
      lastKey: fromJalali(j.year, j.month, days),
      days,
    };
  }
  const { year, month } = parseDateKey(key);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    calendar: 'gregory',
    year,
    month,
    firstKey: makeDateKey(year, month, 1),
    lastKey: makeDateKey(year, month, days),
    days,
  };
}

/** First day of the month `n` months away (negative = back) in the locale's calendar. */
export function addMonthsToKey(key: DateKey, n: number, locale: string): DateKey {
  if (locale === 'fa') {
    const j = jalaliParts(key);
    const index = j.year * 12 + (j.month - 1) + n;
    return fromJalali(Math.floor(index / 12), (index % 12 + 12) % 12 + 1, 1);
  }
  const { year, month } = parseDateKey(key);
  const index = year * 12 + (month - 1) + n;
  return makeDateKey(Math.floor(index / 12), (index % 12 + 12) % 12 + 1, 1);
}

/**
 * Month grid: rows of 7 dateKeys beginning on the locale's week start; `null` pads days outside
 * the month. Render columns in DOM order and let CSS direction mirror them (Saturday rightmost in RTL).
 */
export function monthGrid(key: DateKey, locale: string): (DateKey | null)[][] {
  const m = monthOf(key, locale);
  const lead = (weekdayOfKey(m.firstKey) - weekStartsOn(locale) + 7) % 7;
  const cells: (DateKey | null)[] = Array(lead).fill(null);
  for (let i = 0; i < m.days; i++) cells.push(addDaysToKey(m.firstKey, i));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (DateKey | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

/** Split minutes-from-midnight into hour/minute (wraps at 24h). */
export function minuteOfDayToLabelParts(minuteOfDay: number): { hour: number; minute: number } {
  const m = ((Math.round(minuteOfDay) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return { hour: Math.floor(m / 60), minute: m % 60 };
}
