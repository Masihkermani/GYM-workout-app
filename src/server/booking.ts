'use server';

import { Prisma, type BookingStatus } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireCoach, requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getCoachSettings } from '@/lib/settings';
import {
  LIVE_STATUSES,
  MAX_LIVE_BOOKINGS,
  checkSlotBookable,
  clientCancelState,
  validateWindow,
  type ActionResult,
  type BookingErrorCode,
  type SlotRefusal,
} from '@/lib/scheduling';
import { countOffGridBookings, loadRules, loadSchedulingData } from '@/lib/scheduling/load';
import { addDaysToKey, diffDays, wallClockToUtc } from '@/lib/time';

/**
 * Booking server actions. Every action: validates its payload with zod, re-checks the session
 * (requireUser / requireCoach), checks ownership, re-validates the slot against generateSlots and
 * maps the unique-index race (Prisma P2002 on booking_active_slot) to a friendly "just taken" error.
 * Errors are stable codes (see BookingErrorCode); the UI translates them.
 */

const MS_MINUTE = 60_000;
const LIVE = [...LIVE_STATUSES] as BookingStatus[];

// ---------------------------------------------------------------------------------------------
// shared helpers (module-private: a "use server" file may only export async functions)
// ---------------------------------------------------------------------------------------------

const fail = (error: BookingErrorCode): { ok: false; error: BookingErrorCode } => ({ ok: false, error });

const idSchema = z.string().min(1).max(64);
const localeSchema = z.enum(['fa', 'en']);
const startsAtSchema = z.number().int().min(0).max(8_640_000_000_000_000);
const noteSchema = z.string().max(500).optional().nullable();
const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Arabic yeh / kaf -> Persian, tidy newlines, empty -> null. */
function cleanNote(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s || null;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

const REFUSAL_TO_ERROR: Record<SlotRefusal, BookingErrorCode> = {
  notAvailable: 'slotUnavailable',
  outsideHorizon: 'outsideHorizon',
  past: 'slotPast',
  tooSoon: 'tooSoon',
  taken: 'slotTaken',
};

/** Pages that show bookings; patterns so both locales and every client page refresh. */
function revalidateBookingPages() {
  for (const path of [
    '/[locale]/app',
    '/[locale]/app/book',
    '/[locale]/app/bookings',
    '/[locale]/coach',
    '/[locale]/coach/schedule',
    '/[locale]/coach/clients/[id]',
  ]) {
    revalidatePath(path, 'page');
  }
}

/** Is `startsAt` a bookable slot right now for this audience? Returns an error code or null. */
async function slotError(opts: {
  startsAt: Date;
  audience: 'client' | 'coach';
  viewerId?: string | null;
  ignoreBookingId?: string;
  db?: Prisma.TransactionClient;
}): Promise<BookingErrorCode | null> {
  const { startsAt, audience, viewerId = null, ignoreBookingId, db } = opts;
  const now = new Date();
  const settings = await getCoachSettings();
  const to = new Date(startsAt.getTime() + settings.slotMinutes * MS_MINUTE);
  const data = await loadSchedulingData(startsAt, to, { db });
  const refusal = checkSlotBookable({
    rules: data.rules,
    timeOff: data.timeOff,
    bookings: ignoreBookingId ? data.bookings.filter((b) => b.id !== ignoreBookingId) : data.bookings,
    settings,
    from: startsAt,
    to,
    now,
    viewerId,
    audience,
    startsAt,
  });
  return refusal ? REFUSAL_TO_ERROR[refusal] : null;
}

// ---------------------------------------------------------------------------------------------
// client actions
// ---------------------------------------------------------------------------------------------

const createSchema = z.object({ locale: localeSchema, startsAt: startsAtSchema, note: noteSchema });

export interface CreatedBooking {
  bookingId: string;
  status: 'PENDING' | 'CONFIRMED';
  startsAt: number;
  endsAt: number;
}

/**
 * A client books a slot. Re-validated against generateSlots (notice, horizon, availability, time off,
 * taken), capped at MAX_LIVE_BOOKINGS future live bookings (serialised per client with an advisory
 * lock so two tabs cannot both slip in a fourth), PENDING when the coach requires approval.
 */
export async function createBooking(raw: {
  locale: string;
  startsAt: number;
  note?: string | null;
}): Promise<ActionResult<CreatedBooking>> {
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const { locale, startsAt: startsAtMs, note } = parsed.data;

  const user = await requireUser(locale);
  if (user.role !== 'CLIENT') return fail('forbidden');

  const settings = await getCoachSettings();
  const startsAt = new Date(startsAtMs);
  const endsAt = new Date(startsAtMs + settings.slotMinutes * MS_MINUTE);
  const now = new Date();

  try {
    const result = await prisma.$transaction(async (tx) => {
      // one booking decision per client at a time
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;

      const liveCount = await tx.booking.count({
        where: { clientId: user.id, status: { in: LIVE }, startsAt: { gt: now } },
      });
      if (liveCount >= MAX_LIVE_BOOKINGS) return fail('tooManyBookings');

      const error = await slotError({ startsAt, audience: 'client', viewerId: user.id, db: tx });
      if (error) return fail(error);

      const booking = await tx.booking.create({
        data: {
          clientId: user.id,
          startsAt,
          endsAt,
          status: settings.requireApproval ? 'PENDING' : 'CONFIRMED',
          clientNote: cleanNote(note),
        },
        select: { id: true, status: true },
      });
      return {
        ok: true as const,
        bookingId: booking.id,
        status: booking.status as 'PENDING' | 'CONFIRMED',
        startsAt: startsAtMs,
        endsAt: endsAt.getTime(),
      };
    });
    if (result.ok) revalidateBookingPages();
    return result;
  } catch (e) {
    if (isUniqueViolation(e)) return fail('slotTaken'); // lost the race on booking_active_slot
    throw e;
  }
}

const bookingIdSchema = z.object({ locale: localeSchema, bookingId: idSchema });

/**
 * A client withdraws a PENDING request (any time) or cancels a CONFIRMED booking (until
 * `startsAt - cancelWindowHours`). Inside the window the UI shows the coach's contact instead of a
 * Cancel button; this check is the authority.
 */
export async function cancelBooking(raw: { locale: string; bookingId: string }): Promise<ActionResult> {
  const parsed = bookingIdSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const { locale, bookingId } = parsed.data;

  const user = await requireUser(locale);
  if (user.role !== 'CLIENT') return fail('forbidden');

  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, clientId: user.id },
    select: { id: true, status: true, startsAt: true },
  });
  if (!booking) return fail('notFound');

  const settings = await getCoachSettings();
  const state = clientCancelState(booking, settings.cancelWindowHours, new Date());
  if (state === 'final') return fail('notAllowed');
  if (state === 'late') return fail('cancelWindow');

  const { count } = await prisma.booking.updateMany({
    where: { id: booking.id, clientId: user.id, status: { in: LIVE } },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByCoach: false },
  });
  if (count === 0) return fail('notAllowed'); // changed under us (the coach acted first)
  revalidateBookingPages();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// coach: booking lifecycle
