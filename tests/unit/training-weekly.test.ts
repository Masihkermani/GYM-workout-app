import { describe, expect, it } from 'vitest';
import { weeklyVolume, niceScale, linearScale, timeTicks, formatRelative } from '@/lib/training';

// 2026-03-21 is a Saturday (1 Farvardin 1405).
const NOW = new Date('2026-03-25T09:00:00Z'); // Wednesday, week of Sat 21 Mar (fa) / Mon 23 Mar (en)

const set = (workoutId: string, iso: string, reps: number, weightKg: number, isWarmup = false) => ({
  workoutId,
  workoutStartedAt: iso,
  reps,
  weightKg,
  isWarmup,
});

describe('weeklyVolume', () => {
  const sets = [
    set('a', '2026-03-22T08:00:00Z', 10, 50), // Sun, current fa week
    set('a', '2026-03-22T08:05:00Z', 10, 50),
    set('a', '2026-03-22T08:01:00Z', 5, 20, true), // warm-up: not in volume
    set('b', '2026-03-14T08:00:00Z', 8, 60), // Sat 14 Mar: previous fa week
    set('c', '2026-01-01T08:00:00Z', 8, 60), // outside the window
  ];
  it('buckets by the locale week (Saturday-first in fa), oldest first, filling empty weeks', () => {
    const w = weeklyVolume(sets, { weeks: 4, locale: 'fa', now: NOW });
    expect(w).toHaveLength(4);
    expect(w.map((b) => b.weekStartKey)).toEqual(['2026-02-28', '2026-03-07', '2026-03-14', '2026-03-21']);
    expect(w[3].weekStartKey).toBe('2026-03-21');
    expect(w[3].volume).toBe(1000);
    expect(w[3].sets).toBe(2);
    expect(w[3].workouts).toBe(1);
    expect(w[2].volume).toBe(480);
    expect(w[0].volume).toBe(0);
  });
  it('uses Monday-first weeks in en', () => {
    const w = weeklyVolume(sets, { weeks: 3, locale: 'en', now: NOW });
    expect(w[2].weekStartKey).toBe('2026-03-23');
    expect(w[1].weekStartKey).toBe('2026-03-16');
    // Sunday 22 Mar belongs to the week starting Monday 16 Mar
    expect(w[1].volume).toBe(1000);
  });
});

describe('niceScale', () => {
  it('pads to round ticks that contain the data', () => {
    const s = niceScale(61.3, 78.4);
    expect(s.min).toBeLessThanOrEqual(61.3);
    expect(s.max).toBeGreaterThanOrEqual(78.4);
    expect(s.ticks.length).toBeGreaterThanOrEqual(3);
    expect(s.ticks.length).toBeLessThanOrEqual(8);
    expect(s.ticks.every((t) => Math.abs(t / s.step - Math.round(t / s.step)) < 1e-9)).toBe(true);
  });
  it('starts at zero for bars and survives a flat series', () => {
    expect(niceScale(0, 4200, { zeroBased: true }).min).toBe(0);
    const flat = niceScale(60, 60);
    expect(flat.max).toBeGreaterThan(flat.min);
  });
});

describe('linearScale', () => {
  it('maps the domain onto a (possibly reversed) range', () => {
    const x = linearScale([0, 10], [100, 0]);
    expect(x(0)).toBe(100);
    expect(x(10)).toBe(0);
    expect(x(2.5)).toBe(75);
    expect(linearScale([5, 5], [0, 10])(5)).toBe(5);
  });
});

describe('timeTicks', () => {
  it('returns a handful of calendar ticks inside the span', () => {
    const t = timeTicks(Date.parse('2026-01-03T00:00:00Z'), Date.parse('2026-03-20T00:00:00Z'), { locale: 'en', maxTicks: 5 });
    expect(t.length).toBeGreaterThanOrEqual(2);
    expect(t.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < t.length; i++) expect(t[i].ms).toBeGreaterThan(t[i - 1].ms);
  });
});

describe('formatRelative', () => {
  it('speaks in the viewer language and digits', () => {
    const now = Date.parse('2026-03-25T12:00:00Z');
    expect(formatRelative(now - 3 * 3600_000, now, 'en')).toBe('3 hours ago');
    expect(formatRelative(now - 3 * 3600_000, now, 'fa')).toMatch(/^[۰-۹]+ ساعت پیش$/);
    expect(formatRelative(now - 10_000, now, 'en')).toBe('now');
  });
});
