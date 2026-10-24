/**
 * `npm run create-coach -- --phone 0912… --name "…" [--name-fa "…"]`
 *
 * Creates (or promotes) the coach account on a database that must not get the demo users.
 * Password: COACH_PASSWORD, else generated and printed once. See prisma/coach-bootstrap.ts.
 */
import { PrismaClient } from '@prisma/client';
import { formatPhone } from '../src/lib/phone';
import { CoachBootstrapError, createOrPromoteCoach, parseCreateCoachArgs, USAGE } from './coach-bootstrap';

const prisma = new PrismaClient();

async function main() {
  const args = parseCreateCoachArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  // an empty variable (docker compose passes COACH_PASSWORD= when it is unset) means "not given"
  const password = process.env.COACH_PASSWORD ? process.env.COACH_PASSWORD : undefined;
  const r = await createOrPromoteCoach(prisma, {
    phone: args.phone,
    name: args.name,
    nameFa: args.nameFa,
    password,
    resetPassword: args.resetPassword,
  });

  const verb = { created: 'Coach created', promoted: 'User promoted to coach', updated: 'Coach updated' }[r.action];
  console.log(`${verb}: ${formatPhone(r.phone, 'en')} (${r.phone})`);
  if (r.generatedPassword) {
    console.log('');
    console.log(`  Password (shown once, store it now): ${r.generatedPassword}`);
    console.log('');
  } else if (r.passwordChanged) {
    console.log('Password set from COACH_PASSWORD.');
  } else {
    console.log('Password unchanged (set COACH_PASSWORD or pass --reset-password to change it).');
  }
  if (r.otherCoaches.length > 0) {
    console.warn(
      `Warning: ${r.otherCoaches.length} other active coach account(s): ` +
        r.otherCoaches.map((c) => `${c.phone} (${c.name})`).join(', ') +
        '. The app treats the oldest as the coach; deactivate the ones you do not want in the coach panel.',
    );
  }
}

main()
  .catch((e) => {
    if (e instanceof CoachBootstrapError) {
      console.error(`create-coach: ${e.message}\n(npm run create-coach -- --help shows the usage)`);
      process.exitCode = 2;
    } else {
      console.error(e);
      process.exitCode = 1;
    }
  })
  .finally(() => prisma.$disconnect());
