import { describe, expect, it } from 'vitest';
import { formatPhone, isValidPhone, normalizePhone } from '@/lib/phone';

describe('normalizePhone', () => {
  it.each([
    ['09121234567', '+989121234567'],
    ['9121234567', '+989121234567'],
    ['+989121234567', '+989121234567'],
    ['00989121234567', '+989121234567'],
    ['989121234567', '+989121234567'],
    ['0912 123 4567', '+989121234567'],
    ['0912-123-4567', '+989121234567'],
    ['(0912) 123.4567', '+989121234567'],
    ['+98 912 123 4567', '+989121234567'],
    ['+98 (0) 912 123 4567', '+989121234567'],
  ])('%s -> %s', (input, expected) => expect(normalizePhone(input)).toBe(expected));

  it('accepts Persian digits with spaces: ۰۹۱۲ ۱۲۳ ۴۵۶۷', () => {
    expect(normalizePhone('۰۹۱۲ ۱۲۳ ۴۵۶۷')).toBe('+989121234567');
  });
  it('accepts Arabic-Indic digits', () => expect(normalizePhone('٠٩١٢١٢٣٤٥٦٧')).toBe('+989121234567'));
  it('accepts Persian digits with +98', () => expect(normalizePhone('+۹۸۹۱۲۱۲۳۴۵۶۷')).toBe('+989121234567'));
  it('keeps other countries as E.164', () => {
    expect(normalizePhone('+4915112345678')).toBe('+4915112345678');
    expect(normalizePhone('004915112345678')).toBe('+4915112345678');
    expect(normalizePhone('+1 (415) 555-2671')).toBe('+14155552671');
  });
  it('rejects garbage', () => {
    for (const bad of ['', '   ', 'abc', '0912', '091212345678', '08121234567', '+98912123', '+0123456789', '+98 812 123 4567', '12']) {
      expect(normalizePhone(bad), `"${bad}"`).toBeNull();
    }
  });
  it('isValidPhone mirrors normalizePhone', () => {
    expect(isValidPhone('09121234567')).toBe(true);
    expect(isValidPhone('nope')).toBe(false);
  });
});

describe('formatPhone', () => {
  it('shows Iranian mobiles nationally', () => {
    expect(formatPhone('+989121234567', 'en')).toBe('0912 123 4567');
  });
  it('uses Persian digits for fa', () => {
    expect(formatPhone('+989121234567', 'fa')).toBe('۰۹۱۲ ۱۲۳ ۴۵۶۷');
  });
  it('keeps international numbers with a plus', () => {
    expect(formatPhone('+4915112345678', 'en')).toBe('+4915112345678');
  });
});
