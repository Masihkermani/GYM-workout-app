import { describe, expect, it } from 'vitest';
import { foldText, matchesClient, phoneNeedle, searchTokens, tokenVariants } from '@/components/coach/search';

describe('foldText', () => {
  it('ignores ZWNJ, Arabic yeh/kaf, diacritics, spaces and case', () => {
    expect(foldText('علی‌رضا نوری')).toBe(foldText('علیرضا  نوری'));
    expect(foldText('كريم')).toBe(foldText('کریم'));
    expect(foldText('Amir Hossein')).toBe('amirhossein');
    expect(foldText('پُرس')).toBe(foldText('پرس'));
  });

  it('turns Persian and Arabic-Indic digits into Latin ones', () => {
    expect(foldText('۴۵ درجه')).toBe('45درجه');
    expect(foldText('٤٥')).toBe('45');
  });
});

describe('searchTokens / tokenVariants', () => {
  it('splits on whitespace and caps the token count', () => {
    expect(searchTokens('  پرس   سینه ')).toEqual(['پرس', 'سینه']);
    expect(searchTokens('a b c d e f g h')).toHaveLength(6);
  });

  it('tries both digit systems against stored text', () => {
    expect(tokenVariants('۴۵')).toEqual(['45', '۴۵']);
    expect(tokenVariants('squat')).toEqual(['squat']);
  });
});

describe('phoneNeedle', () => {
  it('drops the national trunk zero and needs at least three digits', () => {
    expect(phoneNeedle('۰۹۱۲ ۰۰۰')).toBe('912000');
    expect(phoneNeedle('0912')).toBe('912');
    expect(phoneNeedle('+98 912')).toBe('98912');
    expect(phoneNeedle('09')).toBeNull();
    expect(phoneNeedle('سارا')).toBeNull();
  });
});

describe('matchesClient', () => {
  const sara = { name: 'سارا کریمی', phone: '+989120000003' };
  const ali = { name: 'علی‌رضا نوری', phone: '+989120000002' };
  const amir = { name: 'Amirhossein Farhadi', phone: '+989120000004' };

  it('finds by Persian or English name, with or without the half-space', () => {
    expect(matchesClient(sara, 'سارا')).toBe(true);
    expect(matchesClient(ali, 'علیرضا')).toBe(true);
    expect(matchesClient(ali, 'علی‌رضا')).toBe(true);
    expect(matchesClient(amir, 'amir hos')).toBe(true);
    expect(matchesClient(sara, 'نوری')).toBe(false);
  });

  it('finds by phone typed in any digits, national or international', () => {
    expect(matchesClient(sara, '۰۹۱۲۰۰۰۰۰۰۳')).toBe(true);
    expect(matchesClient(sara, '0912 000 0003')).toBe(true);
    expect(matchesClient(sara, '+98912000')).toBe(true);
    expect(matchesClient(sara, '٠٩١٢٠٠٠٠٠٠٢')).toBe(false);
  });

  it('an empty query matches everyone', () => {
    expect(matchesClient(sara, '   ')).toBe(true);
  });
});
