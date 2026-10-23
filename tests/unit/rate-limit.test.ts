import { describe, expect, it } from 'vitest';
import { FailureLimiter } from '@/lib/rate-limit';

describe('FailureLimiter', () => {
  it('blocks after the 5th failure and unblocks after the window', () => {
    let t = 1_000_000;
    const limiter = new FailureLimiter(5, 15 * 60_000, () => t);
    for (let i = 0; i < 4; i++) {
      limiter.recordFailure('+989120000001');
      expect(limiter.check('+989120000001').allowed).toBe(true);
    }
    limiter.recordFailure('+989120000001');
    const blocked = limiter.check('+989120000001');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(900);

    t += 14 * 60_000;
    expect(limiter.check('+989120000001').allowed).toBe(false);
    t += 61_000;
    expect(limiter.check('+989120000001').allowed).toBe(true);
  });
  it('is keyed per phone', () => {
    const limiter = new FailureLimiter(2, 60_000);
    limiter.recordFailure('a');
    limiter.recordFailure('a');
    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.check('b').allowed).toBe(true);
  });
  it('reset clears failures', () => {
    const limiter = new FailureLimiter(1, 60_000);
    limiter.recordFailure('a');
    expect(limiter.check('a').allowed).toBe(false);
    limiter.reset('a');
    expect(limiter.check('a').allowed).toBe(true);
  });
});
