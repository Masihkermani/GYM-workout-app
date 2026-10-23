#!/usr/bin/env node
/**
 * `npm run test:e2e:prod` - build the app, then run the Playwright suite against `next start`
 * (the real production server) instead of `next dev`. Extra arguments go to Playwright:
 *   npm run test:e2e:prod -- tests/e2e/booking.spec.ts
 * Uses the same env as dev runs: DATABASE_URL, E2E_PORT (default 3100), NEXT_DIST_DIR, PW_OUTPUT_DIR.
 * Notes: /styleguide is dev-only (404 in production), so ui.spec.ts skips itself here; and Next prints a
 * notice that `next start` is not meant for `output: 'standalone'`: it serves the same build correctly.
 */
import { spawnSync } from 'node:child_process';

const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

run('npx', ['next', 'build']);
run('npx', ['playwright', 'test', ...process.argv.slice(2)], { E2E_PROD: '1' });
