import { formatDate, formatTime, formatWeekday } from '@/lib/format';
import { diffDays, utcToZoned } from '@/lib/time';

/** `Sat 24 Oct, 17:00` / `شنبه ۲ آبان، ۱۷:۰۰` in the coach's timezone. */
export function formatSlot(date: Date, locale: string, timeZone: string): string {
  const day = `${formatWeekday(date, locale, { timeZone, style: 'short' })} ${formatDate(date, locale, { timeZone, style: 'short' })}`;
  const time = formatTime(date, locale, { timeZone });
  return locale === 'fa' ? `${day}، ${time}` : `${day}, ${time}`;
}

/** Whole calendar days from `then` to `now` in the timezone (0 = today). */
export function daysSince(then: Date, now: Date, timeZone: string): number {
  return Math.max(0, diffDays(utcToZoned(then, timeZone).dateKey, utcToZoned(now, timeZone).dateKey));
}

/** First name for a greeting: strips the «مربی» / "Coach" title the coach name carries. */
export function firstName(fullName: string): string {
  const words = fullName
    .replace(/^\s*(coach|مربی)\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words[0] ?? fullName.trim();
}

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export function dayPart(now: Date, timeZone: string): DayPart {
  const hour = utcToZoned(now, timeZone).hour;
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Join short facts on one line. fa uses the Persian comma «،»: the middle dot reads as an extra
 * zero next to Persian digits (docs/DESIGN.md rule 9), so `·` is for English only.
 */
export function joinMeta(parts: (string | null | undefined | false)[], locale: string): string {
  return parts.filter(Boolean).join(locale === 'fa' ? '، ' : ' · ');
}
