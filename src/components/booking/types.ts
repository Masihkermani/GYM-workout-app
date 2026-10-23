/** Shared shapes for the booking UI. Plain data only: safe to pass from server to client components. */

export type CellTone =
  | 'open'
  | 'taken'
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'noshow'
  | 'past'
  | 'soon'
  | 'off';

/** One slot (or booking) in the timetable. Instants are epoch milliseconds. */
export interface TimetableCell {
  key: string;
  startsAt: number;
  endsAt: number;
  tone: CellTone;
  /** Short text inside the cell: the state word, or the client's name on the coach grid. */
  text: string;
  /** Full accessible name: day, time and state. */
  label: string;
  /** Opens something when pressed; other cells are aria-disabled. */
  interactive: boolean;
  /** Coach grid: the booking shown here. */
  bookingId?: string;
  /** Coach grid: this booking is outside the current availability. */
  offGrid?: boolean;
}

export interface CoachContact {
  name: string;
  phone: string | null;
}

/** Everything the cancel-policy copy needs. */
export interface PolicyInfo {
  cancelWindowHours: number;
  requireApproval: boolean;
  slotMinutes: number;
}

/** A booking as the coach's schedule sheet needs it. Only ever built on the coach pages. */
export interface CoachBookingDTO {
  id: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';
  startsAt: number;
  endsAt: number;
  clientNote: string | null;
  coachNote: string | null;
  /** The session has begun (evaluated when the page rendered). */
  started: boolean;
}

export interface WindowDTO {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  active: boolean;
}

export interface TimeOffDTO {
  id: string;
  /** Inclusive first / last calendar day in the coach timezone, as YYYY-MM-DD. */
  startDate: string;
  endDate: string;
  reason: string | null;
}
