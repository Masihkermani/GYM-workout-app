import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PAGE, parsePage } from '@/lib/pagination';
import { STARTS_AT_FUTURE_MS, STARTS_AT_PAST_MS, startsAtSchema } from '@/lib/scheduling/starts-at';

describe('startsAtSchema (F11)', () => {
  afterEach(() => vi.useRealTimers());

  it('accepts a sensible instant', () => {
    const now = Date.now();
    expect(startsAtSchema.safeParse(now + 3_600_000).success).toBe(true);
    expect(startsAtSchema.safeParse(now - 3_600_000).success).toBe(true);
  });

  it('refuses the values that used to become an Invalid Date', () => {
    for (const v of [8_640_000_000_000_000, 1e18, 0, -1, Number.MAX_SAFE_INTEGER, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(startsAtSchema.safeParse(v).success, String(v)).toBe(false);
    }
  });

  it('is [now - 1 day, now + 400 days], inclusive', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
    const now = Date.now();
    expect(startsAtSchema.safeParse(now - STARTS_AT_PAST_MS).success).toBe(true);
    expect(startsAtSchema.safeParse(now - STARTS_AT_PAST_MS - 1).success).toBe(false);
    expect(startsAtSchema.safeParse(now + STARTS_AT_FUTURE_MS).success).toBe(true);
    expect(startsAtSchema.safeParse(now + STARTS_AT_FUTURE_MS + 1).success).toBe(false);
  });

  it('is read on every parse, not captured when the module loads', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
    const target = Date.now() + 500 * 86_400_000; // beyond 400 days today
    expect(startsAtSchema.safeParse(target).success).toBe(false);
    vi.setSystemTime(new Date('2027-10-24T12:00:00Z')); // a year later the same instant is in range
    expect(startsAtSchema.safeParse(target).success).toBe(true);
  });
});

describe('parsePage', () => {
  it('passes ordinary pages through', () => {
    expect(parsePage('1')).toBe(1);
    expect(parsePage('7')).toBe(7);
    expect(parsePage(String(MAX_PAGE))).toBe(MAX_PAGE);
  });

  it('turns everything else into page 1', () => {
    for (const v of [undefined, '', '0', '-3', '1.5', 'abc', '3abc', ' 4', '1e3', '99999999999', String(MAX_PAGE + 1), '2147483648', ['5', '6'].join(',')]) {
      expect(parsePage(v), String(v)).toBe(1);
    }
  });

  it('takes the first of a repeated parameter', () => {
    expect(parsePage(['3', '9'])).toBe(3);
    expect(parsePage(['x', '9'])).toBe(1);
  });
});

describe('booking actions with an absurd startsAt (F11)', () => {
  it('answer `invalid` before touching the session or the database instead of crashing', async () => {
    vi.resetModules();
    vi.doMock('@/lib/auth', () => ({
      requireUser: async () => {
        throw new Error('must not be reached');
      },
      requireCoach: async () => {
        throw new Error('must not be reached');
      },
    }));
    vi.doMock('next/cache', () => ({ revalidatePath: () => undefined }));
    const { createBooking, bookForClient, moveBooking } = await import('@/server/booking');
    for (const startsAt of [8_640_000_000_000_000, 4_102_444_800_000 * 10, 0, -5]) {
      expect(await createBooking({ locale: 'fa', startsAt })).toEqual({ ok: false, error: 'invalid' });
      expect(await bookForClient({ locale: 'fa', clientId: 'c', startsAt })).toEqual({ ok: false, error: 'invalid' });
      expect(await moveBooking({ locale: 'fa', bookingId: 'b', startsAt })).toEqual({ ok: false, error: 'invalid' });
    }
    vi.doUnmock('@/lib/auth');
    vi.doUnmock('next/cache');
  });
});
