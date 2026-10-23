const ORDINALS_FA = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم'];
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** «روز دوم» / "Day 2": the title a new program day starts with. */
export function defaultDayTitle(n: number, locale: string): string {
  if (locale !== 'fa') return `Day ${n}`;
  if (n >= 1 && n <= ORDINALS_FA.length) return `روز ${ORDINALS_FA[n - 1]}`;
  return `روز ${String(n).replace(/\d/g, (d) => FA_DIGITS[Number(d)])}`;
}
