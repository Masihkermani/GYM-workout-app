import 'server-only';

/**
 * In-memory attempt limiter. Good enough for a single-instance deploy (README says so): state is
 * per process and resets on restart. Swap for Redis/DB if the app is ever scaled horizontally.
 *
 * Anything guarded by an `await` (a database lookup, a password hash) must `consume()` its attempt
 * BEFORE the first await: the check and the count happen in one synchronous step, so N concurrent
 * requests can never get more than `maxAttempts` of them evaluated. Looking (`check`) first and
 * counting (`recordFailure`) after the awaits lets a whole burst through the check.
 */

interface Entry {
  count: number;
  windowStart: number;
}

export interface LimitStatus {
  allowed: boolean;
  /** Seconds until another attempt is allowed (0 when allowed). */
  retryAfterSeconds: number;
  /** Attempts left in this window. */
  remaining: number;
}

/** Live keys kept per limiter; the oldest are dropped beyond this so the map cannot be used to eat memory. */
const MAX_KEYS = 20_000;
const SWEEP_EVERY_MS = 60_000;

export class FailureLimiter {
  private readonly entries = new Map<string, Entry>();
  private lastSweep = 0;

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private current(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.windowStart >= this.windowMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  private status(entry: Entry | undefined): LimitStatus {
    const used = entry?.count ?? 0;
    if (!entry || used < this.maxAttempts) {
      return { allowed: true, retryAfterSeconds: 0, remaining: this.maxAttempts - used };
    }
    const retryMs = entry.windowStart + this.windowMs - this.now();
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)), remaining: 0 };
  }

  /** Is there budget left? Counts nothing. */
  check(key: string): LimitStatus {
    return this.status(this.current(key));
  }

  /**
   * Spend one attempt. Allowed while the window has budget; once it is spent further calls are refused
   * and NOT counted. Synchronous on purpose: no other request can run between the check and the count.
   * `remaining` is what is left after this attempt (0 = this was the last one).
   */
  consume(key: string): LimitStatus {
    let entry = this.current(key);
    if (entry && entry.count >= this.maxAttempts) return this.status(entry);
    if (entry) entry.count += 1;
    else {
      this.sweep();
      entry = { count: 1, windowStart: this.now() };
      this.entries.set(key, entry);
    }
    return { allowed: true, retryAfterSeconds: 0, remaining: this.maxAttempts - entry.count };
  }

  /** Give one attempt back (it turned out fine, e.g. the password was right). */
  refund(key: string): void {
    const entry = this.current(key);
    if (!entry) return;
    entry.count -= 1;
    if (entry.count <= 0) this.entries.delete(key);
  }

  /** Count a failure after the fact. Prefer `consume()` before the work; kept for callers with no await in between. */
  recordFailure(key: string): LimitStatus {
    const entry = this.current(key);
    if (entry) entry.count += 1;
    else {
      this.sweep();
      this.entries.set(key, { count: 1, windowStart: this.now() });
    }
    return this.check(key);
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  /** Drop expired entries (at most once a minute) and, past MAX_KEYS, the oldest live ones. */
  private sweep(): void {
    const t = this.now();
    if (t - this.lastSweep >= SWEEP_EVERY_MS) {
      this.lastSweep = t;
      for (const [k, e] of this.entries) if (t - e.windowStart >= this.windowMs) this.entries.delete(k);
    }
    while (this.entries.size >= MAX_KEYS) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}

/** One counter to charge, and the key it is charged under. */
export type Charge = readonly [limiter: FailureLimiter, key: string];

export interface Reservation {
  allowed: boolean;
  /** When refused: seconds until the limiter that refused lets the caller try again. */
  retryAfterSeconds: number;
  /** Charged counters, for `refund`/`reset` by the caller. Empty when refused. */
  charged: readonly Charge[];
  /** Seconds until the tightest counter that is now spent reopens, or 0 while every counter still has budget. */
  lockedFor(): number;
}

/**
 * Spend one attempt on every counter, all or nothing: if any counter refuses, the ones already charged
 * are refunded (a refused attempt is never evaluated, so it must not eat the other budgets). Synchronous.
 */
export function reserve(charges: readonly Charge[]): Reservation {
  const taken: Charge[] = [];
  for (const charge of charges) {
    const [limiter, key] = charge;
    const result = limiter.consume(key);
    if (!result.allowed) {
      for (const [l, k] of taken) l.refund(k);
      return { allowed: false, retryAfterSeconds: result.retryAfterSeconds, charged: [], lockedFor: () => result.retryAfterSeconds };
    }
    taken.push(charge);
  }
  return {
    allowed: true,
    retryAfterSeconds: 0,
    charged: taken,
    lockedFor: () => Math.max(0, ...taken.map(([l, k]) => l.check(k)).map((s) => (s.allowed ? 0 : s.retryAfterSeconds))),
  };
}
