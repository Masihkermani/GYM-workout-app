import { describe, expect, it } from 'vitest';
import {
  digitsOnly,
  localizeNumberString,
  normalizeNumberString,
  parseDecimal,
  parseInteger,
  toLatinDigits,
  toPersianDigits,
} from '@/lib/digits';

describe('toLatinDigits', () => {
  it('converts Persian digits', () => expect(toLatinDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789'));
  it('converts Arabic-Indic digits', () => expect(toLatinDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789'));
  it('leaves Latin digits and letters alone', () => expect(toLatinDigits('a1b2')).toBe('a1b2'));
  it('handles mixed scripts', () => expect(toLatinDigits('۱2٣')).toBe('123'));
});

describe('toPersianDigits', () => {
  it('converts Latin digits', () => expect(toPersianDigits('1405/01/01')).toBe('۱۴۰۵/۰۱/۰۱'));
});

describe('normalizeNumberString', () => {
  it('maps every decimal separator to a dot', () => {
    expect(normalizeNumberString('۲٫۵')).toBe('2.5');
    expect(normalizeNumberString('2,5')).toBe('2.5');
    expect(normalizeNumberString('۲،۵')).toBe('2.5');
    expect(normalizeNumberString('2.5')).toBe('2.5');
  });
  it('drops whitespace, ZWNJ, bidi marks and Arabic thousands separators', () => {
    expect(normalizeNumberString(' ۱‌۲ ‏')).toBe('12');
    expect(normalizeNumberString('۱٬۲۰۰')).toBe('1200');
  });
  it('maps unicode minus', () => expect(normalizeNumberString('−3')).toBe('-3'));
});

describe('parseDecimal', () => {
  it('parses Persian input: ۳۰ -> 30', () => expect(parseDecimal('۳۰')).toBe(30));
  it('parses Persian decimals: ۲٫۵ -> 2.5', () => expect(parseDecimal('۲٫۵')).toBe(2.5));
  it('parses Arabic-Indic decimals', () => expect(parseDecimal('٢٫٥')).toBe(2.5));
  it('parses comma decimals', () => expect(parseDecimal('1,25')).toBe(1.25));
  it('parses mid-typing values', () => {
    expect(parseDecimal('30.')).toBe(30);
    expect(parseDecimal('.5')).toBe(0.5);
  });
  it('parses negatives', () => expect(parseDecimal('-2.5')).toBe(-2.5));
  it('returns null on garbage', () => {
    for (const bad of ['', ' ', 'abc', '30kg', '1.2.3', '--1', '-', '.', '1..2', '١٢a', '1e5']) {
      expect(parseDecimal(bad), `"${bad}"`).toBeNull();
    }
  });
  it('returns null for null / undefined', () => {
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal(undefined)).toBeNull();
  });
});

describe('parseInteger', () => {
  it('parses Persian ints', () => expect(parseInteger('۱۲')).toBe(12));
  it('rejects decimals and garbage', () => {
    for (const bad of ['', '3.5', '3.0', 'x', '1,2', '12a']) {
      expect(parseInteger(bad), `"${bad}"`).toBeNull();
    }
  });
});

describe('digitsOnly / localizeNumberString', () => {
  it('digitsOnly', () => expect(digitsOnly('۰۹۱۲-۱۲۳')).toBe('0912123'));
  it('localizes for fa char for char', () => {
    expect(localizeNumberString('12.5', 'fa')).toBe('۱۲٫۵');
    expect(localizeNumberString('12.5', 'en')).toBe('12.5');
  });
});
