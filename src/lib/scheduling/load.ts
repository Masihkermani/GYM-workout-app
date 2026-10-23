import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getCoachSettings, type CoachSettingsData } from '@/lib/settings';
import { generateSlots } from './generate';
import {
  LIVE_STATUSES,
  type AvailabilityWindow,
  type BookingLike,
  type BookingStatusCode,
  type TimeOffRange,
} from './types';

/** Either the shared client or an interactive-transaction client. */
export type Db = Prisma.TransactionClient | typeof prisma;

export interface AvailabilityRuleRow extends AvailabilityWindow {
  id: string;
}

export async function loadRules(db: Db = prisma): Promise<AvailabilityRuleRow[]> {
  return db.availabilityRule.findMany({
    orderBy: [{ weekday: 'asc' }, { startMinute: 'asc' }],
    select: { id: true, weekday: true, startMinute: true, endMinute: true, active: true },
  });
}

export interface TimeOffRow extends TimeOffRange {
  id: string;
  reason: string | null;
}

/** Time-off ranges overlapping [from, to). */
export async function loadTimeOff(from: Date, to: Date, db: Db = prisma): Promise<TimeOffRow[]> {
  return db.timeOff.findMany({
    where: { startsAt: { lt: to }, endsAt: { gt: from } },
    orderBy: { startsAt: 'asc' },
    select: { id: true, startsAt: true, endsAt: true, reason: true },
  });
}

/** Bookings overlapping [from, to) in the given statuses (default: the live ones that hold slots). */
export async function loadBookingsOverlapping(
  from: Date,
  to: Date,
  statuses: readonly BookingStatusCode[] = LIVE_STATUSES,
  db: Db = prisma,
): Promise<(BookingLike & { id: string; endsAt: Date })[]> {
  return db.booking.findMany({
    where: { startsAt: { lt: to }, endsAt: { gt: from }, status: { in: [...statuses] } },
    orderBy: { startsAt: 'asc' },
    select: { id: true, clientId: true, startsAt: true, endsAt: true, status: true },
  });
}

export interface SchedulingData {
  settings: CoachSettingsData;
  rules: AvailabilityRuleRow[];
  timeOff: TimeOffRow[];
  bookings: (BookingLike & { id: string; endsAt: Date })[];
}

/** Everything generateSlots needs for [from, to). */
export async function loadSchedulingData(
  from: Date,
  to: Date,
  opts: { statuses?: readonly BookingStatusCode[]; db?: Db } = {},
): Promise<SchedulingData> {
  const db = opts.db ?? prisma;
  const [settings, rules, timeOff, bookings] = await Promise.all([
    getCoachSettings(),
    loadRules(db),
    loadTimeOff(from, to, db),
    loadBookingsOverlapping(from, to, opts.statuses, db),
  ]);
  return { settings, rules, timeOff, bookings };
}

/** The coach's public contact: shown to a client who is inside the cancel window. */
export async function getCoachContact(): Promise<{ name: string; phone: string | null }> {
  const coach = await prisma.user.findFirst({
    where: { role: 'COACH', active: true },
    orderBy: { createdAt: 'asc' },
    select: { name: true, phone: true },
  });
  return { name: coach?.name ?? '', phone: coach?.phone ?? null };
}

/**
 * Future live bookings that no longer sit on a slot of the current availability (a window was removed
 * or shortened, or time off was added). They are never auto-cancelled; the coach is told to review them.
 */
export async function countOffGridBookings(now: Date = new Date(), db: Db = prisma): Promise<number> {
  const future = await db.booking.findMany({
    where: { status: { in: [...LIVE_STATUSES] }, startsAt: { gt: now } },
    select: { startsAt: true },
    orderBy: { startsAt: 'asc' },
    take: 300,
  });
  if (future.length === 0) return 0;
  const from = future[0].startsAt;
  const to = new Date(future[future.length - 1].startsAt.getTime() + 1);
  const [settings, rules, timeOff] = await Promise.all([getCoachSettings(), loadRules(db), loadTimeOff(from, to, db)]);
  const tiles = new Set(
    generateSlots({ rules, timeOff, bookings: [], settings, from, to, now, audience: 'coach' }).map((s) =>
      s.startsAt.getTime(),
    ),
  );
  return future.filter((b) => !tiles.has(b.startsAt.getTime())).length;
}