// ---------------------------------------------------------------------------------------------

/** PENDING -> CONFIRMED. */
export async function confirmBooking(raw: { locale: string; bookingId: string }): Promise<ActionResult> {
  const parsed = bookingIdSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  await requireCoach(parsed.data.locale);

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    select: { status: true, endsAt: true },
  });
  if (!booking) return fail('notFound');
  if (booking.status !== 'PENDING' || booking.endsAt.getTime() <= Date.now()) return fail('notAllowed');

  const { count } = await prisma.booking.updateMany({
    where: { id: parsed.data.bookingId, status: 'PENDING' },
    data: { status: 'CONFIRMED' },
  });
  if (count === 0) return fail('notAllowed');
  revalidateBookingPages();
  return { ok: true };
}

/** PENDING / CONFIRMED -> CANCELLED by the coach (a declined request, or a confirmed session called off). */
export async function declineBooking(raw: { locale: string; bookingId: string }): Promise<ActionResult> {
  const parsed = bookingIdSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  await requireCoach(parsed.data.locale);

  const exists = await prisma.booking.findUnique({ where: { id: parsed.data.bookingId }, select: { id: true } });
  if (!exists) return fail('notFound');

  const { count } = await prisma.booking.updateMany({
    where: { id: parsed.data.bookingId, status: { in: LIVE } },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByCoach: true },
  });
  if (count === 0) return fail('notAllowed');
  revalidateBookingPages();
  return { ok: true };
}

async function finishBooking(
  raw: { locale: string; bookingId: string },
  status: 'COMPLETED' | 'NO_SHOW',
): Promise<ActionResult> {
  const parsed = bookingIdSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  await requireCoach(parsed.data.locale);

  const booking = await prisma.booking.findUnique({
    where: { id: parsed.data.bookingId },
    select: { status: true, startsAt: true },
  });
  if (!booking) return fail('notFound');
  if (booking.status === 'CANCELLED') return fail('notAllowed');
  if (booking.startsAt.getTime() > Date.now()) return fail('notStarted');

  // COMPLETED <-> NO_SHOW is allowed so a mis-tap can be corrected
  await prisma.booking.updateMany({
    where: { id: parsed.data.bookingId, status: { in: ['PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW'] } },
    data: { status },
  });
  revalidateBookingPages();
  return { ok: true };
}

