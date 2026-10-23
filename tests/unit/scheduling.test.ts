import { describe, expect, it } from 'vitest';
import {
  LIVE_STATUSES,
  MAX_LIVE_BOOKINGS,
  bookableWeekStarts,
  canClientCancel,
  cancelDeadline,
  checkSlotBookable,
  clientCancelState,
  generateSlots,
  parseWeekParam,
  rollingRange,
  tileWindows,
  weekRange,
  type AvailabilityWindow,
  type BookingLike,
  type GenerateSlotsInput,
  type SchedulingSettings,
} from '@/lib/scheduling';
import { wallClockToUtc } from '@/lib/time';

const TZ = 'Asia/Tehran'; // UTC+03:30, no DST
const iso = (d: Date) => d.toISOString();
const at = (key: string, minute: number, tz = TZ) => wallClockToUtc(key, minute, tz);
const hm = (h: number, m = 0) => h * 60 + m;

const settings: SchedulingSettings = {
  timezone: TZ,
  slotMinutes: 60,
  bufferMinutes: 0,
  horizonDays: 21,
  minNoticeHours: 12,
};

/** Seed-like availability: Sat 07-11 + 16-21, Sun 07-11, Thu 08-12. Friday off. */
const rules: AvailabilityWindow[] = [
  { weekday: 6, startMinute: hm(7), endMinute: hm(11), active: true },
  { weekday: 6, startMinute: hm(16), endMinute: hm(21), active: true },
  { weekday: 0, startMinute: hm(7), endMinute: hm(11), active: true },
  { weekday: 4, startMinute: hm(8), endMinute: hm(12), active: true },
];

// 2026-10-23 is a Friday; 2026-10-24 a Saturday.
const NOW = at('2026-10-23', hm(12));

function input(over: Partial<GenerateSlotsInput> = {}): GenerateSlotsInput {
  return {
    rules,
    timeOff: [],
    bookings: [],
    settings,
    from: at('2026-10-24', 0),
    to: at('2026-10-25', 0),
    now: NOW,
    ...over,
  };
}

const starts = (slots: { startsAt: Date }[]) => slots.map((s) => iso(s.startsAt));

describe('tiling in the coach wall clock (Tehran)', () => {
  it('tiles each window in slot-length steps and converts to UTC', () => {
    const slots = generateSlots(input());
    // Saturday 07:00-11:00 and 16:00-21:00 Tehran = 03:30Z-07:30Z and 12:30Z-17:30Z
    expect(starts(slots)).toEqual([
      '2026-10-24T03:30:00.000Z',
      '2026-10-24T04:30:00.000Z',
      '2026-10-24T05:30:00.000Z',
      '2026-10-24T06:30:00.000Z',
      '2026-10-24T12:30:00.000Z',
      '2026-10-24T13:30:00.000Z',
      '2026-10-24T14:30:00.000Z',
      '2026-10-24T15:30:00.000Z',
      '2026-10-24T16:30:00.000Z',
    ]);
    expect(iso(slots[0].endsAt)).toBe('2026-10-24T04:30:00.000Z');
    expect(slots.every((s) => s.state === 'open')).toBe(true);
  });

  it('returns nothing on a day without a rule (Friday off)', () => {
    expect(generateSlots(input({ from: at('2026-10-23', 0), to: at('2026-10-24', 0), now: at('2026-10-20', 0) }))).toEqual([]);
  });

  it('uses the weekday of the coach timezone, not UTC (a late slot stays on its own day)', () => {
    const r: AvailabilityWindow[] = [{ weekday: 6, startMinute: hm(23), endMinute: hm(24), active: true }];
    const slots = generateSlots(
      input({ rules: r, from: at('2026-10-24', 0), to: at('2026-10-26', 0), settings: { ...settings, minNoticeHours: 0 } }),
    );
    expect(starts(slots)).toEqual(['2026-10-24T19:30:00.000Z']);
    expect(iso(slots[0].endsAt)).toBe('2026-10-24T20:30:00.000Z'); // 24:00 local
  });

  it('only returns slots that start inside [from, to)', () => {
    const slots = generateSlots(input({ from: at('2026-10-24', hm(8)), to: at('2026-10-24', hm(10)) }));
    expect(starts(slots)).toEqual(['2026-10-24T04:30:00.000Z', '2026-10-24T05:30:00.000Z']);
  });

  it('is DST-correct for zones that have it', () => {
    const berlin: SchedulingSettings = { ...settings, timezone: 'Europe/Berlin' };
    const monday: AvailabilityWindow[] = [{ weekday: 1, startMinute: hm(9), endMinute: hm(10), active: true }];
    const summer = tileWindows({
      rules: monday,
      timeOff: [],
      settings: berlin,
      from: at('2026-06-29', 0, 'Europe/Berlin'),
      to: at('2026-06-30', 0, 'Europe/Berlin'),
    });
    const winter = tileWindows({
      rules: monday,
      timeOff: [],
      settings: berlin,
      from: at('2026-11-30', 0, 'Europe/Berlin'),
      to: at('2026-12-01', 0, 'Europe/Berlin'),
    });
    expect(iso(summer[0].startsAt)).toBe('2026-06-29T07:00:00.000Z'); // UTC+2
    expect(iso(winter[0].startsAt)).toBe('2026-11-30T08:00:00.000Z'); // UTC+1
  });
});

