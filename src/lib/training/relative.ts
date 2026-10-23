const TAGS: Record<string, string> = { fa: 'fa-IR-u-nu-arabext', en: 'en-US' };
const cache = new Map<string, Intl.RelativeTimeFormat>();

function rtf(locale: string): Intl.RelativeTimeFormat {
  const tag = TAGS[locale] ?? TAGS.en;
  let f = cache.get(tag);
  if (!f) {
    f = new Intl.RelativeTimeFormat(tag, { numeric: 'auto', style: 'long' });
    cache.set(tag, f);
  }
  return f;
}

/** "5 minutes ago" / «۵ دقیقه پیش». Past-oriented; anything under a minute is "now". */
export function formatRelative(value: Date | string | number, now: Date | number, locale: string): string {
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const diffSec = Math.round((then - (now instanceof Date ? now.getTime() : now)) / 1000);
  const abs = Math.abs(diffSec);
  const f = rtf(locale);
  if (abs < 45) return f.format(0, 'second');
  if (abs < 45 * 60) return f.format(Math.round(diffSec / 60), 'minute');
  if (abs < 22 * 3600) return f.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 6.5 * 86400) return f.format(Math.round(diffSec / 86400), 'day');
  if (abs < 28 * 86400) return f.format(Math.round(diffSec / (7 * 86400)), 'week');
  return f.format(Math.round(diffSec / (30 * 86400)), 'month');
}

/** `1:05:09` / `45:09` for a number of seconds (digits are localised by the caller via formatClock). */
export function clockParts(totalSeconds: number): { h: number; m: number; s: number } {
  const t = Math.max(0, Math.floor(totalSeconds));
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
