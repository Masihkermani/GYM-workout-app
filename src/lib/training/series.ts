import { epleyE1rm } from './e1rm';
import { addToBaseline, EMPTY_BASELINE, detectPr } from './prs';
import type { LoggedSetLike, PrBaseline, PrFlag } from './types';

const ms = (d: Date | string) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/** Chronological order: workout start, then set number, then id (stable). */
export function sortChronological<T extends Pick<LoggedSetLike, 'workoutStartedAt' | 'setIndex' | 'id'>>(sets: readonly T[]): T[] {
  return [...sets].sort(
    (a, b) => ms(a.workoutStartedAt) - ms(b.workoutStartedAt) || a.setIndex - b.setIndex || a.id.localeCompare(b.id),
  );
}

export interface E1rmPoint {
  workoutId: string;
  /** Start of the workout (ISO). */
  date: string;
  e1rm: number;
  reps: number;
  weightKg: number;
}

/** Best e1RM per workout for ONE exercise, oldest first. Workouts with no e1RM-able set are skipped. */
export function e1rmSeries(sets: readonly LoggedSetLike[]): E1rmPoint[] {
  const byWorkout = new Map<string, E1rmPoint>();
  for (const s of sortChronological(sets)) {
    if (s.isWarmup) continue;
    const e = epleyE1rm(s.weightKg, s.reps);
    if (e == null) continue;
    const cur = byWorkout.get(s.workoutId);
    if (!cur || e > cur.e1rm) {
      byWorkout.set(s.workoutId, {
        workoutId: s.workoutId,
        date: (s.workoutStartedAt instanceof Date ? s.workoutStartedAt : new Date(s.workoutStartedAt)).toISOString(),
        e1rm: e,
        reps: s.reps,
        weightKg: s.weightKg,
      });
    }
  }
  return [...byWorkout.values()].sort((a, b) => ms(a.date) - ms(b.date));
}

/**
 * Replay the client's whole history (any mix of exercises) and flag every set that was a PR when it
 * was lifted. Returns setId -> flag for PR sets only.
 */
export function replayPrs(sets: readonly LoggedSetLike[]): Map<string, PrFlag> {
  const byExercise = new Map<string, LoggedSetLike[]>();
  for (const s of sets) {
    const list = byExercise.get(s.exerciseId);
    if (list) list.push(s);
    else byExercise.set(s.exerciseId, [s]);
  }
  const out = new Map<string, PrFlag>();
  for (const list of byExercise.values()) {
    let baseline: PrBaseline = EMPTY_BASELINE;
    for (const s of sortChronological(list)) {
      const flag = detectPr(baseline, s);
      if (flag.e1rm || flag.weight) out.set(s.id, flag);
      baseline = addToBaseline(baseline, s);
    }
  }
  return out;
}

export interface PrEntry {
  setId: string;
  workoutId: string;
  date: string;
  reps: number;
  weightKg: number;
  e1rm: number | null;
  flag: PrFlag;
}

/** PR list for ONE exercise, newest first. */
export function prHistory(sets: readonly LoggedSetLike[]): PrEntry[] {
  const flags = replayPrs(sets);
  return sortChronological(sets)
    .filter((s) => flags.has(s.id))
    .map((s) => ({
      setId: s.id,
      workoutId: s.workoutId,
      date: (s.workoutStartedAt instanceof Date ? s.workoutStartedAt : new Date(s.workoutStartedAt)).toISOString(),
      reps: s.reps,
      weightKg: s.weightKg,
      e1rm: epleyE1rm(s.weightKg, s.reps),
      flag: flags.get(s.id)!,
    }))
    .reverse();
}

/** Heaviest weight per rep count over a set list (non-warm-up), sorted by reps. */
export function bestByRepCount(sets: readonly LoggedSetLike[]): { reps: number; weightKg: number }[] {
  const best = new Map<number, number>();
  for (const s of sets) {
    if (s.isWarmup) continue;
    const cur = best.get(s.reps);
    if (cur == null || s.weightKg > cur) best.set(s.reps, s.weightKg);
  }
  return [...best.entries()].map(([reps, weightKg]) => ({ reps, weightKg })).sort((a, b) => a.reps - b.reps);
}