describe('buffer and slot length', () => {
  const window = (start: number, end: number): AvailabilityWindow[] => [
    { weekday: 6, startMinute: start, endMinute: end, active: true },
  ];
  const day = (r: AvailabilityWindow[], s: SchedulingSettings) =>
    generateSlots(input({ rules: r, settings: s }));

  it('steps by slotMinutes + bufferMinutes', () => {
    const slots = day(window(hm(7), hm(11)), { ...settings, slotMinutes: 45, bufferMinutes: 15 });
    expect(slots.map((s) => (s.startsAt.getTime() - at('2026-10-24', 0).getTime()) / 60_000)).toEqual([
      hm(7),
      hm(8),
      hm(9),
      hm(10),
    ]);
    // each lasts 45 minutes, the 15 minute buffer is empty space between them
    expect((slots[0].endsAt.getTime() - slots[0].startsAt.getTime()) / 60_000).toBe(45);
  });

  it('lets the last slot end exactly at the window end, buffer not required after it', () => {
    expect(day(window(hm(7), hm(7, 45)), { ...settings, slotMinutes: 45, bufferMinutes: 15 })).toHaveLength(1);
  });

  it('drops a slot that would overrun the window by a minute', () => {
    expect(day(window(hm(7), hm(7, 44)), { ...settings, slotMinutes: 45, bufferMinutes: 15 })).toHaveLength(0);
    expect(day(window(hm(7), hm(11)), { ...settings, slotMinutes: 90, bufferMinutes: 0 })).toHaveLength(2);
  });

  it('ignores inactive rules and windows shorter than one slot', () => {
    expect(day([{ weekday: 6, startMinute: hm(7), endMinute: hm(11), active: false }], settings)).toEqual([]);
    expect(day(window(hm(7), hm(7, 30)), settings)).toEqual([]);
  });

  it('de-duplicates overlapping windows instead of double listing a start', () => {
    const slots = day(
      [
        { weekday: 6, startMinute: hm(7), endMinute: hm(10), active: true },
        { weekday: 6, startMinute: hm(8), endMinute: hm(11), active: true },
      ],
      settings,
    );
    expect(new Set(starts(slots)).size).toBe(slots.length);
  });

  it('survives nonsense settings', () => {
    expect(day(rules, { ...settings, slotMinutes: 0 })).toEqual([]);
    expect(day(rules, { ...settings, slotMinutes: -5 })).toEqual([]);
  });
});

describe('time off', () => {
  it('removes every slot a TimeOff range overlaps', () => {
    // 08:30-10:30 Tehran
    const off = [{ startsAt: at('2026-10-24', hm(8, 30)), endsAt: at('2026-10-24', hm(10, 30)) }];
    const slots = generateSlots(input({ timeOff: off, to: at('2026-10-24', hm(12)) }));
    // 07:00 survives (ends 08:00); 08:00, 09:00, 10:00 overlap
    expect(starts(slots)).toEqual(['2026-10-24T03:30:00.000Z']);
  });

  it('treats touching ranges as non-overlapping', () => {
    const off = [{ startsAt: at('2026-10-24', hm(8)), endsAt: at('2026-10-24', hm(9)) }];
    const slots = generateSlots(input({ timeOff: off, to: at('2026-10-24', hm(12)) }));
    expect(starts(slots)).toEqual([
      '2026-10-24T03:30:00.000Z', // 07:00, ends 08:00 = off start
      '2026-10-24T05:30:00.000Z', // 09:00, starts at off end
      '2026-10-24T06:30:00.000Z',
    ]);
  });

  it('a multi-day time off removes whole days', () => {
    const off = [{ startsAt: at('2026-10-24', 0), endsAt: at('2026-10-26', 0) }];
    const slots = generateSlots(input({ timeOff: off, to: at('2026-10-27', 0) }));
    expect(slots).toEqual([]);
  });

  it('tileWindows keeps blocked slots flagged for the coach grid', () => {
    const off = [{ startsAt: at('2026-10-24', hm(8)), endsAt: at('2026-10-24', hm(9)) }];
    const tiles = tileWindows({ rules, timeOff: off, settings, from: at('2026-10-24', 0), to: at('2026-10-24', hm(12)) });
    expect(tiles.map((t) => t.timeOff)).toEqual([false, true, false, false]);
  });
});

