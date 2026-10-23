import type { SetLike } from './types';
import { round2 } from './e1rm';

/** reps x weight of one set (warm-ups count as 0 volume). */
export function setVolume(set: SetLike): number {
  if (set.isWarmup) return 0;
  return round2(Math.max(0, set.reps) * Math.max(0, set.weightKg));
}

/** Volume = sum of reps x weight over non-warm-up sets. */
export function totalVolume(sets: readonly SetLike[]): number {
  return round2(sets.reduce((sum, s) => sum + setVolume(s), 0));
}

/** Number of working (non-warm-up) sets. */
export function workingSetCount(sets: readonly SetLike[]): number {
  return sets.reduce((n, s) => n + (s.isWarmup ? 0 : 1), 0);
}
