import { describe, expect, it } from 'vitest';
import {
  createProgramSchema,
  logSetSchema,
  updateItemSchema,
  updateSetSchema,
  exerciseSearchSchema,
  decimal,
  integer,
} from '@/lib/training/schemas';

describe('numeric input is Persian-digit tolerant', () => {
  it('parses ۳۰ and ۸ typed on a Persian keyboard', () => {
    const r = logSetSchema.parse({ workoutId: 'w', exerciseId: 'e', reps: '۸', weightKg: '۳۰' });
    expect(r.reps).toBe(8);
    expect(r.weightKg).toBe(30);
  });
  it('parses Arabic-Indic digits and the Persian decimal separator', () => {
    expect(decimal(0, 1000).parse('٢٫٥')).toBe(2.5);
    expect(decimal(0, 1000).parse('۶۲٫۵')).toBe(62.5);
    expect(integer(1, 50).parse('٣')).toBe(3);
  });
  it('accepts plain numbers and rounds weights to 2 decimals', () => {
    expect(decimal(0, 100).parse(1.256)).toBe(1.26);
    expect(integer(1, 10).parse(4)).toBe(4);
  });
  it('rejects out-of-range, fractional reps and garbage', () => {
    expect(logSetSchema.safeParse({ workoutId: 'w', exerciseId: 'e', reps: 0, weightKg: 10 }).success).toBe(false);
    expect(logSetSchema.safeParse({ workoutId: 'w', exerciseId: 'e', reps: 8.5, weightKg: 10 }).success).toBe(false);
    expect(logSetSchema.safeParse({ workoutId: 'w', exerciseId: 'e', reps: 8, weightKg: -1 }).success).toBe(false);
    expect(logSetSchema.safeParse({ workoutId: 'w', exerciseId: 'e', reps: 8, weightKg: 'abc' }).success).toBe(false);
    expect(logSetSchema.safeParse({ workoutId: 'w', exerciseId: 'e', reps: 8, weightKg: 5000 }).success).toBe(false);
  });
});

describe('optional vs nullable fields', () => {
  it('keeps an omitted field undefined (an update must not clear it) and maps empty to null', () => {
    const omitted = updateItemSchema.parse({ itemId: 'i', targetSets: '۴' });
    expect(omitted.targetSets).toBe(4);
    expect('targetRepsMax' in omitted && omitted.targetRepsMax !== undefined).toBe(false);
    expect(omitted.targetWeightKg).toBeUndefined();
    expect(omitted.note).toBeUndefined();

    const cleared = updateItemSchema.parse({ itemId: 'i', targetRepsMax: '', targetWeightKg: null, note: '' });
    expect(cleared.targetRepsMax).toBeNull();
    expect(cleared.targetWeightKg).toBeNull();
    expect(cleared.note).toBeNull();
  });
  it('updateSet leaves rpe alone when omitted', () => {
    expect(updateSetSchema.parse({ setId: 's', reps: 5 }).rpe).toBeUndefined();
    expect(updateSetSchema.parse({ setId: 's', rpe: null }).rpe).toBeNull();
    expect(updateSetSchema.parse({ setId: 's', rpe: '۸٫۵' }).rpe).toBe(8.5);
  });
});

describe('text', () => {
  it('normalises Arabic yeh/kaf and trims in program titles', () => {
    expect(createProgramSchema.parse({ title: '  برنامه ي  كل بدن ' }).title).toBe('برنامه ی کل بدن');
  });
  it('requires a title', () => {
    expect(createProgramSchema.safeParse({ title: '   ' }).success).toBe(false);
  });
  it('defaults the search query to empty and caps the limit', () => {
    expect(exerciseSearchSchema.parse({}).q).toBe('');
    expect(exerciseSearchSchema.safeParse({ q: 'x', limit: 500 }).success).toBe(false);
  });
});