describe('slot states', () => {
  const book = (over: Partial<BookingLike> & { startsAt: Date }): BookingLike => ({
    id: 'b1',
    clientId: 'other',
    status: 'CONFIRMED',
    ...over,
  });
  const stateAt = (slots: ReturnType<typeof generateSlots>, minute: number) =>
    slots.find((s) => s.startsAt.getTime() === at('2026-10-24', minute).getTime())?.state;

  it('marks someone else’s live booking as taken (and exposes its id for the coach)', () => {
    const slots = generateSlots(input({ bookings: [book({ startsAt: at('2026-10-24', hm(9)), id: 'x1' })], viewerId: 'me' }));
    expect(stateAt(slots, hm(9))).toBe('taken');
    expect(slots.find((s) => s.state === 'taken')?.bookingId).toBe('x1');
    expect(stateAt(slots, hm(8))).toBe('open');
  });

  it('pending counts as taken too', () => {
    const slots = generateSlots(input({ bookings: [book({ startsAt: at('2026-10-24', hm(9)), status: 'PENDING' })] }));
    expect(stateAt(slots, hm(9))).toBe('taken');
  });

  it('shows the viewer’s own bookings as mine-pending / mine-confirmed', () => {
    const slots = generateSlots(
      input({
        viewerId: 'me',
        bookings: [
          book({ startsAt: at('2026-10-24', hm(8)), clientId: 'me', status: 'PENDING' }),
          book({ startsAt: at('2026-10-24', hm(10)), clientId: 'me', status: 'CONFIRMED', id: 'b2' }),
        ],
      }),
    );
    expect(stateAt(slots, hm(8))).toBe('mine-pending');
    expect(stateAt(slots, hm(10))).toBe('mine-confirmed');
  });

  it('is not mine without a viewer', () => {
    const slots = generateSlots(input({ bookings: [book({ startsAt: at('2026-10-24', hm(8)), clientId: 'me' })] }));
    expect(stateAt(slots, hm(8))).toBe('taken');
  });

  it.each(['CANCELLED', 'COMPLETED', 'NO_SHOW'] as const)('a %s booking does not hold the slot', (status) => {
    const slots = generateSlots(input({ bookings: [book({ startsAt: at('2026-10-24', hm(9)), status })] }));
    expect(stateAt(slots, hm(9))).toBe('open');
  });

  it('a misaligned booking blocks every slot it overlaps (no double booking after a settings change)', () => {
    const slots = generateSlots(
      input({
        bookings: [book({ startsAt: at('2026-10-24', hm(8, 30)), endsAt: at('2026-10-24', hm(9, 30)) })],
      }),
    );
    expect(stateAt(slots, hm(7))).toBe('open');
    expect(stateAt(slots, hm(8))).toBe('taken');
    expect(stateAt(slots, hm(9))).toBe('taken');
    expect(stateAt(slots, hm(10))).toBe('open');
  });

  it('uses slotMinutes when a booking has no endsAt', () => {
    const slots = generateSlots(input({ bookings: [book({ startsAt: at('2026-10-24', hm(9)) })] }));
    expect(stateAt(slots, hm(8))).toBe('open'); // 08:00-09:00 ends exactly where the booking starts
    expect(stateAt(slots, hm(10))).toBe('open');
  });

  it('past: starts before now (a mine-* booking still shows through)', () => {
    const now = at('2026-10-24', hm(9, 30));
    const slots = generateSlots(
      input({
        now,
        viewerId: 'me',
        bookings: [book({ startsAt: at('2026-10-24', hm(8)), clientId: 'me' })],
      }),
    );
    expect(stateAt(slots, hm(7))).toBe('past');
    expect(stateAt(slots, hm(8))).toBe('mine-confirmed');
    expect(stateAt(slots, hm(9))).toBe('past'); // started at 09:00 < 09:30
  });

  it('a past slot someone else held reads as past, not taken', () => {
    const now = at('2026-10-24', hm(9, 30));
    const slots = generateSlots(input({ now, bookings: [book({ startsAt: at('2026-10-24', hm(8)) })] }));
    expect(stateAt(slots, hm(8))).toBe('past');
  });

  it('too-soon: starts inside the minimum notice, open exactly at now + notice', () => {
    const now = at('2026-10-23', hm(20)); // +12h => 2026-10-24 08:00
    const slots = generateSlots(input({ now }));
    expect(stateAt(slots, hm(7))).toBe('too-soon');
    expect(stateAt(slots, hm(8))).toBe('open'); // exactly now + 12h
    expect(stateAt(slots, hm(9))).toBe('open');
  });

  it('a taken slot inside the notice window reads as taken', () => {
    const now = at('2026-10-23', hm(20));
    const slots = generateSlots(input({ now, bookings: [book({ startsAt: at('2026-10-24', hm(7)) })] }));
    expect(stateAt(slots, hm(7))).toBe('taken');
  });

  it('minNoticeHours 0 makes everything after now open', () => {
    const now = at('2026-10-24', hm(8, 59));
    const slots = generateSlots(input({ now, settings: { ...settings, minNoticeHours: 0 } }));
    expect(stateAt(slots, hm(8))).toBe('past');
    expect(stateAt(slots, hm(9))).toBe('open');
  });
});

