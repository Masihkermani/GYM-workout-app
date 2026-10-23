/**
 * Digit and decimal-separator normalisation.
 *
 * A Persian keyboard user typing `۳۰` or `۲٫۵` must get 30 / 2.5. Everything that parses a user-typed
 * number goes through here first. Pure functions, safe on server and client.
 */

const PERSIAN_ZERO = 0x06f0; // ۰
const ARABIC_ZERO = 0x0660; // ٠

/** Characters that are invisible formatting noise inside a typed number. */
const NOISE = /[\s‌‍‎‏‪-‮⁦-⁩ ]/g;

/** Replace Persian (۰-۹) and Arabic-Indic (٠-٩) digits with Latin 0-9. Leaves everything else alone. */
export function toLatinDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    if (code >= PERSIAN_ZERO && code <= PERSIAN_ZERO + 9) out += String(code - PERSIAN_ZERO);
    else if (code >= ARABIC_ZERO && code <= ARABIC_ZERO + 9) out += String(code - ARABIC_ZERO);
    else out += ch;
  }
  return out;
}

/** Replace Latin digits with Persian digits (display only). */
export function toPersianDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => String.fromCharCode(PERSIAN_ZERO + Number(d)));
}

/**
 * Normalise a typed number string:
 *  - Persian / Arabic-Indic digits -> Latin
 *  - decimal separators `٫` (U+066B), `,`, `،` (U+060C) and `.` -> `.`
 *  - Arabic thousands separator `٬` (U+066C) is dropped
 *  - Unicode minus signs -> `-`
 *  - whitespace, ZWNJ and bidi marks are removed
 * It does not validate; use parseDecimal / parseInteger for that.
 */
export function normalizeNumberString(input: string): string {
  return toLatinDigits(input)
    .replace(NOISE, '')
    .replace(/٬/g, '')
    .replace(/[٫،,]/g, '.')
    .replace(/[−‒–—]/g, '-');
}

const DECIMAL_RE = /^-?(\d+(\.\d*)?|\.\d+)$/;
const INTEGER_RE = /^-?\d+$/;

/** Parse a user-typed decimal. Returns null on empty input or garbage (`"1.2.3"`, `"30kg"`, `"abc"`). */
export function parseDecimal(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = normalizeNumberString(input);
  if (!s || !DECIMAL_RE.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Parse a user-typed whole number. `"3.0"`, `"3.5"`, `"x"` and empty input all return null. */
export function parseInteger(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = normalizeNumberString(input);
  if (!s || !INTEGER_RE.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** Keep only digits (Latin after normalisation). Useful for codes and phone fragments. */
export function digitsOnly(input: string): string {
  return toLatinDigits(input).replace(/\D/g, '');
}

/**
 * Localise a normalised number string for display inside an input, character for character
 * (so the caret does not jump): digits become Persian and `.` becomes `٫` when locale is `fa`.
 */
export function localizeNumberString(input: string, locale: string): string {
  if (locale !== 'fa') return input;
  return toPersianDigits(input).replace(/\./g, '٫');
}
