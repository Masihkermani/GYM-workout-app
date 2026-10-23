/**
 * Stable error codes returned by the booking server actions. The client translates them with
 * t(`errors.<code>`) from messages/<locale>/booking.json, so one action serves both languages.
 */
export const BOOKING_ERROR_CODES = [
  'generic',
  'invalid',
  'forbidden',
  'notFound',
  'clientNotFound',
  // slots
  'slotTaken',
  'slotUnavailable',
  'slotPast',
  'tooSoon',
  'outsideHorizon',
  'tooManyBookings',
  // transitions
  'notAllowed',
  'cancelWindow',
  'notStarted',
  'sameSlot',
  // availability / time off
  'invalidTime',
  'endBeforeStart',
  'tooShort',
  'overlap',
  'rangeInvalid',
] as const;

export type BookingErrorCode = (typeof BOOKING_ERROR_CODES)[number];

export type ActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: BookingErrorCode };
