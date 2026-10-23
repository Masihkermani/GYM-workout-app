import { addDaysToKey, diffDays, startOfWeekKey, utcToZoned, wallClockToUtc, type DateKey } from '../time';
import { DEFAULT_TIME_ZONE } from '../constants';

export interface NiceScale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** Round a step up to 1, 2, 2.5, 5 x 10^n so ticks read like gym numbers. */
function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const f = raw / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * Y scale with round tick values. `min`/`max` are the data extremes; the result pads to the nearest
 * ticks. `zeroBased` forces the axis to start at 0 (bars).
 */
export function niceScale(min: number, max: number, opts: { target?: number; zeroBased?: boolean } = {}): NiceScale {
  const { target = 4, zeroBased = false } = opts;
  let lo = zeroBased ? 0 : min;
  let hi = max;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { min: 0, max: 1, step: 1, ticks: [0, 1] };
  if (hi === lo) {
    const pad = Math.max(Math.abs(hi) * 0.1, 1);
    lo = zeroBased ? 0 : lo - pad;
    hi += pad;
  }
  const step = niceStep((hi - lo) / Math.max(1, target));
  const first = Math.floor(lo / step + 1e-9) * step;
  const last = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let v = first; v <= last + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { min: ticks[0], max: ticks[ticks.length - 1], step, ticks };
}

/** Linear map from a data domain to a pixel range (range may run backwards, e.g. SVG y or RTL x). */
export function linearScale(domain: readonly [number, number], range: readonly [number, number]): (v: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

export interface TimeTick {
  /** Instant (ms) of 00:00 on the tick's day in the zone. */
  ms: number;
  key: DateKey;
}

/**
 * Evenly spaced calendar ticks for a time axis, snapped to the start of the locale's week so labels
 * land on real dates ("Sat 12 Mehr"), never more than `maxTicks`.
 */
export function timeTicks(
  minMs: number,
  maxMs: number,
  opts: { locale: string; timeZone?: string; maxTicks?: number },
): TimeTick[] {
  const { locale, timeZone = DEFAULT_TIME_ZONE, maxTicks = 5 } = opts;
  const first = utcToZoned(new Date(minMs), timeZone).dateKey;
  const last = utcToZoned(new Date(maxMs), timeZone).dateKey;
  const spanDays = Math.max(1, diffDays(first, last));
  const steps = [1, 2, 7, 14, 28, 56, 112, 224];
  let step = steps[steps.length - 1];
  for (const s of steps) {
    if (Math.floor(spanDays / s) + 1 <= maxTicks) {
      step = s;
      break;
    }
  }
  let key: DateKey = step >= 7 ? startOfWeekKey(first, locale) : first;
  if (diffDays(key, first) > 0) key = addDaysToKey(key, step);
  if (diffDays(first, key) < 0) key = addDaysToKey(key, step);
  const out: TimeTick[] = [];
  for (let guard = 0; guard < 64 && diffDays(key, last) >= 0; guard++) {
    out.push({ ms: wallClockToUtc(key, 0, timeZone).getTime(), key });
    key = addDaysToKey(key, step);
  }
  return out;
}
