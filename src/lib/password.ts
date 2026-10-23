import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id with the OWASP 2024 minimum profile (19 MiB, t=2, p=1).
 * `algorithm: 2` is argon2id (the const enum is not usable under isolatedModules).
 */
const ARGON2_OPTIONS = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Constant-time verify. Returns false (never throws) for malformed hashes. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Burn the same CPU as a real verification when the account does not exist, so login timing does
 * not reveal which phone numbers are registered.
 */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword('daftar-dummy-password');
  await verifyPassword(await dummyHash, password);
  return false;
}
