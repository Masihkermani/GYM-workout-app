import { z } from 'zod';

/**
 * The instant a booking starts, as epoch milliseconds from the client. It must be a real, plausible date:
 * from a day ago (the coach may log or move a session that just happened) to 400 days ahead (the booking
 * horizon is at most 180). Anything else used to reach `new Date(startsAt + slot)` as an Invalid Date and
 * crash the request (security review F11).
 *
 * The bounds are read on every parse, never captured at module load, so a long-running server keeps a
 * sliding window.
 */
export const STARTS_AT_PAST_MS = 24 * 3_600_000;
export const STARTS_AT_FUTURE_MS = 400 * 24 * 3_600_000;

export const startsAtSchema = z
  .number()
  .int()
  .refine((ms) => {
    const now = Date.now();
    return ms >= now - STARTS_AT_PAST_MS && ms <= now + STARTS_AT_FUTURE_MS;
  });
