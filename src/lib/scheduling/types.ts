/**
 * Scheduling types. Pure and client-safe: no Prisma runtime import, no server-only code.
 * The status strings match the Prisma BookingStatus enum, so a Prisma row is assignable to these.
 */
export type BookingStatusCode = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

/** A booking in one of these statuses holds its slot (the booking_active_slot unique index). */
export const LIVE_STATUSES = ['PENDING', 'CONFIRMED'] as const satisfies readonly BookingStatusCode[];

export function isLiveStatus(status: BookingStatusCode): status is (typeof LIVE_STATUSES)[number] {
  return status === 'PENDING' || status === 'CONFIRMED';
}

/** A client may hold at most this many future live (PENDING / CONFIRMED) bookings. */
export const MAX_LIVE_BOOKINGS = 3;

export type SlotState = 'open' | 'taken' | 'mine-pending' | 'mine-confirmed' | 'past' | 'too-soon';

/** The CoachSettings fields slot generation reads. */
export interface SchedulingSettings {
  timezone: string;
  slotMinutes: number;
  bufferMinutes: number;
  horizonDays: number;
  minNoticeHours: number;
}

/** One recurring weekly window in coach wall-clock minutes (AvailabilityRule). */
export interface AvailabilityWindow {
  /** 0 = Sunday ... 6 = Saturday */
  weekday: number;
  startMinute: number;
  endMinute: number;
  active: boolean;
}

export interface TimeOffRange {
  startsAt: Date;
  endsAt: Date;
}

export interface BookingLike {
  id?: string;
  clientId: string;
  startsAt: Date;
  /** Falls back to startsAt + slotMinutes when omitted. */
  endsAt?: Date;
  status: BookingStatusCode;
}

export interface Slot {
  startsAt: Date;
  endsAt: Date;
  state: SlotState;
  /** The live booking that holds (or overlaps) this slot, if any. For coach-side use; never sent to clients. */
  bookingId?: string;
}

/** A tiled slot before booking/notice states are applied. `timeOff` slots are blocked by a TimeOff range. */
export interface TileSlot {
  startsAt: Date;
  endsAt: Date;
  timeOff: boolean;
}

export interface GenerateSlotsInput {
  rules: readonly AvailabilityWindow[];
  timeOff: readonly TimeOffRange[];
  bookings: readonly BookingLike[];
  settings: SchedulingSettings;
  /** Slots whose startsAt is in [from, to) are returned. */
  from: Date;
  to: Date;
  now: Date;
  /** The signed-in client; their live bookings come back as mine-pending / mine-confirmed. */
  viewerId?: string | null;
  /**
   * 'client' (default) applies the horizon and the minimum notice.
   * 'coach' ignores both (the coach can place a session at short notice or far ahead); past slots stay past.
   */
  audience?: 'client' | 'coach';
}
