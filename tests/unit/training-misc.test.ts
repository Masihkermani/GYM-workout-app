import { describe, expect, it } from 'vitest';
import { formatClock } from '@/components/training/clock';
import { joinFacts, sepFor } from '@/components/training/sep';
import { dayToCardData } from '@/lib/training/card';
import { defaultDayTitle } from '@/lib/training/day-title';
import { exerciseName, exerciseSubName, isBodyweight, usesBarbell } from '@/lib/training/types';

describe('defaultDayTitle', () => {
  it('uses Persian ordinals up to ten, then Persian digits', () => {
    expect(defaultDayTitle(1, 'fa')).toBe('روز اول');
    expect(defaultDayTitle(3, 'fa')).toBe('روز سوم');
    expect(defaultDayTitle(12, 'fa')).toBe('روز ۱۲');
    expect(defaultDayTitle(2, 'en')).toBe('Day 2');
  });
});

describe('separators (never a middle dot in Persian)', () => {
  it('uses the Persian comma in fa and a middle dot in en', () => {
    expect(sepFor('fa')).toBe('، ');
    expect(sepFor('en')).toBe(' · ');
    expect(joinFacts(['a', null, 'b', false, 'c'], 'fa')).toBe('a، b، c');
    expect(joinFacts(['a', 'b'], 'en')).toBe('a · b');
    expect(joinFacts(['a', 'b'], 'fa')).not.toContain('·');
  });
});

describe('formatClock', () => {
  it('renders m:ss and h:mm:ss with the locale digits', () => {
    expect(formatClock(75, 'en')).toBe('1:15');
    expect(formatClock(3725, 'en')).toBe('1:02:05');
    expect(formatClock(75, 'fa')).toBe('۱:۱۵');
    expect(formatClock(-5, 'en')).toBe('0:00');
  });
});

describe('exercise helpers', () => {
  const ex = { nameEn: 'Barbell bench press', nameFa: 'پرس سینه هالتر' };
  it('leads with the Persian name in fa and keeps the English one for the small line', () => {
    expect(exerciseName(ex, 'fa')).toBe('پرس سینه هالتر');
    expect(exerciseSubName(ex, 'fa')).toBe('Barbell bench press');
    expect(exerciseName(ex, 'en')).toBe('Barbell bench press');
    expect(exerciseSubName(ex, 'en')).toBeNull();
    expect(exerciseName({ nameEn: 'Plank', nameFa: null }, 'fa')).toBe('Plank');
    expect(exerciseSubName({ nameEn: 'Plank', nameFa: null }, 'fa')).toBeNull();
  });
  it('shows the plates diagram for bar-loaded equipment only', () => {
    for (const e of ['barbell', 'ez barbell', 'smith machine', 'olympic barbell']) expect(usesBarbell(e)).toBe(true);
    for (const e of ['dumbbell', 'cable', 'body weight', 'leverage machine']) expect(usesBarbell(e)).toBe(false);
    expect(isBodyweight('body weight')).toBe(true);
  });
});

describe('dayToCardData', () => {
  it('turns a program day into card rows with no sets done', () => {
    const card = dayToCardData({
      clientName: 'مهسا',
      dayTitle: 'روز اول',
      date: new Date('2026-10-23T08:00:00Z'),
      locale: 'fa',
      items: [{ exercise: { nameEn: 'Squat', nameFa: 'اسکات' }, targetSets: 4, targetRepsMin: 6, targetRepsMax: 8, targetWeightKg: 60 }],
    });
    expect(card.rows).toEqual([
      { exerciseName: 'اسکات', targetSets: 4, targetRepsMin: 6, targetRepsMax: 8, targetWeightKg: 60, sets: [] },
    ]);
  });
});
