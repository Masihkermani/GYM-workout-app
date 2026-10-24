import 'server-only';
import { UNKNOWN_IP } from './client-ip';
import { FailureLimiter, reserve, type Reservation } from './rate-limit';

/**
 * Throttling for the unauthenticated endpoints and for "type your current password" guesses.
 * Every `reserve*` call spends its attempts synchronously, so callers invoke it BEFORE their first
 * `await` that depends on the guess (database lookup, argon2): a concurrent burst then evaluates at
 * most the budget instead of everything (security review F2).
 *
 * Login is charged on three counters:
 *   ip|phone   5 per 15 min   the brute-force cap for one account from one place. Keyed on the pair, so a
 *                             stranger who knows the coach's number cannot lock the coach out; they only
 *                             lock themselves out of that one number.
 *   ip         30 per 15 min  across all phones: stops password spraying and argon2 CPU/memory floods.
 *                             (Not applied when the address is unknown: see client-ip.ts.)
 *   phone      50 per hour    across all addresses: a ceiling on guesses against one account for an attacker
 *                             with many addresses. Counted for unknown numbers too, so the answer is the
 *                             same whether the number is registered or not.
 * A correct password hands the attempt back (and clears the pair), so normal use costs nothing.
 *
 * In memory, per process: right for the single-instance deploy the README describes.
 */
export const LOGIN_PAIR_MAX = 5;
export const LOGIN_PAIR_WINDOW_MS = 15 * 60_000;
export const LOGIN_IP_MAX = 30;
export const LOGIN_IP_WINDOW_MS = 15 * 60_000;
export const LOGIN_PHONE_MAX = 50;
export const LOGIN_PHONE_WINDOW_MS = 60 * 60_000;
export const REGISTER_IP_MAX = 10;
export const REGISTER_IP_WINDOW_MS = 60 * 60_000;
export const PASSWORD_GUESS_MAX = 5;
export const PASSWORD_GUESS_WINDOW_MS = 15 * 60_000;

export const loginPairKey = (ip: string, phone: string) => `${ip}|${phone}`;

export interface LoginAttempt {
  allowed: boolean;
  /** When refused: how long until the refusing counter reopens. */
  retryAfterSeconds: number;
  /** The credentials were wrong: `retryAfterSeconds > 0` when this failure used up a budget (the user is locked now). */
  afterFailure(): { locked: boolean; retryAfterSeconds: number };
  /** The credentials were right: hand the attempt back and forgive this pair. */
  succeed(): void;
}

export function createAuthThrottle(now: () => number = Date.now) {
  const pair = new FailureLimiter(LOGIN_PAIR_MAX, LOGIN_PAIR_WINDOW_MS, now);
  const ip = new FailureLimiter(LOGIN_IP_MAX, LOGIN_IP_WINDOW_MS, now);
  const phone = new FailureLimiter(LOGIN_PHONE_MAX, LOGIN_PHONE_WINDOW_MS, now);
  const register = new FailureLimiter(REGISTER_IP_MAX, REGISTER_IP_WINDOW_MS, now);
  const passwordGuess = new FailureLimiter(PASSWORD_GUESS_MAX, PASSWORD_GUESS_WINDOW_MS, now);

  const lockedOut = (r: Reservation): LoginAttempt => ({
    allowed: false,
    retryAfterSeconds: r.retryAfterSeconds,
    afterFailure: () => ({ locked: true, retryAfterSeconds: r.retryAfterSeconds }),
    succeed: () => undefined,
  });

  return {
    /** Spend one login attempt for this address and (normalised, E.164) phone. Synchronous. */
    reserveLogin(clientIp: string, phoneE164: string): LoginAttempt {
      const known = clientIp !== UNKNOWN_IP;
      const pairKey = loginPairKey(clientIp, phoneE164);
      const r = reserve([
        [pair, pairKey],
        ...(known ? ([[ip, clientIp]] as const) : []),
        [phone, phoneE164],
      ]);
      if (!r.allowed) return lockedOut(r);
      return {
        allowed: true,
        retryAfterSeconds: 0,
        afterFailure() {
          const seconds = r.lockedFor();
          return { locked: seconds > 0, retryAfterSeconds: seconds };
        },
        succeed() {
          pair.reset(pairKey);
          if (known) ip.refund(clientIp);
          phone.refund(phoneE164);
        },
      };
    },

    /** Spend one sign-up for this address. Not applied when the address is unknown. */
    reserveRegister(clientIp: string): { allowed: boolean; retryAfterSeconds: number } {
      if (clientIp === UNKNOWN_IP) return { allowed: true, retryAfterSeconds: 0 };
      const r = register.consume(clientIp);
      return { allowed: r.allowed, retryAfterSeconds: r.retryAfterSeconds };
    },

    /** Spend one "current password" guess for a signed-in account (a stolen session must not be able to brute-force it). */
    reservePasswordGuess(userId: string) {
      const r = reserve([[passwordGuess, userId]]);
      return {
        allowed: r.allowed,
        retryAfterSeconds: r.retryAfterSeconds,
        /** Wrong guess: true when it used up the budget. */
        afterFailure: () => r.lockedFor() > 0,
        succeed: () => passwordGuess.reset(userId),
      };
    },
  };
}

export type AuthThrottle = ReturnType<typeof createAuthThrottle>;

const globalForThrottle = globalThis as unknown as { __daftarAuthThrottle?: AuthThrottle };

/** One per process; kept on globalThis so dev HMR does not reset it. */
export const authThrottle: AuthThrottle = (globalForThrottle.__daftarAuthThrottle ??= createAuthThrottle());
