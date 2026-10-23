import { toLatinDigits, toPersianDigits } from './digits';

/**
 * Phone normalisation to E.164.
 *
 * Accepts `0912…`, `912…`, `+98912…`, `0098912…`, `98912…`, Persian/Arabic digits, spaces, dashes,
 * dots and parentheses and returns `+98912…`. Other `+<country>` numbers are kept as E.164.
 * Returns null when the input cannot be a phone number.
 */
export function normalizePhone(input: string): string | null {
  if (!input) return null;
  // Latin digits, then drop everything except digits and a leading '+'.
  let s = toLatinDigits(input).replace(/[\s\-.()‌‍‎‏‪-‮ ]/g, '');
  if (!s) return null;

  let plus = false;
  if (s.startsWith('+')) {
    plus = true;
    s = s.slice(1);
  } else if (s.startsWith('00')) {
    plus = true;
    s = s.slice(2);
  }
  if (!/^\d+$/.test(s)) return null;

  if (plus) {
    if (s.startsWith('98')) {
      let national = s.slice(2);
      if (national.startsWith('0')) national = national.slice(1); // "+98 0912…" typo
      return /^9\d{9}$/.test(national) ? `+98${national}` : null;
    }
    // Any other country: E.164 is at most 15 digits, never starts with 0.
    return /^[1-9]\d{7,14}$/.test(s) ? `+${s}` : null;
  }

  // Iranian numbers without a '+' / '00' prefix.
  if (/^09\d{9}$/.test(s)) return `+98${s.slice(1)}`; // 0912 123 4567
  if (/^9\d{9}$/.test(s)) return `+98${s}`; // 912 123 4567
  if (/^989\d{9}$/.test(s)) return `+${s}`; // 98912 123 4567
  return null;
}

/** True when the string normalises to a valid phone number. */
export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

/**
 * Display form of an E.164 number. Iranian mobiles are shown nationally (`0912 123 4567`, Persian
 * digits for fa); other numbers keep their `+` form. Always render inside `dir="ltr"`.
 */
export function formatPhone(e164: string, locale: string = 'en'): string {
  // Without a country database we cannot group other countries correctly, so they stay as E.164.
  const m = /^\+98(9\d{2})(\d{3})(\d{4})$/.exec(e164);
  const out = m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
  return locale === 'fa' ? toPersianDigits(out) : out;
}
