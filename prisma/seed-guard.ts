/**
 * Guard for the demo seed. `npm run db:seed` creates a coach and six clients whose passwords are
 * written in the README, so it must never run against a production database by accident.
 *
 * Production data is loaded with `npm run db:seed:base` (no users) and `npm run create-coach`.
 * A deliberate demo or staging box can opt in with SEED_DEMO=1.
 */
export class DemoSeedRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemoSeedRefusedError';
  }
}

export const DEMO_SEED_REFUSAL = [
  'Refusing to run the demo seed: NODE_ENV=production and SEED_DEMO is not 1.',
  'The demo seed creates a coach and six clients with publicly documented passwords.',
  '  Production: npm run db:seed:base                     (settings, availability, exercise library)',
  '              npm run create-coach -- --phone 0912… --name "…"',
  '  A demo or staging server that really wants the demo accounts: SEED_DEMO=1 npm run db:seed',
].join('\n');

/** The refusal message, or null when the demo seed may run. Only the exact value "1" opts in. */
export function demoSeedRefusal(env: Record<string, string | undefined> = process.env): string | null {
  return env.NODE_ENV === 'production' && env.SEED_DEMO !== '1' ? DEMO_SEED_REFUSAL : null;
}

/** Throws DemoSeedRefusedError when the demo seed must not run. */
export function assertDemoSeedAllowed(env: Record<string, string | undefined> = process.env): void {
  const refusal = demoSeedRefusal(env);
  if (refusal) throw new DemoSeedRefusedError(refusal);
}
