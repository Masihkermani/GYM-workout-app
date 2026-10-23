import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en/training.json';
import fa from '../../messages/fa/training.json';
import { loggedSetLabel, loggedSetList } from '@/components/training/sets';
import { exerciseSubName } from '@/lib/training/types';

const tFa = createTranslator({ locale: 'fa', messages: fa, namespace: undefined as never });
const tEn = createTranslator({ locale: 'en', messages: en, namespace: undefined as never });

describe('loggedSetLabel: a bodyweight set is never a bare number', () => {
  it('reads «۶ تکرار» in Persian and "6 reps" in English', () => {
    expect(loggedSetLabel(tFa, 6, 0, 'fa')).toBe('۶ تکرار');
    expect(loggedSetLabel(tEn, 6, 0, 'en')).toBe('6 reps');
    expect(loggedSetLabel(tEn, 1, 0, 'en')).toBe('1 rep');
  });

  it('keeps reps × weight for a weighted set', () => {
    expect(loggedSetLabel(tFa, 8, 30, 'fa')).toBe('۸ × ۳۰ کیلو');
    expect(loggedSetLabel(tEn, 8, 32.5, 'en')).toBe('8 × 32.5 kg');
  });
});

describe('loggedSetList', () => {
  it('says the unit once when every set is bodyweight', () => {
    expect(loggedSetList(tFa, [{ reps: 6, weightKg: 0 }, { reps: 8, weightKg: 0 }, { reps: 8, weightKg: 0 }], 'fa')).toBe('۶، ۸، ۸ تکرار');
    expect(loggedSetList(tEn, [{ reps: 6, weightKg: 0 }, { reps: 8, weightKg: 0 }], 'en')).toBe('6, 8 reps');
  });

  it('labels each set when weighted and bodyweight sets are mixed', () => {
    expect(loggedSetList(tEn, [{ reps: 8, weightKg: 0 }, { reps: 6, weightKg: 10 }], 'en')).toBe('8 reps, 6 × 10 kg');
  });

  it('is empty for no sets', () => {
    expect(loggedSetList(tEn, [], 'en')).toBe('');
  });
});

describe('exerciseSubName', () => {
  it('is the English name in fa only, and only when it differs', () => {
    expect(exerciseSubName({ nameEn: 'Cable seated row', nameFa: 'زیربغل نشسته دستگاه' }, 'fa')).toBe('Cable seated row');
    expect(exerciseSubName({ nameEn: 'Cable seated row', nameFa: 'زیربغل نشسته دستگاه' }, 'en')).toBeNull();
    expect(exerciseSubName({ nameEn: 'Plank', nameFa: 'Plank' }, 'fa')).toBeNull();
    expect(exerciseSubName({ nameEn: 'Plank', nameFa: null }, 'fa')).toBeNull();
  });
});
