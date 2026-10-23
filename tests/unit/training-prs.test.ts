import { describe, expect, it } from 'vitest';
import {
  addToBaseline,
  bestSet,
  buildBaseline,
  detectPr,
  EMPTY_BASELINE,
  flagPrs,
  isEmptyBaseline,
  prHistory,
  replayPrs,
  e1rmSeries,
  bestByRepCount,
  type LoggedSetLike,
} from '@/lib/training';

const hist = buildBaseline([
  { reps: 8, weightKg: 60 },
  { reps: 8, weightKg: 57.5 },
  { reps: 5, weightKg: 65 },
  { reps: 10, weightKg: 40, isWarmup: true },
]);

describe('baseline', () => {
  it('ignores warm-ups and records the best e1RM and best weight per rep count', () => {
    expect(hist.bestE1rm).toBe(76); // 60 x 8
    expect(hist.bestWeightByReps).toEqual({ 8: 60, 5: 65 });
    expect(isEmptyBaseline(EMPTY_BASELINE)).toBe(true);
    expect(isEmptyBaseline(hist)).toBe(false);
  });
});

describe('detectPr', () => {
  it('flags a heavier set for the same reps as a weight PR (and e1RM)', () => {
    expect(detectPr(hist, { reps: 8, weightKg: 62.5 })).toEqual({ e1rm: true, weight: true });
  });
  it('flags a better e1RM from a different rep count even without a same-reps record', () => {
    // 5 x 70 -> 81.67 > 76; best at 5 reps is 65 -> weight PR as well
    expect(detectPr(hist, { reps: 5, weightKg: 70 })).toEqual({ e1rm: true, weight: true });
    // 3 reps has never been trained: only the e1RM can be a PR
    expect(detectPr(hist, { reps: 3, weightKg: 75 })).toEqual({ e1rm: true, weight: false });
  });
  it('does not flag equal sets, lighter sets, warm-ups, or new rep ranges that do not beat e1RM', () => {
    expect(detectPr(hist, { reps: 8, weightKg: 60 })).toEqual({ e1rm: false, weight: false });
    expect(detectPr(hist, { reps: 8, weightKg: 55 })).toEqual({ e1rm: false, weight: false });
    expect(detectPr(hist, { reps: 8, weightKg: 100, isWarmup: true })).toEqual({ e1rm: false, weight: false });
    expect(detectPr(hist, { reps: 12, weightKg: 40 })).toEqual({ e1rm: false, weight: false });
  });
  it('never flags the very first time an exercise is logged', () => {
    expect(detectPr(EMPTY_BASELINE, { reps: 8, weightKg: 100 })).toEqual({ e1rm: false, weight: false });
  });
  it('flags more reps at bodyweight', () => {
    const b = buildBaseline([{ reps: 10, weightKg: 0 }]);
    expect(detectPr(b, { reps: 11, weightKg: 0 })).toEqual({ e1rm: false, weight: true });
    expect(detectPr(b, { reps: 10, weightKg: 0 })).toEqual({ e1rm: false, weight: false });
  });
  it('does not mutate the baseline', () => {
    const before = JSON.stringify(hist);
    addToBaseline(hist, { reps: 8, weightKg: 100 });
    expect(JSON.stringify(hist)).toBe(before);
  });
});

describe('flagPrs (in-workout replay)', () => {
  it('compares each set with the history plus the sets before it', () => {
    const flags = flagPrs(hist, [
      { reps: 8, weightKg: 62.5 }, // PR
      { reps: 8, weightKg: 62.5 }, // equal to the new best: not a PR
      { reps: 8, weightKg: 65 }, // PR again
    ]);
    expect(flags.map((f) => f.e1rm || f.weight)).toEqual([true, false, true]);
  });
});

describe('bestSet', () => {
  it('prefers the highest e1RM and skips warm-ups', () => {
    const sets = [
      { reps: 8, weightKg: 60 },
      { reps: 5, weightKg: 70 },
      { reps: 3, weightKg: 100, isWarmup: true },
    ];
    expect(bestSet(sets)).toBe(sets[1]);
  });
  it('falls back to volume when nothing has an e1RM', () => {
    const sets = [
      { reps: 20, weightKg: 10 },
      { reps: 25, weightKg: 10 },
    ];
    expect(bestSet(sets)).toBe(sets[1]);
  });
  it('is null for an empty or warm-up-only list', () => {
    expect(bestSet([])).toBeNull();
    expect(bestSet([{ reps: 5, weightKg: 20, isWarmup: true }])).toBeNull();
  });
});

const mk = (id: string, w: string, day: number, idx: number, reps: number, kg: number, ex = 'bench'): LoggedSetLike => ({
  id,
  exerciseId: ex,
  workoutId: w,
  setIndex: idx,
  reps,
  weightKg: kg,
  workoutStartedAt: new Date(Date.UTC(2026, 0, day, 12)),
});

describe('replayPrs / prHistory / e1rmSeries', () => {
  const sets = [
    mk('a1', 'w1', 1, 1, 8, 50),
    mk('a2', 'w1', 1, 2, 8, 50),
    mk('b1', 'w2', 5, 1, 8, 52.5), // PR
    mk('b2', 'w2', 5, 2, 8, 52.5), // same: no PR
    mk('c1', 'w3', 9, 1, 8, 52.5), // equal: no PR
    mk('c2', 'w3', 9, 2, 6, 60), // PR (e1RM 72 > 66.5)
    mk('d1', 'w1', 1, 1, 5, 20, 'row'), // first row ever: none
  ];
  it('flags only sets that beat everything before them, whatever order they arrive in', () => {
    const shuffled = [...sets].reverse();
    const flags = replayPrs(shuffled);
    expect([...flags.keys()].sort()).toEqual(['b1', 'c2']);
  });
  it('lists PRs newest first', () => {
    const list = prHistory(sets.filter((s) => s.exerciseId === 'bench'));
    expect(list.map((p) => p.setId)).toEqual(['c2', 'b1']);
    expect(list[0].e1rm).toBe(72);
  });
  it('builds one point per workout with the best e1RM', () => {
    const pts = e1rmSeries(sets.filter((s) => s.exerciseId === 'bench'));
    expect(pts.map((p) => p.workoutId)).toEqual(['w1', 'w2', 'w3']);
    expect(pts.map((p) => p.e1rm)).toEqual([63.33, 66.5, 72]);
  });
  it('groups the heaviest weight by rep count', () => {
    expect(bestByRepCount(sets.filter((s) => s.exerciseId === 'bench'))).toEqual([
      { reps: 6, weightKg: 60 },
      { reps: 8, weightKg: 52.5 },
    ]);
  });
});
