import { addDaysToKey, utcToZoned, wallClockToUtc, weekdayOfKey, type DateKey } from '@/lib/time';
import {
  isLiveStatus,
  type BookingLike,
  type GenerateSlotsInput,
  type SchedulingSettings,
  type Slot,
  type SlotState,
  type TileSlot,
} from './types';

const MS_MINUTE = 60_000;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;
/** Guard: never tile more than this many days in one call. */
const MAX_SPAN_DAYS = 400;

export interface TileInput {
  rules: GenerateSlotsInput['rules'];
  timeOff: GenerateSlotsInput['timeOff'];
  settings: SchedulingSettings;
  from: Date;
  to: Date;
}

/**
 * Tile every active availability window in `slotMinutes + bufferMinutes` steps, in the coach's wall
 * clock, and return the slots that START in [from, to). The buffer sits between sessions: the last
 * slot of a window may end exactly at the window's end. Slots overlapping a TimeOff range are kept
 * but flagged (`timeOff: true`) so the coach's grid can show them as blocked; generateSlots drops them.
 */
export function tileWindows({ rules, timeOff, settings, from, to }: TileInput): TileSlot[] {
  const { timezone, slotMinutes, bufferMinutes } = settings;
  const step = slotMinutes + Math.max(0, bufferMinutes);
  if (!(slotMinutes > 0) || !(step > 0) || !(to.getTime() > from.getTime())) return [];

  const active = rules.filter((r) => r.active && r.endMinute - r.startMinute >= slotMinutes);
  if (active.length === 0) return [];

  const firstKey = utcToZoned(from, timezone).dateKey;
  const lastKey = utcToZoned(new Date(to.getTime() - 1), timezone).dateKey;

  const out = new Map<number, TileSlot>();
  let key: DateKey = firstKey;
  for (let i = 0; i <= MAX_SPAN_DAYS && key <= lastKey; i++, key = addDaysToKey(key, 1)) {
    const weekday = weekdayOfKey(key);
    for (const rule of active) {
      if (rule.weekday !== weekday) continue;
      for (let m = rule.startMinute; m + slotMinutes <= rule.endMinute; m += step) {
        const startsAt = wallClockToUtc(key, m, timezone);
        const t = startsAt.getTime();
        if (t < from.getTime() || t >= to.getTime() || out.has(t)) continue;
        const endsAt = new Date(t + slotMinutes * MS_MINUTE);
        out.set(t, { startsAt, endsAt, timeOff: false });
      }
    }
  }

  const slots = [...out.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  for (const slot of slots) {
    slot.timeOff = timeOff.some(
      (off) => slot.startsAt.getTime() < off.endsAt.getTime() && slot.endsAt.getTime() > off.startsAt.getTime(),
    );
  }
  return slots;
}

function bookingEnd(b: BookingLike, slotMinutes: number): number {
  return (b.endsAt ?? new Date(b.startsAt.getTime() + slotMinutes * MS_MINUTE)).getTime();
}

/**
 * The slots a viewer sees between `from` and `to`:
 *
 *   mine-pending / mine-confirmed  the viewer's own live booking holds it (wins over everything)
 *   past                           it starts before `now`
 *   taken                          someone else's PENDING / CONFIRMED booking overlaps it
 *   too-soon                       it starts before now + minNoticeHours (client audience only)
 *   open                           bookable
 *
 * Nothing is returned beyond now + horizonDays (client audience), and time-off slots are removed.
 * A booking blocks a slot when it OVERLAPS it, not only when it starts at the same instant, so a
 * change of slot length can never lead to a double booking. COMPLETED / NO_SHOW / CANCELLED
 * bookings do not hold slots.
 */
export function generateSlots(input: GenerateSlotsInput): Slot[] {
  const { rules, timeOff, bookings, settings, from, to, now, viewerId = null, audience = 'client' } = input;
  const nowMs = now.getTime();
  const noticeEnd = nowMs + settings.minNoticeHours * MS_HOUR;
  const horizonEnd = nowMs + settings.horizonDays * MS_DAY;

  const live = bookings.filter((b) => isLiveStatus(b.status));
  const slotMinutes = settings.slotMinutes;

  const slots: Slot[] = [];
  for (const tile of tileWindows({ rules, timeOff, settings, from, to })) {
    if (tile.timeOff) continue;
    const start = tile.startsAt.getTime();
    const end = tile.endsAt.getTime();
    if (audience === 'client' && start > horizonEnd) continue;

    const holders = live.filter((b) => b.startsAt.getTime() < end && bookingEnd(b, slotMinutes) > start);
    // prefer the booking that starts exactly here when several overlap
    holders.sort(
      (a, b) =>
        Math.abs(a.startsAt.getTime() - start) - Math.abs(b.startsAt.getTime() - start),
    );
    const mine = viewerId ? holders.find((b) => b.clientId === viewerId) : undefined;
    const holder = mine ?? holders[0];

    let state: SlotState;
    if (mine) state = mine.status === 'CONFIRMED' ? 'mine-confirmed' : 'mine-pending';
    else if (start < nowMs) state = 'past';
    else if (holder) state = 'taken';
    else if (audience === 'client' && start < noticeEnd) state = 'too-soon';
    else state = 'open';

    const slot: Slot = { startsAt: tile.startsAt, endsAt: tile.endsAt, state };
    if (holder?.id) slot.bookingId = holder.id;
    slots.push(slot);
  }
  return slots;
}

/** Why a requested start is not bookable, or null when it is open. Used by the server actions. */
export type SlotRefusal = 'notAvailable' | 'outsideHorizon' | 'past' | 'tooSoon' | 'taken';

export function checkSlotBookable(input: GenerateSlotsInput & { startsAt: Date }): SlotRefusal | null {
  const { startsAt, settings, now, audience = 'client' } = input;
  const slots = generateSlots({
    ...input,
    from: startsAt,
    to: new Date(startsAt.getTime() + 1),
  });
  const slot = slots.find((s) => s.startsAt.getTime() === startsAt.getTime());
  if (!slot) {
    const beyond = startsAt.getTime() > now.getTime() + settings.horizonDays * MS_DAY;
    return audience === 'client' && beyond ? 'outsideHorizon' : 'notAvailable';
  }
  switch (slot.state) {
    case 'open':
      return null;
    case 'past':
      return 'past';
    case 'too-soon':
      return 'tooSoon';
    default:
      return 'taken'; // taken, or already one of the viewer's own bookings
  }
}
