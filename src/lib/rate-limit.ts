import 'server-only';

/**
 * In-memory failure limiter. Good enough for a single-instance deploy (README says so): state is
 * per process and resets on restart. Swap for Redis/DB if the app is ever scaled horizontally.
 */

interface Entry {
  failures: number;
  windowStart: number;
}

export interface LimitStatus {
  allowed: boolean;
  /** Seconds until another attempt is allowed (0 when allowed). */
  retryAfterSeconds: number;
  remaining: number;
}

export class FailureLimiter {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly maxFailures: number,
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

  check(key: string): LimitStatus {
    const entry = this.current(key);
    if (!entry || entry.failures < this.maxFailures) {
      return { allowed: true, retryAfterSeconds: 0, remaining: this.maxFailures - (entry?.failures ?? 0) };
    }
    const retryMs = entry.windowStart + this.windowMs - this.now();
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)), remaining: 0 };
  }

  recordFailure(key: string): LimitStatus {
    const entry = this.current(key);
    if (entry) entry.failures += 1;
    else this.entries.set(key, { failures: 1, windowStart: this.now() });
    this.sweep();
    return this.check(key);
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  /** Drop expired entries so the map cannot grow without bound. */
  private sweep(): void {
    if (this.entries.size < 500) return;
    const t = this.now();
    for (const [k, e] of this.entries) if (t - e.windowStart >= this.windowMs) this.entries.delete(k);
  }
}

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

const globalForLimiter = globalThis as unknown as { __daftarLoginLimiter?: FailureLimiter };

/** 5 failed logins per phone per 15 minutes. Kept on globalThis so dev HMR does not reset it. */
export const loginLimiter: FailureLimiter =
  globalForLimiter.__daftarLoginLimiter ?? new FailureLimiter(LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS);
globalForLimiter.__daftarLoginLimiter = loginLimiter;
