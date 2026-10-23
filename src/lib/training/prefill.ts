import type { SetLike, TargetDTO } from './types';

export interface LastTimeSet extends SetLike {
  rpe?: number | null;
}

export interface PrefillValue {
  weightKg: number | null;
  reps: number | null;
  source: 'previous' | 'last-time' | 'target' | 'none';
}

export interface HistorySet extends LastTimeSet {
  workoutId: string;
  workoutStartedAt: Date | string;
  setIndex: number;
}

const ms = (d: Date | string) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/**
 * "Last time": the latest workout that has non-warm-up sets of this exercise, in set order.
 * `history` must already be limited to ONE client and ONE exercise (and exclude the live workout).
 */
export function selectLastTime<T extends HistorySet>(history: readonly T[]): { workoutId: string; startedAt: Date | string; sets: T[] } | null {
  const working = history.filter((s) => !s.isWarmup);
  if (working.length === 0) return null;
  let latest = working[0];
  for (const s of working) {
    if (ms(s.workoutStartedAt) > ms(latest.workoutStartedAt)) latest = s;
  }
  const sets = working.filter((s) => s.workoutId === latest.workoutId).sort((a, b) => a.setIndex - b.setIndex);
  return { workoutId: latest.workoutId, startedAt: latest.workoutStartedAt, sets };
}

/**
 * What the steppers hold for working set number `setNumber` (1-based):
 *  1. the set just logged in this workout (keep the flow going),
 *  2. last time's set with the same number (or its last set when last time had fewer),
 *  3. the program target,
 *  4. nothing.
 */
export function prefillFor(opts: {
  setNumber: number;
  previous?: SetLike | null;
  lastTime?: readonly LastTimeSet[] | null;
  target?: Pick<TargetDTO, 'repsMin' | 'weightKg'> | null;
  bodyweight?: boolean;
}): PrefillValue {
  const { setNumber, previous, lastTime, target, bodyweight } = opts;
  if (previous) return { weightKg: previous.weightKg, reps: previous.reps, source: 'previous' };
  if (lastTime && lastTime.length > 0) {
    const pick = lastTime[Math.min(Math.max(setNumber, 1), lastTime.length) - 1];
    return { weightKg: pick.weightKg, reps: pick.reps, source: 'last-time' };
  }
  if (target) {
    return { weightKg: target.weightKg ?? (bodyweight ? 0 : null), reps: target.repsMin, source: 'target' };
  }
  return { weightKg: bodyweight ? 0 : null, reps: null, source: 'none' };
}
