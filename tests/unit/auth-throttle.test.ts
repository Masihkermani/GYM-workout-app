import { describe, expect, it } from 'vitest';
import { UNKNOWN_IP } from '@/lib/client-ip';
import {
  LOGIN_IP_MAX,
  LOGIN_PAIR_MAX,
  LOGIN_PHONE_MAX,
  REGISTER_IP_MAX,
  createAuthThrottle,
  loginPairKey,
} from '@/lib/auth-throttle';

const COACH = '+989120000000';
const MINUTE = 60_000;

/** Fail `n` logins and return the attempts. */
function failLogins(throttle: ReturnType<typeof createAuthThrottle>, ip: string, phone: string, n: number) {
  return Array.from({ length: n }, () => {
    const attempt = throttle.reserveLogin(ip, phone);
    if (attempt.allowed) attempt.afterFailure();
    return attempt;
  });
}

describe('login throttle keys', () => {
  it('keys the brute-force cap on address AND phone', () => {
    expect(loginPairKey('203.0.113.9', COACH)).toBe('203.0.113.9|+989120000000');
    expect(loginPairKey('203.0.113.9', COACH)).not.toBe(loginPairKey('203.0.113.10', COACH));
  });

  it('a stranger hammering the coach number cannot lock the coach out (F3)', () => {
    const throttle = createAuthThrottle();
    const attacker = failLogins(throttle, '198.51.100.66', COACH, 20);
    expect(attacker.filter((a) => a.allowed)).toHaveLength(LOGIN_PAIR_MAX);

    // the coach, from home, is still served and a correct password goes through
    const coach = throttle.reserveLogin('203.0.113.9', COACH);
    expect(coach.allowed).toBe(true);
    coach.succeed();
  });

  it('locks the pair after 5 wrong passwords and says so on the 5th, like before', () => {
    const throttle = createAuthThrottle();
    const results = Array.from({ length: LOGIN_PAIR_MAX }, () => {
      const a = throttle.reserveLogin('203.0.113.9', COACH);
      return a.allowed ? a.afterFailure() : { locked: true, retryAfterSeconds: -1 };
    });
    expect(results.slice(0, 4).every((r) => !r.locked)).toBe(true);
    expect(results[4]).toMatchObject({ locked: true, retryAfterSeconds: 15 * 60 });
    const sixth = throttle.reserveLogin('203.0.113.9', COACH);
    expect(sixth).toMatchObject({ allowed: false, retryAfterSeconds: 15 * 60 });
  });

  it('a correct password forgives the pair', () => {
    const throttle = createAuthThrottle();
    failLogins(throttle, '203.0.113.9', COACH, 4);
    throttle.reserveLogin('203.0.113.9', COACH).succeed();
    expect(failLogins(throttle, '203.0.113.9', COACH, LOGIN_PAIR_MAX).filter((a) => a.allowed)).toHaveLength(LOGIN_PAIR_MAX);
  });

  it('opens again after 15 minutes', () => {
    let t = 0;
    const throttle = createAuthThrottle(() => t);
    failLogins(throttle, '203.0.113.9', COACH, 5);
    expect(throttle.reserveLogin('203.0.113.9', COACH).allowed).toBe(false);
    t = 15 * MINUTE;
    expect(throttle.reserveLogin('203.0.113.9', COACH).allowed).toBe(true);
  });
});

describe('per-address cap across phones (F4)', () => {
  it('stops one address spraying many numbers', () => {
    const throttle = createAuthThrottle();
    const attempts = Array.from({ length: 100 }, (_, i) => {
      const a = throttle.reserveLogin('198.51.100.66', `+98912${String(1000000 + i)}`);
      if (a.allowed) a.afterFailure();
      return a;
    });
    expect(attempts.filter((a) => a.allowed)).toHaveLength(LOGIN_IP_MAX);
    // another address is unaffected
    expect(throttle.reserveLogin('203.0.113.9', '+989121000000').allowed).toBe(true);
  });

  it('successful logins do not eat the address budget (a shared NAT address keeps working)', () => {
    const throttle = createAuthThrottle();
    for (let i = 0; i < 200; i++) throttle.reserveLogin('203.0.113.9', `+98912${String(2000000 + i)}`).succeed();
    expect(throttle.reserveLogin('203.0.113.9', '+989120000001').allowed).toBe(true);
  });

  it('is skipped when the address is unknown (no proxy header), so one bucket cannot lock everybody', () => {
    const throttle = createAuthThrottle();
    const attempts = Array.from({ length: 100 }, (_, i) => {
      const a = throttle.reserveLogin(UNKNOWN_IP, `+98912${String(3000000 + i)}`);
      if (a.allowed) a.afterFailure();
      return a;
    });
    expect(attempts.every((a) => a.allowed)).toBe(true);
    // ...but a single phone is still capped per pair
    expect(failLogins(throttle, UNKNOWN_IP, COACH, 10).filter((a) => a.allowed)).toHaveLength(LOGIN_PAIR_MAX);
  });
});

