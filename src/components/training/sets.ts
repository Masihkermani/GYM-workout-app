import { formatLoggedSet, formatNumber } from '@/lib/format';

/**
 * One logged set as text. A weighted set reads `8 × 30 kg` / `۸ × ۳۰ کیلو`. A bodyweight set has no
 * weight to print, and a bare «۶» on its own (a feed row, a record line) says nothing, so it reads
 * `6 reps` / «۶ تکرار». `t` is the `training` translator (server or client).
 */
export function loggedSetLabel(t: unknown, reps: number, weightKg: number, locale: string): string {
  if (weightKg !== 0) return formatLoggedSet(reps, weightKg, locale);
  const tt = t as (key: string, values: Record<string, string | number>) => string;
  return tt('set.repsOnly', { count: reps, n: formatNumber(reps, locale, { grouping: false }) });
}

/**
 * The sets of one exercise as a short list. When every set is bodyweight the unit is said once
 * («۶، ۸، ۸ تکرار»); otherwise each set is labelled on its own.
 */
export function loggedSetList(
  t: unknown,
  sets: readonly { reps: number; weightKg: number }[],
  locale: string,
): string {
  const sep = locale === 'fa' ? '، ' : ', ';
  if (sets.length > 0 && sets.every((s) => s.weightKg === 0)) {
    const reps = sets.map((s) => formatNumber(s.reps, locale, { grouping: false })).join(sep);
    const tt = t as (key: string, values: Record<string, string | number>) => string;
    return tt('set.repsList', { list: reps });
  }
  return sets.map((s) => loggedSetLabel(t, s.reps, s.weightKg, locale)).join(sep);
}