describe('horizon', () => {
  it('returns nothing beyond now + horizonDays for clients', () => {
    const now = at('2026-10-24', hm(6)); // Saturday 06:00 -> a 7 day horizon ends Saturday 06:00 next week
    const slots = generateSlots(
      input({ now, settings: { ...settings, horizonDays: 7 }, from: at('2026-10-24', 0), to: at('2026-11-01', 0) }),
    );
    expect(slots.some((s) => s.startsAt.getTime() > now.getTime() + 7 * 86_400_000)).toBe(false);
    // next Saturday 07:00 is one hour past the horizon
    expect(starts(slots)).not.toContain('2026-10-31T03:30:00.000Z');
    expect(starts(slots)).toContain('2026-10-25T03:30:00.000Z'); // Sunday 07:00 is inside
  });

  it('keeps a slot exactly at the horizon boundary and drops one a minute later', () => {
    const now = at('2026-10-24', hm(7)); // Saturday 07:00
    const s = { ...settings, horizonDays: 7, minNoticeHours: 0 };
    const slots = generateSlots(input({ now, settings: s, from: at('2026-10-31', 0), to: at('2026-11-01', 0) }));
    // next Saturday 07:00 == now + 7d exactly -> kept; 08:00 is beyond the horizon -> dropped
    expect(starts(slots)).toEqual(['2026-10-31T03:30:00.000Z']);
  });

  it('the coach audience ignores horizon and notice', () => {
    const now = at('2026-10-24', hm(6, 30));
    const s = { ...settings, horizonDays: 1 };
    const far = generateSlots(input({ now, settings: s, audience: 'coach', from: at('2026-12-05', 0), to: at('2026-12-06', 0) }));
    expect(far.length).toBeGreaterThan(0);
    expect(far.every((x) => x.state === 'open')).toBe(true);
    const soon = generateSlots(input({ now, settings: s, audience: 'coach', from: at('2026-10-24', 0), to: at('2026-10-25', 0) }));
    expect(soon.find((x) => x.startsAt.getTime() === at('2026-10-24', hm(7)).getTime())?.state).toBe('open');
  });
});

