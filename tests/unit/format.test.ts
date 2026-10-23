import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatKg,
  formatMinuteOfDay,
  formatMonthYear,
  formatNumber,
  formatSet,
  formatTime,
  formatWeekday,
} from '@/lib/format';

describe('formatNumber', () => {
  it('uses Persian digits and decimal separator for fa', () => {
    expect(formatNumber(30, 'fa')).toBe('۳۰');
    expect(formatNumber(2.5, 'fa')).toBe('۲٫۵');
  });
  it('uses Latin digits for en', () => {
    expect(formatNumber(30, 'en')).toBe('30');
    expect(formatNumber(2.5, 'en')).toBe('2.5');
  });
  it('groups thousands unless asked not to', () => {
    expect(formatNumber(12500, 'en')).toBe('12,500');
    expect(formatNumber(12500, 'en', { grouping: false })).toBe('12500');
    expect(formatNumber(12500, 'fa')).toBe('۱۲٬۵۰۰');
  });
  it('pads integer digits', () => {
    expect(formatNumber(1, 'en', { minIntegerDigits: 2 })).toBe('01');
    expect(formatNumber(1, 'fa', { minIntegerDigits: 2 })).toBe('۰۱');
  });
  it('never prints negative zero', () => expect(formatNumber(-0, 'en')).toBe('0'));
});

describe('formatKg', () => {
  it('en', () => expect(formatKg(30, 'en')).toBe('30 kg'));
  it('fa', () => expect(formatKg(30, 'fa')).toBe('۳۰ کیلو'));
  it('keeps plate decimals', () => expect(formatKg(1.25, 'en')).toBe('1.25 kg'));
});

describe('formatSet', () => {
  it('en: 3 × 8 @ 30 kg', () => {
    expect(formatSet({ sets: 3, reps: 8, weightKg: 30 }, 'en')).toBe('3 × 8 @ 30 kg');
  });
  it('fa: ۳ × ۸ — ۳۰ کیلو', () => {
    expect(formatSet({ sets: 3, reps: 8, weightKg: 30 }, 'fa')).toBe('۳ × ۸ — ۳۰ کیلو');
  });
  it('rep ranges', () => {
    expect(formatSet({ sets: 4, reps: 8, repsMax: 12, weightKg: 22.5 }, 'en')).toBe('4 × 8–12 @ 22.5 kg');
  });
  it('bodyweight omits the load', () => {
    expect(formatSet({ sets: 3, reps: 12, weightKg: 0 }, 'en')).toBe('3 × 12');
    expect(formatSet({ sets: 3, reps: 12, weightKg: null }, 'fa')).toBe('۳ × ۱۲');
  });
});

describe('dates (Jalali for fa)', () => {
  // 2026-03-21 (Gregorian) is 1 Farvardin 1405 (Nowruz).
  const nowruz = new Date('2026-03-21T08:30:00Z');

  it('fa numeric date is Jalali with Persian digits', () => {
    expect(formatDate(nowruz, 'fa', { style: 'numeric' })).toBe('۱۴۰۵/۰۱/۰۱');
  });
  it('en numeric date is Gregorian', () => {
    expect(formatDate(nowruz, 'en', { style: 'numeric' })).toBe('2026-03-21');
  });
  it('fa medium date names the Persian month', () => {
    expect(formatDate(nowruz, 'fa')).toBe('۱ فروردین ۱۴۰۵');
  });
  it('en medium date', () => expect(formatDate(nowruz, 'en')).toBe('21 Mar 2026'));
  it('long dates read naturally in both languages', () => {
    expect(formatDate(nowruz, 'fa', { style: 'long' })).toBe('شنبه، ۱ فروردین ۱۴۰۵');
    expect(formatDate(nowruz, 'en', { style: 'long' })).toBe('Saturday, 21 March 2026');
  });
  it('pins the exact en/fa strings so Node and the browser cannot disagree (hydration)', () => {
    // Node's ICU renders en-GB long as "Friday, 23 October 2026", Chrome's as "Friday 23 October 2026".
    // formatDate composes the date from formatToParts, so the glue (comma, spaces) is ours in every engine.
    const friday = new Date('2026-10-23T09:00:00Z');
    expect(formatDate(friday, 'en', { style: 'long' })).toBe('Friday, 23 October 2026');
    expect(formatDate(friday, 'en', { style: 'medium' })).toBe('23 Oct 2026');
    expect(formatDate(friday, 'en', { style: 'short' })).toBe('23 Oct');
    expect(formatDate(friday, 'en', { style: 'numeric' })).toBe('2026-10-23');
    expect(formatDate(friday, 'fa', { style: 'long' })).toBe('جمعه، ۱ آبان ۱۴۰۵');
    expect(formatDate(friday, 'fa', { style: 'medium' })).toBe('۱ آبان ۱۴۰۵');
    expect(formatDate(friday, 'fa', { style: 'short' })).toBe('۱ آبان');
    // the long form has exactly one comma, directly after the weekday
    expect(formatDate(friday, 'en', { style: 'long' }).split(',')).toHaveLength(2);
    // and no middle dot, which must never sit next to Persian digits
    expect(formatDate(friday, 'fa', { style: 'long' })).not.toContain('\u00b7');
  });
  it('honours the timezone for the date boundary', () => {
    // 2026-03-20T21:00Z is already 00:30 on 21 March in Tehran (UTC+03:30).
    const late = new Date('2026-03-20T21:00:00Z');
    expect(formatDate(late, 'en', { style: 'numeric', timeZone: 'Asia/Tehran' })).toBe('2026-03-21');
    expect(formatDate(late, 'en', { style: 'numeric', timeZone: 'UTC' })).toBe('2026-03-20');
  });
  it('weekday names', () => {
    expect(formatWeekday(nowruz, 'fa')).toBe('شنبه');
    expect(formatWeekday(nowruz, 'en')).toBe('Saturday');
  });
  it('month and year', () => {
    expect(formatMonthYear(nowruz, 'fa')).toBe('فروردین ۱۴۰۵');
    expect(formatMonthYear(nowruz, 'en')).toBe('March 2026');
  });
});

describe('times', () => {
  it('formats in the coach timezone (Tehran = UTC+03:30)', () => {
    const d = new Date('2026-03-21T13:30:00Z'); // 17:00 in Tehran
    expect(formatTime(d, 'en')).toBe('17:00');
    expect(formatTime(d, 'fa')).toBe('۱۷:۰۰');
    expect(formatTime(d, 'en', { timeZone: 'UTC' })).toBe('13:30');
  });
  it('formats minute-of-day', () => {
    expect(formatMinuteOfDay(1020, 'en')).toBe('17:00');
    expect(formatMinuteOfDay(450, 'fa')).toBe('۰۷:۳۰');
  });
});
