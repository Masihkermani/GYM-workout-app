import { describe, expect, it } from 'vitest';
import { FailureLimiter, reserve } from '@/lib/rate-limit';

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

describe('FailureLimiter.consume', () => {
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

  it('spends one attempt per call and refuses once the budget is gone, without counting refusals', () => {
    let t = 0;
    const limiter = new FailureLimiter(3, 60_000, () => t);
    expect(limiter.consume('k')).toMatchObject({ allowed: true, remaining: 2 });
    expect(limiter.consume('k')).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.consume('k')).toMatchObject({ allowed: true, remaining: 0 }); // the last one is still evaluated
    const refused = limiter.consume('k');
    expect(refused).toMatchObject({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    limiter.consume('k');
    limiter.consume('k');
    // refusals did not extend or deepen the lock
    t = 60_000;
    expect(limiter.consume('k').allowed).toBe(true);
  });

  it('refund gives an attempt back and forgets an unused key', () => {
    const limiter = new FailureLimiter(2, 60_000);
    limiter.consume('k');
    limiter.consume('k');
    expect(limiter.check('k').allowed).toBe(false);
    limiter.refund('k');
    expect(limiter.check('k')).toMatchObject({ allowed: true, remaining: 1 });
    limiter.refund('k');
    limiter.refund('k'); // nothing left to give back: no negative budget
    expect(limiter.consume('k')).toMatchObject({ allowed: true, remaining: 1 });
  });

  it('a concurrent burst evaluates at most the budget (F2)', async () => {
    const limiter = new FailureLimiter(5, 15 * 60_000);
    let evaluated = 0;
    // the shape of loginAction: reserve first, THEN await the slow work (database, argon2)
    const attempt = async () => {
      if (!limiter.consume('+989120000000').allowed) return 'blocked';
      await tick();
      evaluated += 1;
      return 'evaluated';
    };
    const results = await Promise.all(Array.from({ length: 200 }, attempt));
    expect(evaluated).toBe(5);
    expect(results.filter((r) => r === 'evaluated')).toHaveLength(5);
    expect(results.filter((r) => r === 'blocked')).toHaveLength(195);
  });

  it('documents the bug it replaces: check, await, then record lets the whole burst through', async () => {
    const limiter = new FailureLimiter(5, 15 * 60_000);
    let evaluated = 0;
    const attempt = async () => {
      if (!limiter.check('k').allowed) return;
      await tick();
      evaluated += 1;
      limiter.recordFailure('k');
    };
    await Promise.all(Array.from({ length: 200 }, attempt));
    expect(evaluated).toBe(200);
  });

  it('bounds its memory: the oldest keys are dropped past the cap', () => {
    const limiter = new FailureLimiter(1, 60 * 60_000);
    for (let i = 0; i < 25_000; i++) limiter.consume(`key-${i}`);
    // the newest is still locked, the oldest was evicted (and so is allowed again)
    expect(limiter.check('key-24999').allowed).toBe(false);
    expect(limiter.check('key-0').allowed).toBe(true);
  });
});

describe('reserve', () => {
  it('charges every counter, or none: a refusal refunds what was already taken', () => {
    const wide = new FailureLimiter(10, 60_000);
    const narrow = new FailureLimiter(1, 60_000);
    expect(reserve([[wide, 'w'], [narrow, 'n']]).allowed).toBe(true);
    const refused = reserve([[wide, 'w'], [narrow, 'n']]);
    expect(refused).toMatchObject({ allowed: false, charged: [] });
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    // only the first (evaluated) attempt was charged to the wide counter
    expect(wide.check('w').remaining).toBe(9);
  });

  it('lockedFor reports the counter that this very attempt used up', () => {
    const limiter = new FailureLimiter(2, 60_000);
    const first = reserve([[limiter, 'k']]);
    expect(first.lockedFor()).toBe(0);
    const second = reserve([[limiter, 'k']]);
    expect(second.allowed).toBe(true);
    expect(second.lockedFor()).toBe(60);
  });
});
