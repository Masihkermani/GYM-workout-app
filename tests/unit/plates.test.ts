import { describe, expect, it } from 'vitest';
import {
  computePlates,
  groupPlates,
  PLATE_DIAMETER_MM,
  PLATE_HEIGHT,
  PLATE_SIZES_KG,
  PLATE_THICKNESS,
} from '@/lib/plates';

describe('computePlates', () => {
  it('bare bar: no plates', () => {
    expect(computePlates(20, 20)).toMatchObject({ ok: true, perSide: [], loadedKg: 20 });
  });
  it('60 kg = 20 bar + 20 per side', () => {
    expect(computePlates(60, 20)).toMatchObject({ ok: true, perSide: [20] });
  });
  it('100 kg = 25 + 15 per side', () => {
    expect(computePlates(100, 20).perSide).toEqual([25, 15]);
  });
  it('140 kg = 25 + 25 + 10 per side', () => {
    expect(computePlates(140, 20).perSide).toEqual([25, 25, 10]);
  });
  it('uses the small plates: 22.5 kg = 1.25 per side', () => {
    expect(computePlates(22.5, 20)).toMatchObject({ ok: true, perSide: [1.25] });
  });
  it('87.5 kg = 25 + 5 + 2.5 + 1.25 per side', () => {
    const r = computePlates(87.5, 20);
    expect(r.ok).toBe(true);
    expect(r.perSide).toEqual([25, 5, 2.5, 1.25]);
    expect(r.loadedKg).toBe(87.5);
  });
  it('is exact for every 2.5 kg step from the bar to 300 kg', () => {
    for (let w = 20; w <= 300; w += 2.5) {
      const r = computePlates(w, 20);
      expect(r.ok, `${w} kg`).toBe(true);
      const sum = 20 + 2 * r.perSide.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(w, 6);
      // plates only come from the standard set, heaviest first
      expect(r.perSide.every((p) => (PLATE_SIZES_KG as readonly number[]).includes(p))).toBe(true);
      expect([...r.perSide].sort((a, b) => b - a)).toEqual(r.perSide);
    }
  });
  it('supports a different bar (15 kg women’s bar)', () => {
    expect(computePlates(50, 15).perSide).toEqual([15, 2.5]);
  });
  it('below the bar cannot be loaded', () => {
    expect(computePlates(15, 20)).toMatchObject({ ok: false, reason: 'below-bar', nearestAboveKg: 20 });
    expect(computePlates(-5, 20).ok).toBe(false);
    expect(computePlates(Number.NaN, 20).ok).toBe(false);
  });
  it('weights between increments cannot be loaded and suggest the neighbours', () => {
    const r = computePlates(31, 20);
    expect(r).toMatchObject({ ok: false, reason: 'unreachable', nearestBelowKg: 30, nearestAboveKg: 32.5 });
  });
  it('odd totals are unreachable (needs a 0.5 kg plate)', () => {
    expect(computePlates(61, 20).ok).toBe(false);
    expect(computePlates(61, 20).nearestBelowKg).toBe(60);
  });
});

describe('groupPlates', () => {
  it('collapses repeats', () => {
    expect(groupPlates([25, 25, 10, 2.5])).toEqual([
      { plate: 25, count: 2 },
      { plate: 10, count: 1 },
      { plate: 2.5, count: 1 },
    ]);
  });
});

describe('plate geometry (what the barbell diagram draws)', () => {
  it('bumpers (25/20/15/10) share the real 450 mm diameter; change plates are smaller discs', () => {
    for (const p of [25, 20, 15, 10] as const) expect(PLATE_DIAMETER_MM[p]).toBe(450);
    expect(PLATE_HEIGHT[25]).toBe(1);
    expect(PLATE_HEIGHT[10]).toBe(1);
    expect(PLATE_HEIGHT[5]).toBeLessThan(0.6);
    expect(PLATE_HEIGHT[2.5]).toBeLessThan(PLATE_HEIGHT[5]);
    expect(PLATE_HEIGHT[1.25]).toBeLessThan(PLATE_HEIGHT[2.5]);
  });
  it('heights are proportional to the real diameters', () => {
    for (const p of PLATE_SIZES_KG) expect(PLATE_HEIGHT[p]).toBeCloseTo(PLATE_DIAMETER_MM[p] / 450, 10);
  });
  it('a 25 kg plate is about twice as thick as a 5 kg plate, and thickness never grows as weight drops', () => {
    expect(PLATE_THICKNESS[25] / PLATE_THICKNESS[5]).toBeCloseTo(2, 1);
    const sizes = [...PLATE_SIZES_KG];
    for (let i = 1; i < sizes.length; i++) {
      expect(PLATE_THICKNESS[sizes[i]]).toBeLessThanOrEqual(PLATE_THICKNESS[sizes[i - 1]]);
    }
  });
});
