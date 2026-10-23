import { describe, expect, it } from 'vitest';
import { prefillFor, selectLastTime, type HistorySet } from '@/lib/training';

const h = (workoutId: string, iso: string, setIndex: number, reps: number, weightKg: number, isWarmup = false): HistorySet => ({
  workoutId,
  workoutStartedAt: iso,
  setIndex,
  reps,
  weightKg,
  isWarmup,
});

describe('selectLastTime', () => {
  const history = [
    h('w1', '2026-01-01T10:00:00Z', 1, 8, 50),
    h('w2', '2026-01-08T10:00:00Z', 2, 8, 55),
    h('w2', '2026-01-08T10:00:00Z', 1, 8, 55),
    h('w2', '2026-01-08T10:00:00Z', 3, 6, 55),
    h('w2', '2026-01-08T10:00:00Z', 0, 12, 30, true),
  ];
  it('picks the most recent workout and returns its working sets in order', () => {
    const last = selectLastTime(history)!;
    expect(last.workoutId).toBe('w2');
    expect(last.sets.map((s) => s.setIndex)).toEqual([1, 2, 3]);
  });
  it('ignores warm-up-only workouts and returns null for no history', () => {
    expect(selectLastTime([h('w9', '2026-02-01T10:00:00Z', 1, 10, 20, true)])).toBeNull();
    expect(selectLastTime([])).toBeNull();
  });
});

describe('prefillFor', () => {
  const lastTime = [
    { reps: 8, weightKg: 55 },
    { reps: 8, weightKg: 55 },
    { reps: 6, weightKg: 55 },
  ];
  it('keeps the set just logged first', () => {
    expect(prefillFor({ setNumber: 2, previous: { reps: 8, weightKg: 57.5 }, lastTime })).toEqual({
      weightKg: 57.5,
      reps: 8,
      source: 'previous',
    });
  });
  it('uses last time set N, or its last set when it had fewer', () => {
    expect(prefillFor({ setNumber: 3, lastTime })).toMatchObject({ reps: 6, weightKg: 55, source: 'last-time' });
    expect(prefillFor({ setNumber: 5, lastTime })).toMatchObject({ reps: 6, source: 'last-time' });
  });
  it('falls back to the target, then to nothing; bodyweight defaults to 0 kg', () => {
    expect(prefillFor({ setNumber: 1, target: { repsMin: 10, weightKg: 30 } })).toEqual({ weightKg: 30, reps: 10, source: 'target' });
    expect(prefillFor({ setNumber: 1, target: { repsMin: 10, weightKg: null }, bodyweight: true })).toMatchObject({ weightKg: 0 });
    expect(prefillFor({ setNumber: 1 })).toEqual({ weightKg: null, reps: null, source: 'none' });
  });
});
