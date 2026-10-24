/** Highest `?page=` any list will honour; anything beyond it is treated as garbage, not clamped. */
export const MAX_PAGE = 10_000;

/**
 * A `?page=` search parameter -> a page number in [1, MAX_PAGE]. Missing, repeated-to-an-array, negative,
 * fractional, non-numeric, or absurdly large values all become page 1, so a hand-typed URL can neither
 * crash the query (Prisma rejects an `skip` beyond a 32-bit int) nor ask the database to skip millions of rows.
 */
export function parsePage(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{1,5}$/.test(value)) return 1;
  const page = Number(value);
  return page >= 1 && page <= MAX_PAGE ? page : 1;
}