describe('weeks: Saturday-first for fa, Monday-first for en', () => {
  it('2026-10-23 (Friday) is the last day of the fa week but inside an en week that holds the next Saturday', () => {
    const fa = weekRange('2026-10-23', 'fa', TZ);
    const en = weekRange('2026-10-23', 'en', TZ);
    expect(fa.startKey).toBe('2026-10-17'); // Saturday
    expect(fa.keys[6]).toBe('2026-10-23'); // Friday is the last column
    expect(en.startKey).toBe('2026-10-19'); // Monday
    expect(en.keys[6]).toBe('2026-10-25'); // Sunday
  });

  it('week bounds are midnight-to-midnight in the coach timezone', () => {
    const fa = weekRange('2026-10-24', 'fa', TZ);
    expect(iso(fa.from)).toBe('2026-10-23T20:30:00.000Z'); // Saturday 00:00 Tehran
    expect(iso(fa.to)).toBe('2026-10-30T20:30:00.000Z');
  });

  it('slot generation over a fa week and an en week puts Saturday in different weeks', () => {
    const now = at('2026-10-10', 0);
    const gen = (key: string, locale: string) => {
      const w = weekRange(key, locale, TZ);
      return generateSlots(input({ now, from: w.from, to: w.to, settings: { ...settings, horizonDays: 60 } }));
    };
    const sat = at('2026-10-24', hm(7)).getTime();
    // Friday 2026-10-23: fa week = Sat 17..Fri 23 (no Sat 24); en week = Mon 19..Sun 25 (has Sat 24 + Sun 25)
    expect(gen('2026-10-23', 'fa').some((s) => s.startsAt.getTime() === sat)).toBe(false);
    expect(gen('2026-10-23', 'en').some((s) => s.startsAt.getTime() === sat)).toBe(true);
    // a slot never appears in two consecutive weeks
    const a = gen('2026-10-24', 'fa').map((s) => s.startsAt.getTime());
    const b = gen('2026-10-31', 'fa').map((s) => s.startsAt.getTime());
    expect(a.filter((t) => b.includes(t))).toEqual([]);
  });

  it('bookableWeekStarts spans the week of today to the week of the horizon end', () => {
    expect(bookableWeekStarts(NOW, 21, 'fa', TZ)).toEqual(['2026-10-17', '2026-10-24', '2026-10-31', '2026-11-07']);
    expect(bookableWeekStarts(NOW, 21, 'en', TZ)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']);
    expect(bookableWeekStarts(NOW, 0, 'fa', TZ)).toEqual(['2026-10-17']);
  });

  it('parseWeekParam accepts real dates only', () => {
    expect(parseWeekParam('2026-10-24', 'x')).toBe('2026-10-24');
    expect(parseWeekParam('2026-02-30', 'x')).toBe('x');
    expect(parseWeekParam('nope', 'x')).toBe('x');
    expect(parseWeekParam(undefined, 'x')).toBe('x');
  });
});

describe('rollingRange: the dashboard\'s next 7 days', () => {
  it('starts today, whatever day of the week it is: on a Friday it is not seven days of the past', () => {
    const r = rollingRange('2026-10-23', 7, TZ); // Friday
    expect(r.startKey).toBe('2026-10-23');
    expect(r.keys).toEqual([
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
    ]);
    // the fa calendar week of the same Friday ENDS today; the rolling window has nothing before it
    expect(weekRange('2026-10-23', 'fa', TZ).keys[6]).toBe('2026-10-23');
  });

  it('bounds are midnight today to midnight after the last day, in the coach timezone', () => {
    const r = rollingRange('2026-10-23', 7, TZ);
    expect(iso(r.from)).toBe('2026-10-22T20:30:00.000Z'); // Friday 00:00 Tehran
    expect(iso(r.to)).toBe('2026-10-29T20:30:00.000Z'); // Friday 00:00 Tehran, a week later
  });

  it('crosses month and year ends and keeps the length it was given', () => {
    expect(rollingRange('2026-12-29', 7, TZ).keys[6]).toBe('2027-01-04');
    expect(rollingRange('2026-10-23', 3, TZ).keys).toHaveLength(3);
  });
});

describe('checkSlotBookable (server re-validation)', () => {
  const base = () => ({ ...input(), startsAt: at('2026-10-24', hm(9)) });

  it('accepts an open slot', () => {
    expect(checkSlotBookable(base())).toBeNull();
  });
  it('rejects a start that is not a tile of any window', () => {
    expect(checkSlotBookable({ ...base(), startsAt: at('2026-10-24', hm(9, 15)) })).toBe('notAvailable');
    expect(checkSlotBookable({ ...base(), startsAt: at('2026-10-23', hm(9)) })).toBe('notAvailable'); // Friday
  });
  it('rejects a taken slot, past, too soon, beyond the horizon, inside time off', () => {
    const b: BookingLike = { clientId: 'other', status: 'PENDING', startsAt: at('2026-10-24', hm(9)) };
    expect(checkSlotBookable({ ...base(), bookings: [b] })).toBe('taken');
    expect(checkSlotBookable({ ...base(), now: at('2026-10-24', hm(9, 1)) })).toBe('past');
    expect(checkSlotBookable({ ...base(), now: at('2026-10-24', hm(0)) })).toBe('tooSoon');
    expect(checkSlotBookable({ ...base(), startsAt: at('2026-12-05', hm(9)) })).toBe('outsideHorizon');
    expect(
      checkSlotBookable({ ...base(), timeOff: [{ startsAt: at('2026-10-24', 0), endsAt: at('2026-10-25', 0) }] }),
    ).toBe('notAvailable');
  });
  it('the viewer’s own booking on the slot is not bookable again', () => {
    const b: BookingLike = { clientId: 'me', status: 'CONFIRMED', startsAt: at('2026-10-24', hm(9)) };
    expect(checkSlotBookable({ ...base(), bookings: [b], viewerId: 'me' })).toBe('taken');
  });
  it('the coach audience may book short-notice and far-ahead slots', () => {
    expect(checkSlotBookable({ ...base(), audience: 'coach', now: at('2026-10-24', hm(0)) })).toBeNull();
    expect(checkSlotBookable({ ...base(), audience: 'coach', startsAt: at('2026-12-05', hm(9)) })).toBeNull();
  });
});

describe('client cancel window', () => {
  const startsAt = at('2026-10-26', hm(17)); // Monday 17:00
  const cwh = 24;

  it('the deadline is startsAt minus the window', () => {
    expect(iso(cancelDeadline(startsAt, cwh))).toBe(iso(at('2026-10-25', hm(17))));
    expect(iso(cancelDeadline(startsAt, 0))).toBe(iso(startsAt));
  });

  it('allowed up to and including the deadline instant', () => {
    const live = { status: 'CONFIRMED' as const, startsAt };
    expect(clientCancelState(live, cwh, at('2026-10-24', hm(9)))).toBe('allowed');
    expect(clientCancelState(live, cwh, at('2026-10-25', hm(17)))).toBe('allowed');
    expect(clientCancelState(live, cwh, new Date(at('2026-10-25', hm(17)).getTime() + 1))).toBe('late');
    expect(clientCancelState(live, cwh, at('2026-10-26', hm(18)))).toBe('late'); // already started
  });

  it('a CONFIRMED booking follows the window; a late one is not cancellable online', () => {
    const confirmed = { status: 'CONFIRMED' as const, startsAt };
    expect(canClientCancel(confirmed, cwh, at('2026-10-24', hm(9)))).toBe(true);
    expect(canClientCancel(confirmed, cwh, at('2026-10-26', hm(10)))).toBe(false);
  });

  it('a PENDING request can be withdrawn at any time: the window does not apply', () => {
    const pending = { status: 'PENDING' as const, startsAt };
    for (const now of [
      at('2026-10-24', hm(9)), // days ahead
      at('2026-10-25', hm(17)), // exactly the deadline
      new Date(at('2026-10-25', hm(17)).getTime() + 1), // one ms inside the window
      at('2026-10-26', hm(16, 59)), // an hour before it starts
      at('2026-10-26', hm(17, 30)), // already started
    ]) {
      expect(clientCancelState(pending, cwh, now)).toBe('allowed');
      expect(canClientCancel(pending, cwh, now)).toBe(true);
    }
    // even with a window longer than the time left, or a zero window
    expect(clientCancelState(pending, 72, at('2026-10-26', hm(8)))).toBe('allowed');
    expect(clientCancelState(pending, 0, at('2026-10-26', hm(8)))).toBe('allowed');
  });

  it('the same instant is "late" for CONFIRMED but "allowed" for PENDING', () => {
    const inside = at('2026-10-26', hm(9)); // 8 h before, inside the 24 h window
    expect(clientCancelState({ status: 'CONFIRMED', startsAt }, cwh, inside)).toBe('late');
    expect(clientCancelState({ status: 'PENDING', startsAt }, cwh, inside)).toBe('allowed');
  });

  it('finished states are final', () => {
    const now = at('2026-10-24', hm(9));
    for (const status of ['CANCELLED', 'COMPLETED', 'NO_SHOW'] as const) {
      expect(clientCancelState({ status, startsAt }, cwh, now)).toBe('final');
      expect(canClientCancel({ status, startsAt }, cwh, now)).toBe(false);
    }
  });

  it('exposes the live statuses and the per-client cap', () => {
    expect([...LIVE_STATUSES]).toEqual(['PENDING', 'CONFIRMED']);
    expect(MAX_LIVE_BOOKINGS).toBe(3);
  });
});
