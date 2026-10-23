import { digitsOnly, toLatinDigits, toPersianDigits } from '@/lib/digits';
import { normalizePersianText } from '@/lib/validation';

/**
 * Search folding shared by the clients list (in memory) and the exercise library (database query).
 * A coach types «علیرضا» and must find «علی‌رضا»; «٣٠» and «۳۰» and «30» are the same thing.
 */

// ZWNJ / ZWJ, bidi marks, Arabic diacritics and tatweel carry no meaning for matching.
const INVISIBLE = /[\u200c\u200d\u200e\u200f\u202a-\u202e\u2066-\u2069\u064b-\u065f\u0640]/g;

/** Lower-case, Persian ی/ک, Latin digits, no ZWNJ/diacritics and no spaces: a comparison key. */
export function foldText(input: string): string {
  return toLatinDigits(normalizePersianText(input))
    .replace(INVISIBLE, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** Search tokens: whitespace separated, folded for the typography only (spaces kept apart). */
export function searchTokens(input: string, max = 6): string[] {
  return toLatinDigits(normalizePersianText(input))
    .replace(INVISIBLE, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max);
}

/** Spellings of one token to try against stored text (Latin and Persian digits). */
export function tokenVariants(token: string): string[] {
  const latin = toLatinDigits(token);
  return Array.from(new Set([latin, toPersianDigits(latin)]));
}

/**
 * The digits to look for inside an E.164 phone number: `0912 000` -> `912000`, `+98 912` -> `98912`.
 * Needs at least three digits to avoid matching everyone on «0».
 */
export function phoneNeedle(query: string): string | null {
  let digits = digitsOnly(query);
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.length >= 3 ? digits : null;
}

export interface SearchableClient {
  name: string;
  phone: string;
}

/** Name (any script, ZWNJ tolerant) or phone (any digits, national or international). */
export function matchesClient(client: SearchableClient, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const folded = foldText(q);
  if (folded && foldText(client.name).includes(folded)) return true;
  const needle = phoneNeedle(q);
  return needle ? digitsOnly(client.phone).includes(needle) : false;
}