describe('per-phone ceiling across addresses', () => {
  it('caps the guesses against one number from many addresses, registered or not', () => {
    const throttle = createAuthThrottle();
    const attempts = Array.from({ length: 200 }, (_, i) => {
      const a = throttle.reserveLogin(`198.51.100.${i % 250}`, '+989129999999');
      if (a.allowed) a.afterFailure();
      return a;
    });
    // 200 distinct addresses of 1 try each: the per-pair cap never trips, the ceiling does
    expect(attempts.filter((a) => a.allowed)).toHaveLength(LOGIN_PHONE_MAX);
  });

  it('answers the same for a number nobody registered (no oracle): the throttle never looks at the database', () => {
    const a = createAuthThrottle();
    const b = createAuthThrottle();
    const shape = (t: ReturnType<typeof createAuthThrottle>, phone: string) =>
      failLogins(t, '198.51.100.1', phone, 8).map((x) => [x.allowed, x.retryAfterSeconds]);
    expect(shape(a, COACH)).toEqual(shape(b, '+989129876543'));
  });

  it('a refused attempt is not charged to the other counters', () => {
    const throttle = createAuthThrottle();
    failLogins(throttle, '198.51.100.1', COACH, 5); // pair locked, 5 spent on ip and phone
    failLogins(throttle, '198.51.100.1', COACH, 100); // refused, must not drain anything
    // the same address can still use its budget on other numbers: 30 - 5 = 25 more
    const others = Array.from({ length: 40 }, (_, i) => throttle.reserveLogin('198.51.100.1', `+98912${String(4000000 + i)}`));
    expect(others.filter((a) => a.allowed)).toHaveLength(LOGIN_IP_MAX - LOGIN_PAIR_MAX);
  });
});

describe('sign-up throttle', () => {
  it('allows 10 per address per hour', () => {
    let t = 0;
    const throttle = createAuthThrottle(() => t);
    const results = Array.from({ length: 15 }, () => throttle.reserveRegister('198.51.100.66'));
    expect(results.filter((r) => r.allowed)).toHaveLength(REGISTER_IP_MAX);
    expect(results.at(-1)?.retryAfterSeconds).toBe(3600);
    expect(throttle.reserveRegister('203.0.113.9').allowed).toBe(true);
    t = 60 * MINUTE;
    expect(throttle.reserveRegister('198.51.100.66').allowed).toBe(true);
  });

  it('does not apply to an unknown address', () => {
    const throttle = createAuthThrottle();
    for (let i = 0; i < 50; i++) expect(throttle.reserveRegister(UNKNOWN_IP).allowed).toBe(true);
  });
});

describe('change-password guesses', () => {
  it('allow 5 wrong "current password" answers per account, then lock, and a right one resets', () => {
    const throttle = createAuthThrottle();
    const outcomes = Array.from({ length: 5 }, () => {
      const guess = throttle.reservePasswordGuess('user-1');
      return guess.allowed && guess.afterFailure(); // true = this wrong guess used up the budget
    });
    expect(outcomes).toEqual([false, false, false, false, true]);
    expect(throttle.reservePasswordGuess('user-1').allowed).toBe(false);
    expect(throttle.reservePasswordGuess('user-2').allowed).toBe(true);

    const fresh = createAuthThrottle();
    fresh.reservePasswordGuess('user-1').afterFailure();
    fresh.reservePasswordGuess('user-1').succeed();
    expect(Array.from({ length: 5 }, () => fresh.reservePasswordGuess('user-1').allowed).every(Boolean)).toBe(true);
  });
});
