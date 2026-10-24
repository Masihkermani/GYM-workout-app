import { describe, expect, it } from 'vitest';
import { createClientSchema, fieldCodes } from '@/components/coach/schemas';
import { generateTempPassword } from '@/components/coach/tempPassword';
import {
  MIN_NEW_PASSWORD_LENGTH,
  isWeakPassword,
  matchesPhone,
  passwordProblem,
} from '@/lib/password-policy';
import { fieldErrorCodes, loginSchema, registerSchema } from '@/lib/validation';

describe('passwordProblem', () => {
  it('needs at least 10 characters', () => {
    expect(MIN_NEW_PASSWORD_LENGTH).toBe(10);
    expect(passwordProblem('x7!kq2Lm9')).toBe('passwordShort'); // 9
    expect(passwordProblem('x7!kq2Lm9z')).toBeNull(); // 10
    expect(passwordProblem('')).toBe('passwordShort');
  });

  it('counts characters, not UTF-16 units', () => {
    expect(passwordProblem('گلدان-کوچک')).toBeNull(); // 10 Persian characters
    expect(passwordProblem('گلدان-کوچ')).toBe('passwordShort');
  });

  it('has an upper bound', () => {
    expect(passwordProblem('a1'.repeat(101) + 'Zq')).toBe('passwordLong');
  });
});

describe('isWeakPassword', () => {
  it.each([
    // published by this project (README, seed)
    'coach-pass-1234',
    'client-pass-1234',
    'Coach-Pass-1234',
    'coach pass 1234',
    // the usual suspects, Latin and Persian digits
    '12345678',
    '123456789',
    '1234567890',
    '۱۲۳۴۵۶۷۸۹۰',
    '١٢٣٤٥٦٧٨٩٠',
    'qwertyui',
    'qwertyuiop',
    'password',
    'Password1234',
    'password-123',
    'iloveyou123',
    '1q2w3e4r5t',
    'salam123456',
    '09121234567',
    '۰۹۱۲۱۲۳۴۵۶۷',
    // patterns
    'aaaaaaaaaaaa',
    '1212121212',
    'abcabcabcabc',
    'abcdefghijkl',
    '9876543210',
    'zxcvbnmasdfghjkl'.slice(0, 7),
    'رمزعبور',
  ])('rejects %s', (password) => {
    expect(isWeakPassword(password)).toBe(true);
  });

  it.each(['x7!kq2Lm9z', 'correct horse battery staple', 'گلدان-کوچک-۷۳', 'tr0ub4dor&3-gym', generateTempPassword()])(
    'accepts %s',
    (password) => {
      expect(isWeakPassword(password)).toBe(false);
    },
  );

  it('the list has the size and the demo passwords the review asked for', () => {
    expect(isWeakPassword('coach-pass-1234')).toBe(true);
    expect(isWeakPassword('client-pass-1234')).toBe(true);
  });
});

describe('matchesPhone', () => {
  const phone = '+989121234567';
  it.each(['09121234567', '9121234567', '989121234567', '+989121234567', '00989121234567', '0912 123 4567', '0912-123-4567', '۰۹۱۲۱۲۳۴۵۶۷', 'my-09121234567-gym', 'x9121234567x'])(
    'catches %s',
    (password) => {
      expect(matchesPhone(password, phone)).toBe(true);
    },
  );

  it.each(['09121234568', 'x7!kq2Lm9z', '12345', 'abcdefghij', '0912123'])('lets %s through', (password) => {
    expect(matchesPhone(password, phone)).toBe(false);
  });

  it('works for non-Iranian numbers', () => {
    expect(matchesPhone('+49 1512 3456789', '+4915123456789')).toBe(true);
    expect(matchesPhone('00491512345678', '+4915123456789')).toBe(false);
  });

  it('is part of passwordProblem when the phone is known', () => {
    expect(passwordProblem('09121234567', phone)).toBe('passwordWeak');
    expect(passwordProblem('x-09121234567-y', phone)).toBe('passwordWeak');
  });
});

describe('the schemas apply the policy where a password is chosen', () => {
  const ok = { name: 'Test Person', phone: '09121234567', password: 'x7!kq2Lm9z' };

  it('register: 10+, not common, not the phone', () => {
    expect(registerSchema.safeParse(ok).success).toBe(true);
    const bad = (password: string) => {
      const r = registerSchema.safeParse({ ...ok, password });
      return r.success ? null : fieldErrorCodes(r.error).password;
    };
    expect(bad('')).toBe('required');
    expect(bad('short')).toBe('passwordShort');
    expect(bad('12345678')).toBe('passwordShort');
    expect(bad('1234567890')).toBe('passwordWeak');
    expect(bad('client-pass-1234')).toBe('passwordWeak');
    expect(bad('09121234567')).toBe('passwordWeak');
    expect(bad('۰۹۱۲۱۲۳۴۵۶۷')).toBe('passwordWeak');
    expect(bad('a'.repeat(201))).toBe('passwordLong');
  });

  it('coach creating a client: same rules, with the client phone', () => {
    const base = { name: 'Test Person', phone: '+98 912 123 4567', password: 'x7!kq2Lm9z', locale: 'fa' };
    expect(createClientSchema.safeParse(base).success).toBe(true);
    expect(createClientSchema.safeParse({ ...base, password: generateTempPassword() }).success).toBe(true);
    for (const [password, code] of [['some-pw-9', 'passwordShort'], ['password123', 'passwordWeak'], ['09121234567', 'passwordWeak']] as const) {
      const r = createClientSchema.safeParse({ ...base, password });
      expect(r.success).toBe(false);
      if (!r.success) expect(fieldCodes(r.error).password).toBe(code);
    }
  });

  it('login still accepts the old 8-character passwords', () => {
    expect(loginSchema.safeParse({ phone: '09121234567', password: 'oldpw-88' }).success).toBe(true);
    expect(loginSchema.safeParse({ phone: '09121234567', password: 'client-pass-1234' }).success).toBe(true);
  });
});
