/**
 * Production base data: `npm run db:seed:base` (idempotent, creates no users).
 *
 * Loads the settings row, the default weekly availability and the exercise library with Persian
 * names. Then create the coach: `npm run create-coach -- --phone 0912… --name "…"`.
 * For demo data with sample clients (development only) use `npm run db:seed`.
 */
import { PrismaClient } from '@prisma/client';
import { seedBase } from './seed-shared';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Daftar (base data, no users)…');
  const r = await seedBase(prisma);
  console.log(`  settings: ${r.settingsCreated ? 'created (placeholder coach name)' : 'already there, left as is'}`);
  console.log(
    `  availability: ${r.availabilityCreated > 0 ? `${r.availabilityCreated} default windows added` : 'rules already there, left as is'}`,
  );
  const { total, expected, withFa } = r.exercises;
  console.log(`  exercises: ${total} in the library (${withFa} of ${expected} dataset rows have Persian names)`);
  if (withFa === 0 || total < expected) {
    throw new Error('the exercise library is incomplete: check data/exercises/exercises.en.json and exercises.fa.json');
  }
  console.log('Done. Next: npm run create-coach -- --phone 0912… --name "…" [--name-fa "…"]');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
