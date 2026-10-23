import { formatNumber } from '@/lib/format';
import { clockParts } from '@/lib/training/relative';

/** `5:09` / `1:05:09` with the locale's digits, for timers and elapsed time. */
export function formatClock(totalSeconds: number, locale: string): string {
  const { h, m, s } = clockParts(totalSeconds);
  const two = (n: number) => formatNumber(n, locale, { grouping: false, minIntegerDigits: 2 });
  if (h > 0) return `${formatNumber(h, locale, { grouping: false })}:${two(m)}:${two(s)}`;
  return `${formatNumber(m, locale, { grouping: false })}:${two(s)}`;
}
