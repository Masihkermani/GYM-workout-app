/**
 * Estimated one-rep max (Epley): `w x (1 + reps / 30)`, valid up to 12 reps; heavier-rep sets are
 * too noisy to extrapolate from, so they return null.
 *
 * A single (reps = 1) IS the one-rep max, so it returns the weight itself rather than 103% of it.
 * Bodyweight sets (weight 0) have no meaningful e1RM and return null.
 */
export const E1RM_MAX_REPS = 12;

export function epleyE1rm(weightKg: number, reps: number): number | null {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return null;
  if (weightKg <= 0 || reps < 1 || reps > E1RM_MAX_REPS) return null;
  if (reps === 1) return round2(weightKg);
  return round2(weightKg * (1 + reps / 30));
}

/** Round to 0.01 so floating-point noise never decides a PR comparison. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** One decimal for display (`62.5`), never a long tail. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
