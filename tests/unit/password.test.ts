import { describe, expect, it } from 'vitest';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '@/lib/password';

describe('argon2id password hashing', () => {
  it('round-trips', async () => {
    const hash = await hashPassword('client-pass-1234');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(hash, 'client-pass-1234')).toBe(true);
    expect(await verifyPassword(hash, 'client-pass-1235')).toBe(false);
  });
  it('salts: the same password hashes differently each time', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password'), hashPassword('same-password')]);
    expect(a).not.toBe(b);
  });
  it('handles Persian passwords', async () => {
    const hash = await hashPassword('رمز-عبور-امن-۱۲۳۴');
    expect(await verifyPassword(hash, 'رمز-عبور-امن-۱۲۳۴')).toBe(true);
    expect(await verifyPassword(hash, 'رمز-عبور-امن-1234')).toBe(false);
  });
  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'x')).toBe(false);
  });
  it('dummy verify always yields false', async () => {
    expect(await verifyAgainstDummy('anything')).toBe(false);
  });
});
