import { epleyE1rm, round2 } from './e1rm';
import type { PrBaseline, PrFlag, SetLike } from './types';

export const EMPTY_BASELINE: PrBaseline = { bestE1rm: null, bestWeightByReps: {} };

const EPS = 0.005;

export function cloneBaseline(b: PrBaseline): PrBaseline {
  return { bestE1rm: b.bestE1rm, bestWeightByReps: { ...b.bestWeightByReps } };
}

/** True when the baseline holds nothing at all (first time with this exercise: no PR to beat yet). */
export function isEmptyBaseline(b: PrBaseline): boolean {
  return b.bestE1rm == null && Object.keys(b.bestWeightByReps).length === 0;
}

/** Fold one set into a baseline (warm-ups are ignored). Returns a new object. */
export function addToBaseline(baseline: PrBaseline, set: SetLike): PrBaseline {
  if (set.isWarmup || set.reps < 1) return baseline;
  const next = cloneBaseline(baseline);
  const e = epleyE1rm(set.weightKg, set.reps);
  if (e != null && (next.bestE1rm == null || e > next.bestE1rm)) next.bestE1rm = e;
  const prev = next.bestWeightByReps[set.reps];
  if (prev == null || set.weightKg > prev) next.bestWeightByReps[set.reps] = round2(set.weightKg);
  return next;
}

export function buildBaseline(sets: readonly SetLike[]): PrBaseline {
  let b: PrBaseline = EMPTY_BASELINE;
  for (const s of sets) b = addToBaseline(b, s);
  return b;
}

/**
 * Does `set` beat what the baseline already holds?
 *
 *  - e1RM PR: the estimated one-rep max is higher than any before it.
 *  - weight PR: heavier than ever lifted for exactly that many reps (or, for bodyweight sets, more
 *    reps than ever at bodyweight).
 *
 * The first time an exercise is ever logged there is nothing to beat, so it is never a PR; likewise a
 * rep count that has never been trained is not a "weight PR" (it would flag every new rep range).
 */
export function detectPr(baseline: PrBaseline, set: SetLike): PrFlag {
  const none: PrFlag = { e1rm: false, weight: false };
  if (set.isWarmup || set.reps < 1 || set.weightKg < 0) return none;
  if (isEmptyBaseline(baseline)) return none;

  let e1rm = false;
  const e = epleyE1rm(set.weightKg, set.reps);
  if (e != null && baseline.bestE1rm != null && e > baseline.bestE1rm + EPS) e1rm = true;

  let weight = false;
  if (set.weightKg > 0) {
    const best = baseline.bestWeightByReps[set.reps];
    if (best != null && set.weightKg > best + EPS) weight = true;
  } else {
    // bodyweight: more reps than the most reps ever done at weight 0
    const zeroReps = Object.entries(baseline.bestWeightByReps)
      .filter(([, kg]) => kg === 0)
      .map(([reps]) => Number(reps));
    const most = zeroReps.length ? Math.max(...zeroReps) : null;
    if (most != null && set.reps > most) weight = true;
  }
  return { e1rm, weight };
}

export const isPr = (f: PrFlag): boolean => f.e1rm || f.weight;

/**
 * Replay an ordered run of sets for ONE exercise against a starting baseline and report which of
 * them were PRs at the moment they were lifted. Each set is compared with the baseline plus every
 * earlier set in the run (two equal sets in a row are not two PRs).
 */
export function flagPrs(baseline: PrBaseline, ordered: readonly SetLike[]): PrFlag[] {
  let b = baseline;
  return ordered.map((s) => {
    const flag = detectPr(b, s);
    b = addToBaseline(b, s);
    return flag;
  });
}

/** The set with the highest e1RM; ties and sets without an e1RM fall back to volume. */
export function bestSet<T extends SetLike>(sets: readonly T[]): T | null {
  let best: T | null = null;
  let bestScore = -1;
  for (const s of sets) {
    if (s.isWarmup) continue;
    const e = epleyE1rm(s.weightKg, s.reps);
    // e1RM sets always outrank sets that only have a volume score
    const score = e != null ? 1_000_000 + e : s.reps * Math.max(s.weightKg, 0.001);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}
