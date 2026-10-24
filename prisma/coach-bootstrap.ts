/**
 * Create the coach (or promote an existing user to coach) on a production database, where the demo
 * seed is not allowed to run. Used by `npm run create-coach` (prisma/create-coach.ts).
 *
 * Safe to repeat: the phone number identifies the account. A coach that already exists keeps their
 * password unless one is supplied (COACH_PASSWORD) or `--reset-password` is given.
 */
import type { PrismaClient } from '@prisma/client';
import { generateTempPassword } from '../src/components/coach/tempPassword';
import { toLatinDigits } from '../src/lib/digits';
import { hashPassword } from '../src/lib/password';
import { normalizePhone } from '../src/lib/phone';
import { DEFAULT_TIME_ZONE, PLACEHOLDER_COACH_NAME_FA } from './seed-shared';

export const MIN_COACH_PASSWORD_LENGTH = 10;
export const MAX_COACH_PASSWORD_LENGTH = 200; // the login form's limit
export const MAX_NAME_LENGTH = 60; // the same limit the coach panel puts on a person's name

/** Passwords that are written down in the README (the demo seed): never acceptable for a real coach. */
const PUBLIC_PASSWORDS = new Set(['coach-pass-1234', 'client-pass-1234']);

export class CoachBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoachBootstrapError';
  }
}

export const USAGE = `Usage: npm run create-coach -- --phone 0912… --name "Full Name" [--name-fa "نام فارسی"] [--reset-password]

  --phone           the coach's mobile number; it is the login (0912…, +98912… and Persian digits all work)
  --name            display name, 2 to ${MAX_NAME_LENGTH} characters
  --name-fa         Persian name shown on the Persian pages (defaults to --name while none is set)
  --reset-password  give an existing coach a new password (otherwise it is left alone)

Password: from the environment variable COACH_PASSWORD (at least ${MIN_COACH_PASSWORD_LENGTH} characters), otherwise a random one
is generated and printed once. Re-running with the same phone updates the same account.`;

export interface CreateCoachArgs {
  phone: string;
  name: string;
  nameFa?: string;
  resetPassword: boolean;
  help: boolean;
}

/** Parse `--phone X`, `--phone=X`, `--name`, `--name-fa`, `--reset-password`, `--help`. Throws CoachBootstrapError. */
export function parseCreateCoachArgs(argv: readonly string[]): CreateCoachArgs {
  const out: CreateCoachArgs = { phone: '', name: '', resetPassword: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      out.help = true;
      continue;
    }
    if (arg === '--reset-password') {
      out.resetPassword = true;
      continue;
    }
    const m = /^--(phone|name|name-fa)(?:=([\s\S]*))?$/.exec(arg);
    if (!m) throw new CoachBootstrapError(`unknown argument "${arg}"`);
    let value = m[2];
    if (value === undefined) {
      value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new CoachBootstrapError(`--${m[1]} needs a value`);
      i += 1;
    }
    if (m[1] === 'phone') out.phone = value;
    else if (m[1] === 'name') out.name = value;
    else out.nameFa = value;
  }
  if (out.help) return out;
  if (!out.phone.trim()) throw new CoachBootstrapError('--phone is required');
  if (!out.name.trim()) throw new CoachBootstrapError('--name is required');
  return out;
}

/** Why a coach password is refused, or null when it is acceptable. */
export function coachPasswordProblem(password: string, phoneE164?: string): string | null {
  const length = Array.from(password).length;
  if (length < MIN_COACH_PASSWORD_LENGTH) {
    return `the password is too short (${length} characters, at least ${MIN_COACH_PASSWORD_LENGTH} are required)`;
  }
  if (length > MAX_COACH_PASSWORD_LENGTH)
    return `the password is too long (at most ${MAX_COACH_PASSWORD_LENGTH} characters)`;
  if (PUBLIC_PASSWORDS.has(password)) return 'that password is published in the README: choose another';
  if (new Set(Array.from(password)).size === 1) return 'the password is one character repeated: choose another';
  if (phoneE164) {
    // the phone number typed as the password, in any of the usual spellings
    const typed = toLatinDigits(password).replace(/[\s\-+]/g, '');
    const national = phoneE164.slice(3); // +98 9121234567 -> 9121234567
    if ([phoneE164.slice(1), `0${national}`, national, `00${phoneE164.slice(1)}`].includes(typed)) {
      return 'the password must not be the phone number';
    }
  }
  return null;
}

