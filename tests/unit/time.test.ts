import { describe, expect, it } from 'vitest';
import {
  addDaysToKey,
  addMonthsToKey,
  dayBoundsUtc,
  diffDays,
  fromJalali,
  getTimeZoneOffsetMinutes,
  jalaliMonthLength,
  jalaliParts,
  monthGrid,
  monthOf,
  startOfWeek,
  startOfWeekKey,
  todayKey,
  utcToWallClock,
  utcToZoned,
  wallClockToUtc,
  weekKeys,
  weekdayOfKey,
} from '@/lib/time';

describe('Tehran wall clock <-> UTC (UTC+03:30, no DST)', () => {
  it('offset is +210 minutes year-round', () => {
    expect(getTimeZoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'Asia/Tehran')).toBe(210);
    expect(getTimeZoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'Asia/Tehran')).toBe(210);
  });
  it('17:00 Tehran is 13:30 UTC', () => {
    expect(wallClockToUtc('2026-03-21', 17 * 60, 'Asia/Tehran').toISOString()).toBe('2026-03-21T13:30:00.000Z');
  });
  it('00:00 Tehran is 20:30 UTC the previous day', () => {
    expect(wallClockToUtc('2026-03-21', 0, 'Asia/Tehran').toISOString()).toBe('2026-03-20T20:30:00.000Z');
  });
  it('round-trips every 30 minutes across a day', () => {
    for (let m = 0; m < 24 * 60; m += 30) {
      const utc = wallClockToUtc('2026-03-21', m, 'Asia/Tehran');
      const back = utcToWallClock(utc, 'Asia/Tehran');
      expect(back).toEqual({ date: '2026-03-21', minuteOfDay: m, weekday: 6 });
    }
  });
  it('utcToZoned exposes weekday and dateKey', () => {
    const p = utcToZoned(new Date('2026-03-20T21:00:00Z'), 'Asia/Tehran'); // 00:30 Saturday
    expect(p).toMatchObject({ dateKey: '2026-03-21', hour: 0, minute: 30, weekday: 6, minuteOfDay: 30 });
  });
  it('minuteOfDay past 1440 rolls into the next day', () => {
    expect(wallClockToUtc('2026-03-21', 1500, 'Asia/Tehran').toISOString()).toBe(
      wallClockToUtc('2026-03-22', 60, 'Asia/Tehran').toISOString(),
    );
  });
  it('is DST-correct for other zones (Europe/Berlin)', () => {
    expect(wallClockToUtc('2026-01-15', 12 * 60, 'Europe/Berlin').toISOString()).toBe('2026-01-15T11:00:00.000Z');
    expect(wallClockToUtc('2026-07-15', 12 * 60, 'Europe/Berlin').toISOString()).toBe('2026-07-15T10:00:00.000Z');
  });
  it('dayBoundsUtc spans 24h in Tehran', () => {
    const { start, end } = dayBoundsUtc('2026-03-21', 'Asia/Tehran');
    expect(end.getTime() - start.getTime()).toBe(24 * 3600_000);
  });
  it('todayKey uses the zone', () => {
    expect(todayKey('Asia/Tehran', new Date('2026-03-20T21:00:00Z'))).toBe('2026-03-21');
    expect(todayKey('UTC', new Date('2026-03-20T21:00:00Z'))).toBe('2026-03-20');
  });
});

describe('dateKey arithmetic', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDaysToKey('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('weekday and diff', () => {
    expect(weekdayOfKey('2026-03-21')).toBe(6); // Saturday
    expect(weekdayOfKey('2026-03-22')).toBe(0); // Sunday
    expect(diffDays('2026-03-21', '2026-04-01')).toBe(11);
  });
});

describe('weeks: Saturday for fa, Monday for en', () => {
  it('startOfWeekKey', () => {
    // Wed 2026-03-25
    expect(startOfWeekKey('2026-03-25', 'fa')).toBe('2026-03-21'); // Saturday
    expect(startOfWeekKey('2026-03-25', 'en')).toBe('2026-03-23'); // Monday
    expect(startOfWeekKey('2026-03-21', 'fa')).toBe('2026-03-21'); // already Saturday
    expect(startOfWeekKey('2026-03-22', 'en')).toBe('2026-03-16'); // Sunday belongs to the previous Mon-week
  });
  it('weekKeys returns seven consecutive days', () => {
    const keys = weekKeys('2026-03-25', 'fa');
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe('2026-03-21');
    expect(keys[6]).toBe('2026-03-27'); // Friday, the Persian weekend
    expect(weekdayOfKey(keys[6])).toBe(5);
  });
  it('startOfWeek returns the local midnight instant', () => {
    const s = startOfWeek(new Date('2026-03-25T09:00:00Z'), 'fa', 'Asia/Tehran');
    expect(s.toISOString()).toBe('2026-03-20T20:30:00.000Z'); // Sat 21 Mar 00:00 Tehran
  });
});

describe('Jalali helpers', () => {
  it('2026-03-21 is 1405-01-01', () => {
    expect(jalaliParts('2026-03-21')).toEqual({ year: 1405, month: 1, day: 1 });
  });
  it('2026-03-20 is the last day of 1404', () => {
    expect(jalaliParts('2026-03-20')).toEqual({ year: 1404, month: 12, day: 29 });
  });
  it('fromJalali is the inverse', () => {
    expect(fromJalali(1405, 1, 1)).toBe('2026-03-21');
    expect(fromJalali(1404, 12, 29)).toBe('2026-03-20');
    expect(fromJalali(1405, 7, 1)).toBe('2026-09-23');
  });
  it('month lengths: 31 / 30 / 29-or-30', () => {
    expect(jalaliMonthLength(1405, 1)).toBe(31);
    expect(jalaliMonthLength(1405, 6)).toBe(31);
    expect(jalaliMonthLength(1405, 7)).toBe(30);
    expect(jalaliMonthLength(1405, 12)).toBe(29);
    expect(jalaliMonthLength(1403, 12)).toBe(30); // leap year
  });
  it('monthOf / addMonthsToKey per locale', () => {
    const m = monthOf('2026-03-25', 'fa');
    expect(m).toMatchObject({ calendar: 'jalali', year: 1405, month: 1, days: 31, firstKey: '2026-03-21', lastKey: '2026-04-20' });
    expect(addMonthsToKey('2026-03-25', 1, 'fa')).toBe('2026-04-21'); // 1 Ordibehesht
    expect(addMonthsToKey('2026-03-25', -1, 'fa')).toBe('2026-02-20'); // 1 Esfand 1404
    expect(addMonthsToKey('2026-03-25', 1, 'en')).toBe('2026-04-01');
    expect(addMonthsToKey('2026-01-25', -1, 'en')).toBe('2025-12-01');
  });
  it('monthGrid pads to whole Saturday-first weeks for fa', () => {
    const grid = monthGrid('2026-03-25', 'fa'); // Farvardin 1405 starts on Saturday
    expect(grid[0][0]).toBe('2026-03-21');
    expect(grid.every((row) => row.length === 7)).toBe(true);
    expect(grid.flat().filter(Boolean)).toHaveLength(31);
  });
  it('monthGrid for en starts on Monday', () => {
    const grid = monthGrid('2026-03-25', 'en'); // 1 Mar 2026 is a Sunday
    expect(grid[0].slice(0, 6).every((c) => c === null)).toBe(true);
    expect(grid[0][6]).toBe('2026-03-01');
  });
});