/** The session happened. Only once it has started. */
export async function markCompleted(raw: { locale: string; bookingId: string }): Promise<ActionResult> {
  return finishBooking(raw, 'COMPLETED');
}

/** The client did not show up. Only once the session has started. */
export async function markNoShow(raw: { locale: string; bookingId: string }): Promise<ActionResult> {
  return finishBooking(raw, 'NO_SHOW');
}

const coachNoteSchema = z.object({ locale: localeSchema, bookingId: idSchema, note: z.string().max(1000) });

/** The coach's note on a session. The client sees it with the session in their history (the seed writes them as feedback), so the coach UI says so. */
export async function setCoachNote(raw: { locale: string; bookingId: string; note: string }): Promise<ActionResult> {
  const parsed = coachNoteSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  await requireCoach(parsed.data.locale);

  const { count } = await prisma.booking.updateMany({
    where: { id: parsed.data.bookingId },
    data: { coachNote: cleanNote(parsed.data.note) },
  });
  if (count === 0) return fail('notFound');
  revalidateBookingPages();
  return { ok: true };
}

const bookForSchema = z.object({
  locale: localeSchema,
  clientId: idSchema,
  startsAt: startsAtSchema,
  note: noteSchema,
});

/** The coach books a slot for a client. Confirmed straight away; notice, horizon and the 3-booking cap do not apply. */
export async function bookForClient(raw: {
  locale: string;
  clientId: string;
  startsAt: number;
  note?: string | null;
}): Promise<ActionResult<CreatedBooking>> {
  const parsed = bookForSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const { locale, clientId, startsAt: startsAtMs, note } = parsed.data;
  await requireCoach(locale);

  const client = await prisma.user.findFirst({
    where: { id: clientId, role: 'CLIENT', active: true },
    select: { id: true },
  });
  if (!client) return fail('clientNotFound');

  const settings = await getCoachSettings();
  const startsAt = new Date(startsAtMs);
  const endsAt = new Date(startsAtMs + settings.slotMinutes * MS_MINUTE);

  const error = await slotError({ startsAt, audience: 'coach' });
  if (error) return fail(error);

  try {
    const booking = await prisma.booking.create({
      data: { clientId: client.id, startsAt, endsAt, status: 'CONFIRMED', clientNote: cleanNote(note) },
      select: { id: true },
    });
    revalidateBookingPages();
    return { ok: true, bookingId: booking.id, status: 'CONFIRMED', startsAt: startsAtMs, endsAt: endsAt.getTime() };
  } catch (e) {
    if (isUniqueViolation(e)) return fail('slotTaken');
    throw e;
  }
}

const moveSchema = z.object({ locale: localeSchema, bookingId: idSchema, startsAt: startsAtSchema });

/** Move a live booking to another open slot (same client, same status). */
export async function moveBooking(raw: { locale: string; bookingId: string; startsAt: number }): Promise<ActionResult> {
  const parsed = moveSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const { locale, bookingId, startsAt: startsAtMs } = parsed.data;
  await requireCoach(locale);

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, status: true, startsAt: true },
  });
  if (!booking) return fail('notFound');
  if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') return fail('notAllowed');
  if (booking.startsAt.getTime() === startsAtMs) return fail('sameSlot');

  const settings = await getCoachSettings();
  const startsAt = new Date(startsAtMs);
  const endsAt = new Date(startsAtMs + settings.slotMinutes * MS_MINUTE);

  const error = await slotError({ startsAt, audience: 'coach', ignoreBookingId: booking.id });
  if (error) return fail(error);

  try {
    const { count } = await prisma.booking.updateMany({
      where: { id: booking.id, status: { in: LIVE } },
      data: { startsAt, endsAt },
    });
    if (count === 0) return fail('notAllowed');
  } catch (e) {
    if (isUniqueViolation(e)) return fail('slotTaken');
    throw e;
  }
  revalidateBookingPages();
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// coach: availability
// ---------------------------------------------------------------------------------------------

const windowSchema = z.object({
  locale: localeSchema,
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1440),
  endMinute: z.number().int().min(0).max(1440),
});