export interface CreateCoachInput {
  phone: string;
  name: string;
  nameFa?: string;
  /** A password to set. Weak ones are refused. Omitted: generated for a new or promoted coach. */
  password?: string;
  /** Give an existing coach a new (generated, unless `password` is set) password. */
  resetPassword?: boolean;
}

export interface CreateCoachResult {
  action: 'created' | 'promoted' | 'updated';
  userId: string;
  phone: string;
  /** The generated password, shown to the operator once. Undefined when it was supplied or left unchanged. */
  generatedPassword?: string;
  passwordChanged: boolean;
  /** Other active coach accounts (the app treats the oldest as "the" coach): worth a look. */
  otherCoaches: { phone: string; name: string }[];
}

const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * Create the COACH user for `phone`, or promote the existing user with that number (and reactivate
 * them), and put the coach's names into the settings row. Validation happens before the database
 * is touched.
 */
export async function createOrPromoteCoach(db: PrismaClient, input: CreateCoachInput): Promise<CreateCoachResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new CoachBootstrapError(`"${input.phone}" is not a valid phone number`);
  const name = cleanName(input.name);
  if (Array.from(name).length < 2 || Array.from(name).length > MAX_NAME_LENGTH) {
    throw new CoachBootstrapError(`--name must be 2 to ${MAX_NAME_LENGTH} characters`);
  }
  const nameFa = input.nameFa === undefined ? undefined : cleanName(input.nameFa);
  if (nameFa !== undefined && (Array.from(nameFa).length < 2 || Array.from(nameFa).length > MAX_NAME_LENGTH)) {
    throw new CoachBootstrapError(`--name-fa must be 2 to ${MAX_NAME_LENGTH} characters`);
  }
  if (input.password !== undefined) {
    const problem = coachPasswordProblem(input.password, phone);
    if (problem) throw new CoachBootstrapError(problem);
  }

  const [existing, settings, otherCoaches] = await Promise.all([
    db.user.findUnique({ where: { phone } }),
    db.coachSettings.findUnique({ where: { id: 1 } }),
    db.user.findMany({
      where: { role: 'COACH', active: true, phone: { not: phone } },
      select: { phone: true, name: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const wasCoach = existing?.role === 'COACH';
  const setPassword = !existing || !wasCoach || input.password !== undefined || input.resetPassword === true;
  const generated = setPassword && input.password === undefined ? generateTempPassword(4, 4) : undefined;
  const password = input.password ?? generated;
  const passwordHash = setPassword && password !== undefined ? await hashPassword(password) : undefined;

  // The Persian name: what was given; else, while the settings row still has the placeholder, the --name.
  const faPlaceholder = !settings || settings.coachNameFa === PLACEHOLDER_COACH_NAME_FA;
  const coachNameFa = nameFa ?? (faPlaceholder ? name : undefined);

  const user = existing
    ? await db.user.update({
        where: { id: existing.id },
        data: { name, role: 'COACH', active: true, ...(passwordHash ? { passwordHash } : {}) },
      })
    : await db.user.create({ data: { phone, name, role: 'COACH', locale: 'fa', passwordHash: passwordHash! } });

  if (existing && passwordHash) {
    // a new password or a new role ends every session the account had
    await db.session.deleteMany({ where: { userId: user.id } });
  }
  await db.coachSettings.upsert({
    where: { id: 1 },
    update: { coachName: name, ...(coachNameFa ? { coachNameFa } : {}) },
    create: { id: 1, coachName: name, coachNameFa: coachNameFa ?? name, timezone: DEFAULT_TIME_ZONE },
  });

  return {
    action: !existing ? 'created' : wasCoach ? 'updated' : 'promoted',
    userId: user.id,
    phone,
    generatedPassword: generated,
    passwordChanged: Boolean(passwordHash),
    otherCoaches,
  };
}
