/**
 * Locale-aware formatting. Every number, date and time shown to a user goes through here so that
 * fa gets Persian digits, the Jalali calendar and the Persian decimal separator, and en gets
 * Gregorian dates with Latin digits.
 */
import { DEFAULT_TIME_ZONE, MINUTES_PER_DAY } from './constants';

export type AppLocale = 'fa' | 'en';
type DateInput = Date | string | number;

const isFa = (locale: string) => locale === 'fa';

const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));

// ---------------------------------------------------------------------------------------------
// numbers
// ---------------------------------------------------------------------------------------------

export interface NumberFormatOptions {
  /** Maximum fraction digits (default 2). */
  maxFractionDigits?: number;
  /** Minimum fraction digits (default 0). */
  minFractionDigits?: number;
  /** Pad the integer part, e.g. 2 renders 1 as 01 / ۰۱. */
  minIntegerDigits?: number;
  /** Thousands separators (default true; off for ids and set counts). */
  grouping?: boolean;
}

const nfCache = new Map<string, Intl.NumberFormat>();

export function formatNumber(value: number, locale: string, opts: NumberFormatOptions = {}): string {
  const {
    maxFractionDigits = 2,
    minFractionDigits = 0,
    minIntegerDigits = 1,
    grouping = true,
  } = opts;
  const tag = isFa(locale) ? 'fa-IR-u-nu-arabext' : 'en-US';
  const key = `${tag}|${maxFractionDigits}|${minFractionDigits}|${minIntegerDigits}|${grouping}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(tag, {
      maximumFractionDigits: maxFractionDigits,
      minimumFractionDigits: Math.min(minFractionDigits, maxFractionDigits),
      minimumIntegerDigits: minIntegerDigits,
      useGrouping: grouping,
    });
    nfCache.set(key, f);
  }
  // Intl renders -0 as "-0"; a weight of -0 kg never makes sense.
  return f.format(Object.is(value, -0) ? 0 : value);
}

/** `30 kg` / `۳۰ کیلو`. Weights keep up to 2 decimals (1.25 kg plates). */
export function formatKg(value: number, locale: string): string {
  const n = formatNumber(value, locale, { grouping: true, maxFractionDigits: 2 });
  return isFa(locale) ? `${n} کیلو` : `${n} kg`;
}

export interface SetFormatInput {
  sets: number;
  reps: number;
  /** Upper end of a rep range (`8–12`). */
  repsMax?: number | null;
  /** null / 0 = bodyweight: no weight is printed. */
  weightKg?: number | null;
}

/**
 * Set notation, sets first in both languages:
 *   en `3 × 8 @ 30 kg`      fa `۳ × ۸ — ۳۰ کیلو`
 */
export function formatSet(input: SetFormatInput, locale: string): string {
  const num = (n: number) => formatNumber(n, locale, { grouping: false });
  const reps =
    input.repsMax != null && input.repsMax !== input.reps
      ? `${num(input.reps)}–${num(input.repsMax)}`
      : num(input.reps);
  const head = `${num(input.sets)} × ${reps}`;
  if (input.weightKg == null || input.weightKg === 0) return head;
  return isFa(locale)
    ? `${head} — ${formatKg(input.weightKg, locale)}`
    : `${head} @ ${formatKg(input.weightKg, locale)}`;
}

/** A single logged set, e.g. `8 × 30 kg` / `۸ × ۳۰ کیلو` (reps first, as typed in the logger). */
export function formatLoggedSet(reps: number, weightKg: number, locale: string): string {
  const r = formatNumber(reps, locale, { grouping: false });
  return weightKg === 0 ? r : `${r} × ${formatKg(weightKg, locale)}`;
}

// ---------------------------------------------------------------------------------------------
// dates and times (fa: Jalali + Persian digits, en: Gregorian + Latin digits; 24-hour clock)
// ---------------------------------------------------------------------------------------------

export type DateStyle = 'short' | 'medium' | 'long' | 'numeric';

export interface DateFormatOptions {
  /** IANA zone. Pass the coach's `settings.timezone`; defaults to Asia/Tehran. */
  timeZone?: string;
  /**
   *  short   `1 Farvardin` / `21 Mar`
   *  medium  `1 Farvardin 1405` / `21 Mar 2026`
   *  long    `شنبه، ۱ فروردین ۱۴۰۵` / `Saturday, 21 March 2026` (comma after the weekday, in every engine)
   *  numeric `1405/01/01` / `2026-03-21`
   */
  style?: DateStyle;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(locale: string, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const tag = isFa(locale) ? 'fa-IR-u-ca-persian-nu-arabext' : 'en-GB-u-ca-gregory-nu-latn';
  const key = `${tag}|${timeZone}|${JSON.stringify(options)}`;
  let f = dtfCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(tag, { timeZone, ...options });
    dtfCache.set(key, f);
  }
  return f;
}

export function formatDate(value: DateInput, locale: string, opts: DateFormatOptions = {}): string {
  const { timeZone = DEFAULT_TIME_ZONE, style = 'medium' } = opts;
  const date = toDate(value);
  const fa = isFa(locale);
  // Dates are composed from formatToParts, never taken as the engine's finished pattern string:
  // CLDR patterns differ between ICU builds (Node renders en-GB long as "Friday, 23 October 2026",
  // Chrome as "Friday 23 October 2026"), and that difference is a hydration mismatch in any client
  // component that formats a date. The parts (names, digits) are stable; the glue below is ours.
  const parts = (options: Intl.DateTimeFormatOptions) => {
    const list = dtf(locale, timeZone, options).formatToParts(date);
    return (type: Intl.DateTimeFormatPartTypes) => list.find((p) => p.type === type)?.value ?? '';
  };
  switch (style) {
    case 'short': {
      const get = parts({ day: 'numeric', month: 'short' });
      return `${get('day')} ${get('month')}`;
    }
    case 'long': {
      const get = parts({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      // CLDR orders Persian as "1405 Farvardin 1, Saturday"; people write «شنبه، ۱ فروردین ۱۴۰۵».
      return `${get('weekday')}${fa ? '\u060c' : ','} ${get('day')} ${get('month')} ${get('year')}`;
    }
    case 'numeric': {
      const get = parts({ year: 'numeric', month: '2-digit', day: '2-digit' });
      return fa ? `${get('year')}/${get('month')}/${get('day')}` : `${get('year')}-${get('month')}-${get('day')}`;
    }
    case 'medium':
    default: {
      const get = parts({ day: 'numeric', month: 'short', year: 'numeric' });
      return `${get('day')} ${get('month')} ${get('year')}`;
    }
  }
}

/** `17:00` / `۱۷:۰۰` (24-hour). */
export function formatTime(value: DateInput, locale: string, opts: { timeZone?: string } = {}): string {
  const { timeZone = DEFAULT_TIME_ZONE } = opts;
  return dtf(locale, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(toDate(value));
}

export function formatDateTime(value: DateInput, locale: string, opts: DateFormatOptions = {}): string {
  const date = formatDate(value, locale, opts);
  const time = formatTime(value, locale, opts);
  return isFa(locale) ? `${date}، ${time}` : `${date}, ${time}`;
}

/** `Saturday` / `شنبه`. */
export function formatWeekday(
  value: DateInput,
  locale: string,
  opts: { timeZone?: string; style?: 'long' | 'short' | 'narrow' } = {},
): string {
  const { timeZone = DEFAULT_TIME_ZONE, style = 'long' } = opts;
  return dtf(locale, timeZone, { weekday: style }).format(toDate(value));
}

/** `Farvardin 1405` / `March 2026`. */
export function formatMonthYear(value: DateInput, locale: string, opts: { timeZone?: string } = {}): string {
  const { timeZone = DEFAULT_TIME_ZONE } = opts;
  const parts = dtf(locale, timeZone, { month: 'long', year: 'numeric' }).formatToParts(toDate(value));
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  return `${month} ${year}`;
}

/** Clock label for minutes-from-midnight (availability rules): 1020 -> `17:00` / `۱۷:۰۰`. */
export function formatMinuteOfDay(minuteOfDay: number, locale: string): string {
  const m = ((Math.round(minuteOfDay) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(m / 60);
  const minute = m % 60;
  const hh = formatNumber(hour, locale, { grouping: false, minIntegerDigits: 2 });
  const mm = formatNumber(minute, locale, { grouping: false, minIntegerDigits: 2 });
  return `${hh}:${mm}`;
}
