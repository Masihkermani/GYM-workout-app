import { toLatinDigits } from './digits';

/**
 * What counts as an acceptable NEW password (sign-up, change password, a password the coach types for a
 * client). Pure and isomorphic: the schemas, the forms' `minLength` and the unit tests share it.
 *
 * Login deliberately checks none of this (accounts made under the old 8-character rule must still sign
 * in); the policy applies only where a password is chosen.
 */
export const MIN_NEW_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;

/** Lower-case, Latin digits, letters and digits only: "Coach-Pass-۱۲۳۴" -> "coachpass1234". */
function squash(password: string): string {
  return toLatinDigits(password).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * The published demo passwords and the usual suspects: the most common choices worldwide plus the ones
 * Iranian users pick (Latin-keyboard Persian words, names, "salam", the country, phone-number shapes).
 * Stored squashed (see `squash`). Most are shorter than the minimum, so they only matter if the minimum
 * is ever lowered or when they are padded ("password" + "1234"); the long ones are the live blocklist.
 */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  // published by this project
  'coachpass1234', 'clientpass1234', 'coachpass123', 'clientpass123', 'daftar', 'daftar123', 'daftar1234', 'daftar12345',
  '09120000000', '09120000001', '09120000002', '09120000003', '09120000004', '09120000005', '09120000006',
  // digit runs and repeats
  '12345678', '123456789', '1234567890', '12345678910', '0123456789', '987654321', '9876543210', '87654321',
  '11111111', '111111111', '1111111111', '00000000', '000000000', '0000000000', '12341234', '123123123',
  '1234512345', '11223344', '1122334455', '112233445566', '123321123', '12344321', '147258369', '147852369',
  '159357852', '123456123456', '1234567891', '0987654321', '09121234567', '09123456789', '09131234567', '9121234567',
  // keyboard walks
  'qwertyui', 'qwertyuiop', 'qwerty12', 'qwerty123', 'qwerty1234', 'qwerty12345', 'qwerty123456', 'asdfghjk',
  'asdfghjkl', 'zxcvbnm', 'zxcvbnm123', '1q2w3e4r', '1q2w3e4r5t', '1qaz2wsx', '1qaz2wsx3edc', '1qazxsw2',
  'qazwsxedc', 'zaq12wsx', 'azertyuiop', 'qwertyasdfgh',
  // words
  'password', 'password1', 'password12', 'password123', 'password1234', 'password12345', 'passw0rd', 'passw0rd123',
  'letmein', 'letmein123', 'welcome', 'welcome1', 'welcome123', 'admin', 'admin123', 'admin1234', 'admin12345',
  'administrator', 'changeme', 'changeme123', 'iloveyou', 'iloveyou1', 'iloveyou123', 'abc12345', 'abc123456',
  'abcd1234', 'abcd12345', 'abcd123456', 'abcdefgh', 'abcdefghij', 'trustno1', 'sunshine', 'princess', 'football',
  'baseball', 'superman', 'batman', 'dragon', 'monkey', 'master', 'shadow', 'freedom', 'whatever', 'starwars',
  'hello123', 'test1234', 'test12345', 'testtest', 'guest1234', 'user1234', 'gym123456', 'gymgym1234',
  // Persian words on a Latin keyboard, names, places
  'salam', 'salam123', 'salam1234', 'salam12345', 'salam123456', 'khoda123', 'iran1234', 'iran12345', 'iran123456',
  'tehran123', 'mohammad123', 'mohammad1234', 'ali123456', 'alireza123', 'hamid1234', 'mahdi1234', 'reza1234',
  'mamad1234', 'amir1234', 'amirhossein', 'mohammadreza',
  // Persian script
  'رمزعبور', 'رمزعبور123', 'سلام123', 'سلام1234', 'سلامسلام',
]);

/** Rows a hand sweeps across; any run of 6+ of them (either direction) is a keyboard walk, not a password. */
const WALKS = [
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', '01234567890', 'abcdefghijklmnopqrstuvwxyz',
  'ضصثقفغعهخحجچ', 'شسیبلاتنمکگ', 'ظطزرذدپو',
].flatMap((row) => [row, Array.from(row).reverse().join('')]);

/** Anything built from one short unit repeated ("1212121212", "abcabcabcabc", "aaaaaaaaaaaa"). */
const REPEATED_UNIT = /^(.{1,4}?)\1+$/u;

/** True for the very guessable: blocklisted, a repeated unit, or a walk along the keyboard / the alphabet. */
export function isWeakPassword(password: string): boolean {
  const s = squash(password);
  if (!s) return true;
  if (COMMON_PASSWORDS.has(s)) return true;
  if (REPEATED_UNIT.test(s)) return true;
  if (s.length >= 6 && WALKS.some((row) => row.includes(s))) return true;
  return false;
}

/** Digits of the phone in each spelling a person might type: 98912…, 0912…, 912…, 0098912… */
function phoneSpellings(phoneE164: string): string[] {
  const digits = phoneE164.replace(/\D/g, '');
  const out = new Set([digits, `00${digits}`]);
  if (digits.startsWith('98')) {
    out.add(`0${digits.slice(2)}`);
    out.add(digits.slice(2));
  }
  return [...out];
}

/** The password is (or contains) the account's own phone number, in any digits and with or without separators. */
export function matchesPhone(password: string, phoneE164: string): boolean {
  const typed = toLatinDigits(password).replace(/\D/g, '');
  if (!typed) return false;
  if (phoneSpellings(phoneE164).includes(typed)) return true;
  // the last 10 digits sit somewhere inside the password ("my-09121234567-gym")
  const digits = phoneE164.replace(/\D/g, '');
  return digits.length >= 10 && typed.includes(digits.slice(-10));
}

export type PasswordProblem = 'passwordShort' | 'passwordLong' | 'passwordWeak';

/** The first reason a new password is refused, as a stable error code, or null. */
export function passwordProblem(password: string, phoneE164?: string): PasswordProblem | null {
  const length = Array.from(password).length;
  if (length < MIN_NEW_PASSWORD_LENGTH) return 'passwordShort';
  if (length > MAX_PASSWORD_LENGTH) return 'passwordLong';
  if (isWeakPassword(password)) return 'passwordWeak';
  if (phoneE164 && matchesPhone(password, phoneE164)) return 'passwordWeak';
  return null;
}
