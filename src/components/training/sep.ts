/**
 * Inline separator between short facts. In Persian never a middle dot: the Persian zero is a dot, so
 * «۲ آبان · ۰۹:۰۰» reads as an extra zero. fa uses the Persian comma, en a middle dot.
 */
export const sepFor = (locale: string): string => (locale === 'fa' ? '، ' : ' · ');

/** Join the non-empty parts with the locale's separator. */
export function joinFacts(parts: readonly (string | null | undefined | false)[], locale: string): string {
  return parts.filter((p): p is string => Boolean(p)).join(sepFor(locale));
}
