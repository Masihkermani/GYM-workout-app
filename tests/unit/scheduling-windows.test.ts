import { describe, expect, it } from 'vitest';
import { minutesToHHMM, parseTimeOfDay, validateWindow } from '@/lib/scheduling';

describe('parseTimeOfDay', () => {
  it.each([
    ['17:00', 1020],
    ['7:30', 450],
    ['07:05', 425],
    ['17', 1020],
    ['1730', 1050],
    ['930', 570],
    ['17.30', 1050],
    ['۱۷:۳۰', 1050], // Persian digits
    ['١٧:٣٠', 1050], // Arabic-Indic digits
    ['۱۷٫۳۰', 1050], // Arabic decimal separator typed as the colon
    [' 17 : 30 ', 1050],
    ['0', 0],
    ['24:00', 1440],
    ['2400', 1440],
  ])('reads %s as %i minutes', (text, minutes) => {
    expect(parseTimeOfDay(text)).toBe(minutes);
  });

  it.each(['', 'abc', '25:00', '24:01', '12:60', '1:2', '12:5', '-1', '17:30:00', '1e3', null, undefined])(
    'rejects %s',
    (text) => {
      expect(parseTimeOfDay(text as string)).toBeNull();
    },
  );
});

describe('minutesToHHMM', () => {
  it('pads to HH:MM', () => {
    expect(minutesToHHMM(0)).toBe('00:00');
    expect(minutesToHHMM(425)).toBe('07:05');
    expect(minutesToHHMM(1440)).toBe('24:00');
  });
});

describe('validateWindow', () => {
  const others = [
    { id: 'a', weekday: 6, startMinute: 420, endMinute: 660 },
    { id: 'b', weekday: 6, startMinute: 960, endMinute: 1260 },
    { id: 'c', weekday: 0, startMinute: 420, endMinute: 660 },
  ];
  const ok = (startMinute: number, endMinute: number, extra: object = {}) =>
    validateWindow({ weekday: 6, startMinute, endMinute, ...extra }, others, 60);

  it('accepts a window in a free gap and one touching its neighbours', () => {
    expect(ok(720, 900)).toBeNull();
    expect(ok(660, 960)).toBeNull(); // touches both, overlaps neither
  });
  it('rejects end <= start', () => {
    expect(ok(720, 720)).toBe('endBeforeStart');
    expect(ok(900, 720)).toBe('endBeforeStart');
  });
  it('rejects times outside the day or fractional', () => {
    expect(ok(-5, 100)).toBe('invalidTime');
    expect(ok(1000, 1441)).toBe('invalidTime');
    expect(ok(600.5, 900)).toBe('invalidTime');
    expect(validateWindow({ weekday: 7, startMinute: 0, endMinute: 100 }, [], 60)).toBe('invalidTime');
  });
  it('rejects a window shorter than one slot', () => {
    expect(ok(720, 750)).toBe('tooShort');
  });
  it('rejects overlap with another window on the same weekday only', () => {
    expect(ok(600, 700)).toBe('overlap');
    expect(ok(400, 1300)).toBe('overlap'); // swallows both
    expect(validateWindow({ weekday: 1, startMinute: 420, endMinute: 660 }, others, 60)).toBeNull(); // other day
  });
  it('ignores itself when editing (matched by id)', () => {
    expect(ok(420, 720, { id: 'a' })).toBeNull();
    expect(ok(420, 700, { id: 'b' })).toBe('overlap');
  });
  it('can end at midnight', () => {
    expect(validateWindow({ weekday: 3, startMinute: 1320, endMinute: 1440 }, [], 60)).toBeNull();
  });
});
