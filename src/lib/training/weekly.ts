import { addDaysToKey, startOfWeekKey, todayKey, utcToZoned, type DateKey } from '../time';
import { DEFAULT_TIME_ZONE } from '../constants';
import { round2 } from './e1rm';

export interface WeeklySetInput {
  workoutId: string;
  workoutStartedAt: Date | string;
  reps: number;
  weightKg: number;
  isWarmup?: boolean;
}

export interface WeeklyBucket {
  /** First day of the week (locale's week start: Saturday for fa, Monday for en). */
  weekStartKey: DateKey;
  volume: number;
  /** Working sets. */
  sets: number;
  workouts: number;
}

/**
 * Volume per calendar week for the last `weeks` weeks (oldest first, current week last), including
 * weeks with no training so the bars keep their spacing. Weeks follow the locale (Saturday-first in
 * fa) and are cut in the given time zone.
 */
export function weeklyVolume(
  sets: readonly WeeklySetInput[],
  opts: { weeks: number; locale: string; timeZone?: string; now?: Date },
): WeeklyBucket[] {
  const { weeks, locale, timeZone = DEFAULT_TIME_ZONE, now = new Date() } = opts;
  const currentStart = startOfWeekKey(todayKey(timeZone, now), locale);
  const buckets: WeeklyBucket[] = [];
  const index = new Map<DateKey, number>();
  for (let i = weeks - 1; i >= 0; i--) {
    const key = addDaysToKey(currentStart, -7 * i);
    index.set(key, buckets.length);
    buckets.push({ weekStartKey: key, volume: 0, sets: 0, workouts: 0 });
  }

  const seenWorkout = new Set<string>();
  for (const s of sets) {
    const when = s.workoutStartedAt instanceof Date ? s.workoutStartedAt : new Date(s.workoutStartedAt);
    const key = startOfWeekKey(utcToZoned(when, timeZone).dateKey, locale);
    const at = index.get(key);
    if (at == null) continue;
    const bucket = buckets[at];
    if (!seenWorkout.has(s.workoutId)) {
      seenWorkout.add(s.workoutId);
      bucket.workouts += 1;
    }
    if (s.isWarmup) continue;
    bucket.sets += 1;
    bucket.volume = round2(bucket.volume + Math.max(0, s.reps) * Math.max(0, s.weightKg));
  }
  return buckets;
}
