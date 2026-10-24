/**
 * Exits 1 (with the reason) when the demo seed must not run here. `npm run db:reset` runs this first:
 * `migrate reset` drops every table, so it has to be refused before anything is dropped, not after.
 */
import { demoSeedRefusal } from './seed-guard';

const refusal = demoSeedRefusal();
if (refusal) {
  console.error(refusal);
  process.exit(1);
}
