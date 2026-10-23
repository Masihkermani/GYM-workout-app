import type { TrainingCardData } from '@/components/training/TrainingCard';

/**
 * The sample training day on the landing page: realistic numbers, mid-session (a record on the
 * bench, two rows still open). Names are written per language, not machine-translated.
 */
export function sampleCard(locale: string, date: Date): TrainingCardData {
  const fa = locale === 'fa';
  return {
    clientName: fa ? 'سارا احمدی' : 'Sara Ahmadi',
    dayTitle: fa ? 'روز اول — سینه و سرشانه' : 'A — Push',
    date,
    rows: [
      {
        exerciseName: fa ? 'پرس سینه هالتر' : 'Barbell bench press',
        targetSets: 4,
        targetRepsMin: 6,
        targetRepsMax: 8,
        targetWeightKg: 60,
        sets: [
          { reps: 8, weightKg: 60 },
          { reps: 8, weightKg: 60 },
          { reps: 7, weightKg: 62.5, isPr: true },
          { reps: 6, weightKg: 62.5 },
        ],
      },
      {
        exerciseName: fa ? 'پرس بالاسینه دمبل' : 'Incline dumbbell press',
        targetSets: 3,
        targetRepsMin: 8,
        targetRepsMax: 10,
        targetWeightKg: 22,
        sets: [
          { reps: 10, weightKg: 22 },
          { reps: 9, weightKg: 22 },
          { reps: 8, weightKg: 22 },
        ],
      },
      {
        exerciseName: fa ? 'پرس سرشانه دمبل نشسته' : 'Seated dumbbell shoulder press',
        targetSets: 3,
        targetRepsMin: 8,
        targetRepsMax: 10,
        targetWeightKg: 18,
        sets: [
          { reps: 10, weightKg: 18 },
          { reps: 9, weightKg: 18 },
        ],
      },
      {
        exerciseName: fa ? 'نشر از جانب دمبل' : 'Dumbbell lateral raise',
        targetSets: 3,
        targetRepsMin: 12,
        targetRepsMax: 15,
        targetWeightKg: 8,
        sets: [],
      },
      {
        exerciseName: fa ? 'پشت‌بازو سیم‌کش' : 'Cable pushdown',
        targetSets: 3,
        targetRepsMin: 10,
        targetRepsMax: 12,
        targetWeightKg: 25,
        sets: [],
      },
    ],
  };
}