export interface RuleResult {
  /** Future live bookings that now sit outside the availability (kept, never auto-cancelled). */
  offGrid: number;
}

/** Add a weekly window (coach wall clock). Rejects end <= start, windows shorter than a slot, and overlaps. */
export async function addAvailabilityRule(raw: {
  locale: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}): Promise<ActionResult<RuleResult & { id: string }>> {
  const parsed = windowSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const { locale, weekday, startMinute, endMinute } = parsed.data;
  await requireCoach(locale);

  const [settings, rules] = await Promise.all([getCoachSettings(), loadRules()]);
  const problem = validateWindow(
    { weekday, startMinute, endMinute },
    rules.filter((r) => r.active),
    settings.slotMinutes,
  );
  if (problem) return fail(problem);

  const rule = await prisma.availabilityRule.create({
    data: { weekday, startMinute, endMinute, active: true },
    select: { id: true },
  });
  revalidateBookingPages();
  return { ok: true, id: rule.id, offGrid: await countOffGridBookings() };
}

const updateWindowSchema = windowSchema.omit({ weekday: true }).extend({ id: idSchema });

/** Change a window's start / end. */
export async function updateAvailabilityRule(raw: {
  locale: string;
  id: string;
  startMinute: number;
  endMinute: number;
}): Promise<ActionResult<RuleResult>> {
  const parsed = updateWindowSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const { locale, id, startMinute, endMinute } = parsed.data;
  await requireCoach(locale);

  const existing = await prisma.availabilityRule.findUnique({ where: { id }, select: { weekday: true } });
  if (!existing) return fail('notFound');

  const [settings, rules] = await Promise.all([getCoachSettings(), loadRules()]);
  const problem = validateWindow(
    { id, weekday: existing.weekday, startMinute, endMinute },
    rules.filter((r) => r.active),
    settings.slotMinutes,
  );
  if (problem) return fail(problem);

  await prisma.availabilityRule.update({ where: { id }, data: { startMinute, endMinute } });
  revalidateBookingPages();
  return { ok: true, offGrid: await countOffGridBookings() };
}

const ruleIdSchema = z.object({ locale: localeSchema, id: idSchema });

export async function deleteAvailabilityRule(raw: { locale: string; id: string }): Promise<ActionResult<RuleResult>> {
  const parsed = ruleIdSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  await requireCoach(parsed.data.locale);

  const { count } = await prisma.availabilityRule.deleteMany({ where: { id: parsed.data.id } });
  if (count === 0) return fail('notFound');
  revalidateBookingPages();
  return { ok: true, offGrid: await countOffGridBookings() };
}

// ---------------------------------------------------------------------------------------------
// coach: time off
// ---------------------------------------------------------------------------------------------

const timeOffSchema = z.object({
  locale: localeSchema,
  /** Calendar dates in the coach timezone, inclusive: 'YYYY-MM-DD'. */
  startDate: dateKeySchema,
  endDate: dateKeySchema,
  reason: z.string().max(120).optional().nullable(),
});

const MAX_TIME_OFF_DAYS = 366;

/** Block whole days (start of startDate to the end of endDate in the coach timezone). */
export async function addTimeOff(raw: {
  locale: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
}): Promise<ActionResult<{ id: string; affectedBookings: number }>> {
  const parsed = timeOffSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  const { locale, startDate, endDate, reason } = parsed.data;
  await requireCoach(locale);

  let span: number;
  try {
    span = diffDays(startDate, endDate);
  } catch {
    return fail('invalid');
  }
  if (span < 0 || span >= MAX_TIME_OFF_DAYS) return fail('rangeInvalid');

  const { timezone } = await getCoachSettings();
  const startsAt = wallClockToUtc(startDate, 0, timezone);
  const endsAt = wallClockToUtc(addDaysToKey(endDate, 1), 0, timezone);

  const row = await prisma.timeOff.create({
    data: { startsAt, endsAt, reason: cleanNote(reason) },
    select: { id: true },
  });
  const affectedBookings = await prisma.booking.count({
    where: { status: { in: LIVE }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
  });
  revalidateBookingPages();
  return { ok: true, id: row.id, affectedBookings };
}

export async function deleteTimeOff(raw: { locale: string; id: string }): Promise<ActionResult> {
  const parsed = ruleIdSchema.safeParse(raw);
  if (!parsed.success) return fail('invalid');
  await requireCoach(parsed.data.locale);

  const { count } = await prisma.timeOff.deleteMany({ where: { id: parsed.data.id } });
  if (count === 0) return fail('notFound');
  revalidateBookingPages();
  return { ok: true };
}
