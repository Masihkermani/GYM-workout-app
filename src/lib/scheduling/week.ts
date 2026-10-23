import {
  addDaysToKey,
  startOfWeekKey,
  utcToZoned,
  wallClockToUtc,
  weekKeys,
  type DateKey,
} from '@/lib/time';

const MS_DAY = 86_400_000;

export interface WeekRange {
  /** First day of the week (Saturday for fa, Monday for en). */
  startKey: DateKey;
  /** Seven consecutive dateKeys. */
  keys: DateKey[];
  /** [from, to) instants of the whole week in the coach timezone. */
  from: Date;
  to: Date;
}

/** The locale's week containing `key`, with its UTC bounds in the coach timezone. */
export function weekRange(key: DateKey, locale: string, timeZone: string): WeekRange {
  const keys = weekKeys(key, locale);
  return {
    startKey: keys[0],
    keys,
    from: wallClockToUtc(keys[0], 0, timeZone),
    to: wallClockToUtc(addDaysToKey(keys[0], 7), 0, timeZone),
  };
}

/** Length of the coach dashboard's rolling window: the occupancy strip and the sessions figure share it. */
export const DASHBOARD_WINDOW_DAYS = 7;

/**
 * `days` consecutive days beginning at `startKey` (the dashboard's "next 7 days": it starts today,
 * wherever today falls in the calendar week, so late in the week it is not a row of past days).
 * Same shape as `weekRange`, so the two are interchangeable for callers that only need keys and bounds.
 */
export function rollingRange(startKey: DateKey, days: number, timeZone: string): WeekRange {
  const keys = Array.from({ length: days }, (_, i) => addDaysToKey(startKey, i));
  return {
    startKey,
    keys,
    from: wallClockToUtc(startKey, 0, timeZone),
    to: wallClockToUtc(addDaysToKey(startKey, days), 0, timeZone),
  };
}

/**
 * Start keys of every week a client can book in: from the week containing today to the week
 * containing the last day of the horizon (now + horizonDays).
 */
export function bookableWeekStarts(now: Date, horizonDays: number, locale: string, timeZone: string): DateKey[] {
  const today = utcToZoned(now, timeZone).dateKey;
  const lastDay = utcToZoned(new Date(now.getTime() + horizonDays * MS_DAY), timeZone).dateKey;
  const out: DateKey[] = [];
  for (let k = startOfWeekKey(today, locale); k <= lastDay; k = addDaysToKey(k, 7)) out.push(k);
  return out;
}

/** Parse `?week=YYYY-MM-DD` safely; anything else falls back to `fallback`. */
export function parseWeekParam(value: string | undefined | null, fallback: DateKey): DateKey {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return fallback;
  return value;
}
