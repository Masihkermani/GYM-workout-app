import { describe, expect, it } from 'vitest';
import {
  assertDemoSeedAllowed,
  DemoSeedRefusedError,
  DEMO_SEED_REFUSAL,
  demoSeedRefusal,
} from '../../prisma/seed-guard';

describe('demo seed guard (npm run db:seed, npm run db:reset)', () => {
  it('refuses with NODE_ENV=production unless SEED_DEMO=1 is set', () => {
    expect(demoSeedRefusal({ NODE_ENV: 'production' })).toBe(DEMO_SEED_REFUSAL);
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'production' })).toThrow(DemoSeedRefusedError);
  });

  it('only the exact value "1" opts in', () => {
    for (const value of ['', '0', 'true', 'yes', ' 1', '1 ', 'TRUE']) {
      expect(
        demoSeedRefusal({ NODE_ENV: 'production', SEED_DEMO: value }),
        `SEED_DEMO=${JSON.stringify(value)}`,
      ).not.toBeNull();
    }
    expect(demoSeedRefusal({ NODE_ENV: 'production', SEED_DEMO: '1' })).toBeNull();
    expect(() => assertDemoSeedAllowed({ NODE_ENV: 'production', SEED_DEMO: '1' })).not.toThrow();
  });

  it('is open in development, test and when NODE_ENV is not set', () => {
    for (const env of [{}, { NODE_ENV: 'development' }, { NODE_ENV: 'test' }]) {
      expect(demoSeedRefusal(env)).toBeNull();
    }
  });

  it('the refusal points at the production commands', () => {
    expect(DEMO_SEED_REFUSAL).toContain('db:seed:base');
    expect(DEMO_SEED_REFUSAL).toContain('create-coach');
    expect(DEMO_SEED_REFUSAL).toContain('SEED_DEMO=1');
  });
});
