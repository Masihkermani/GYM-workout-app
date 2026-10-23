/**
 * Weekly opening hours for the landing page, derived from AvailabilityRule rows.
 * Pure (no database, no i18n) so it is unit-tested: rows in, grouped lines out.
 */
export interface RuleLike {
  weekday: number; // 0 = Sunday ... 6 = Saturday
  startMinute: number;
  endMinute: number;
  active: boolean;
}

/** One line of the hours table: consecutive days that share the same windows (none = closed). */
export interface HoursRow {
  /** Weekdays (0 = Sunday) in display order, consecutive. */
  days: number[];
  /** [startMinute, endMinute] windows, sorted and merged. Empty means closed. */
  windows: [number, number][];
}

/** Display order of the week: Saturday first for fa, Monday first for en (docs/DESIGN.md). */
export function weekdayOrder(locale: string): number[] {
  return locale === 'fa' ? [6, 0, 1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 0];
}

/** Sort windows and merge the ones that touch or overlap (07:00-09:00 + 09:00-11:00 -> 07:00-11:00). */
export function mergeWindows(windows: [number, number][]): [number, number][] {
  const sorted = windows
    .filter(([start, end]) => end > start)
    .map(([start, end]) => [start, end] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: [number, number][] = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else out.push(w);
  }
  return out;
}

const signature = (windows: [number, number][]) => windows.map(([a, b]) => `${a}-${b}`).join('|');

export function groupHours(rules: RuleLike[], locale: string): HoursRow[] {
  const byDay = new Map<number, [number, number][]>();
  for (const r of rules) {
    if (!r.active || r.weekday < 0 || r.weekday > 6) continue;
    byDay.set(r.weekday, [...(byDay.get(r.weekday) ?? []), [r.startMinute, r.endMinute]]);
  }
  // Nothing bookable at all: there are no hours to print (the page shows a different line).
  if (![...byDay.values()].some((w) => mergeWindows(w).length > 0)) return [];

  const rows: HoursRow[] = [];
  for (const day of weekdayOrder(locale)) {
    const windows = mergeWindows(byDay.get(day) ?? []);
    const last = rows[rows.length - 1];
    if (last && signature(last.windows) === signature(windows)) last.days.push(day);
    else rows.push({ days: [day], windows });
  }
  return rows;
}
