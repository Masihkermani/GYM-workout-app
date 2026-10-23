import { describe, expect, it } from 'vitest';
import { epleyE1rm, round1, setVolume, totalVolume, workingSetCount } from '@/lib/training';

describe('epleyE1rm', () => {
  it('is w x (1 + reps/30) up to 12 reps', () => {
    expect(epleyE1rm(60, 8)).toBe(76); // 60 * (1 + 8/30) = 76
    expect(epleyE1rm(100, 5)).toBe(116.67);
    expect(epleyE1rm(50, 12)).toBe(70);
  });
  it('treats a single as the one-rep max itself', () => {
    expect(epleyE1rm(100, 1)).toBe(100);
  });
  it('is null above 12 reps, for bodyweight and for garbage input', () => {
    expect(epleyE1rm(40, 13)).toBeNull();
    expect(epleyE1rm(0, 8)).toBeNull();
    expect(epleyE1rm(-5, 8)).toBeNull();
    expect(epleyE1rm(60, 0)).toBeNull();
    expect(epleyE1rm(Number.NaN, 5)).toBeNull();
  });
  it('rounds for display to one decimal', () => {
    expect(round1(116.67)).toBe(116.7);
  });
});

describe('volume', () => {
  const sets = [
    { reps: 8, weightKg: 60 },
    { reps: 8, weightKg: 60 },
    { reps: 5, weightKg: 30, isWarmup: true },
  ];
  it('sums reps x weight over working sets only', () => {
    expect(totalVolume(sets)).toBe(960);
    expect(workingSetCount(sets)).toBe(2);
  });
  it('gives a warm-up set zero volume and bodyweight sets zero too', () => {
    expect(setVolume({ reps: 5, weightKg: 30, isWarmup: true })).toBe(0);
    expect(setVolume({ reps: 10, weightKg: 0 })).toBe(0);
  });
  it('is exact with 2.5 kg plates', () => {
    expect(totalVolume([{ reps: 3, weightKg: 82.5 }])).toBe(247.5);
  });
});
