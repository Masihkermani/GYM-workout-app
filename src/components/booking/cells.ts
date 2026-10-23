import 'server-only';
import { getTranslations } from 'next-intl/server';
import type { BookingStatusCode, Slot, TileSlot } from '@/lib/scheduling';
import { longDate, timeRange } from './dates';
import type { CellTone, TimetableCell } from './types';

/** `Saturday, 24 October 2026, 17:00 – 18:00` */
function when(startsAt: Date, endsAt: Date, locale: string, timeZone: string): string {
  return `${longDate(startsAt, locale, timeZone)}, ${timeRange(startsAt, endsAt, locale, timeZone)}`;
}

/** The client's timetable: one cell per slot, words and accessible names in the viewer's language. */
export async function buildClientCells(opts: {
  slots: Slot[];
  locale: string;
  timeZone: string;
}): Promise<TimetableCell[]> {
  const { slots, locale, timeZone } = opts;
  const t = await getTranslations({ locale, namespace: 'booking' });

  const TONE: Record<Slot['state'], CellTone> = {
    open: 'open',
    taken: 'taken',
    'mine-pending': 'pending',
    'mine-confirmed': 'confirmed',
    past: 'past',
    'too-soon': 'soon',
  };
  const TEXT = {
    open: t('slot.text.open'),
    taken: t('slot.text.taken'),
    'mine-pending': t('slot.text.pending'),
    'mine-confirmed': t('slot.text.confirmed'),
    past: '',
    'too-soon': t('slot.text.soon'),
  } as const;
  const ARIA = {
    open: t('slot.aria.open'),
    taken: t('slot.aria.taken'),
    'mine-pending': t('slot.aria.pending'),
    'mine-confirmed': t('slot.aria.confirmed'),
    past: t('slot.aria.past'),
    'too-soon': t('slot.aria.soon'),
  } as const;

  return slots.map((slot) => ({
    key: String(slot.startsAt.getTime()),
    startsAt: slot.startsAt.getTime(),
    endsAt: slot.endsAt.getTime(),
    tone: TONE[slot.state],
    text: TEXT[slot.state],
    label: `${when(slot.startsAt, slot.endsAt, locale, timeZone)}. ${ARIA[slot.state]}`,
    // your own sessions open a read-only sheet; open slots open the booking sheet
    interactive: slot.state === 'open' || slot.state === 'mine-pending' || slot.state === 'mine-confirmed',
  }));
}

export interface CoachBookingRow {
  id: string;
  clientId: string;
  clientName: string;
  status: BookingStatusCode;
  startsAt: Date;
  endsAt: Date;
}

const STATUS_TONE: Partial<Record<BookingStatusCode, CellTone>> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  COMPLETED: 'completed',
  NO_SHOW: 'noshow',
};

/**
 * The coach's week: every availability tile with its booking laid over it (client names visible),
 * plus bookings that sit outside the current availability (shown at their own time, flagged).
 * `bookings` must not include CANCELLED rows.
 */
export async function buildCoachCells(opts: {
  tiles: TileSlot[];
  bookings: CoachBookingRow[];
  locale: string;
  timeZone: string;
  now: Date;
}): Promise<TimetableCell[]> {
  const { tiles, bookings, locale, timeZone, now } = opts;
  const [t, tc] = await Promise.all([
    getTranslations({ locale, namespace: 'booking' }),
    getTranslations({ locale, namespace: 'common' }),
  ]);
  // coach wording (never "your session"): awaiting confirmation / confirmed / done / no-show
  const statusWord: Record<BookingStatusCode, string> = {
    PENDING: t('legend.awaiting'),
    CONFIRMED: t('legend.confirmedCoach'),
    CANCELLED: tc('status.cancelled'),
    COMPLETED: t('legend.completed'),
    NO_SHOW: t('legend.noShow'),
  };

  const cells: TimetableCell[] = [];
  const placed = new Set<string>();

  const bookingCell = (b: CoachBookingRow, offGrid: boolean): TimetableCell => ({
    key: `b-${b.id}`,
    startsAt: b.startsAt.getTime(),
    endsAt: b.endsAt.getTime(),
    tone: STATUS_TONE[b.status] ?? 'taken',
    text: b.clientName,
    label:
      `${when(b.startsAt, b.endsAt, locale, timeZone)}. ${b.clientName}, ${statusWord[b.status]}.` +
      (offGrid ? ` ${t('coach.aria.offGrid')}` : '') +
      ` ${t('coach.aria.details')}`,
    interactive: true,
    bookingId: b.id,
    offGrid,
  });

  for (const tile of tiles) {
    const start = tile.startsAt.getTime();
    const end = tile.endsAt.getTime();
    const overlapping = bookings.filter((b) => b.startsAt.getTime() < end && b.endsAt.getTime() > start);
    const exact = overlapping.find((b) => b.startsAt.getTime() === start);

    if (exact) {
      cells.push(bookingCell(exact, false));
      placed.add(exact.id);
      continue;
    }
    // a misaligned booking covers this tile: it is drawn at its own time below
    if (overlapping.length > 0) continue;

    const base = {
      key: `s-${start}`,
      startsAt: start,
      endsAt: end,
    };
    const whenText = when(tile.startsAt, tile.endsAt, locale, timeZone);
    if (tile.timeOff) {
      cells.push({ ...base, tone: 'off', text: t('coach.cell.off'), label: `${whenText}. ${t('coach.aria.off')}`, interactive: false });
    } else if (start < now.getTime()) {
      cells.push({ ...base, tone: 'past', text: '', label: `${whenText}. ${t('slot.aria.past')}`, interactive: false });
    } else {
      cells.push({
        ...base,
        tone: 'open',
        text: t('slot.text.open'),
        label: `${whenText}. ${t('coach.aria.open')}`,
        interactive: true,
      });
    }
  }

  for (const b of bookings) {
    if (!placed.has(b.id)) cells.push(bookingCell(b, true));
  }
  return cells.sort((a, b) => a.startsAt - b.startsAt);
}

