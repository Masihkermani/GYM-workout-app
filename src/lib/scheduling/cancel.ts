import { isLiveStatus, type BookingStatusCode } from './types';

const MS_HOUR = 3_600_000;

/** The last instant a client may still cancel: `cancelWindowHours` before the session starts. */
export function cancelDeadline(startsAt: Date, cancelWindowHours: number): Date {
  return new Date(startsAt.getTime() - Math.max(0, cancelWindowHours) * MS_HOUR);
}

export type CancelState =
  /** The client can cancel (CONFIRMED, outside the window) or withdraw (PENDING, always) right now. */
  | 'allowed'
  /** A CONFIRMED booking inside the cancel window (or already started): show the coach's contact instead. */
  | 'late'
  /** Not a live booking (completed, cancelled, no-show): nothing to cancel. */
  | 'final';

/**
 * Client cancel rule. A PENDING request can be withdrawn at any time: the coach has not committed to it,
 * so the cancel window does not apply. A CONFIRMED booking can be cancelled until
 * `startsAt - cancelWindowHours`, inclusive of that instant; after it the UI shows the coach's contact
 * instead of a Cancel button.
 */
export function clientCancelState(
  booking: { status: BookingStatusCode; startsAt: Date },
  cancelWindowHours: number,
  now: Date,
): CancelState {
  if (!isLiveStatus(booking.status)) return 'final';
  if (booking.status === 'PENDING') return 'allowed';
  return now.getTime() <= cancelDeadline(booking.startsAt, cancelWindowHours).getTime() ? 'allowed' : 'late';
}

export function canClientCancel(
  booking: { status: BookingStatusCode; startsAt: Date },
  cancelWindowHours: number,
  now: Date,
): boolean {
  return clientCancelState(booking, cancelWindowHours, now) === 'allowed';
}
