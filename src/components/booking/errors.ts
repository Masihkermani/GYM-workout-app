import type { BookingErrorCode } from '@/lib/scheduling';

/**
 * Message key of a booking error for a COACH screen. Most `booking.errors.*` are worded neutrally
 * (no «تو», no «شما») because both audiences read them; the ones that tell the reader what to do
 * next have a coach twin in the formal register (`errors.<code>Coach`).
 */
export type CoachBookingErrorKey = `errors.${BookingErrorCode}` | 'errors.notAllowedCoach';

export function coachErrorKey(code: BookingErrorCode): CoachBookingErrorKey {
  return code === 'notAllowed' ? 'errors.notAllowedCoach' : `errors.${code}`;
}
