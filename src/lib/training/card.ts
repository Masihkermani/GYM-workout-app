import type { TrainingCardData, TrainingCardRow, TrainingCardSet } from '@/components/training/TrainingCard';
import { exerciseName, type ExerciseNameSource } from './types';

export interface CardItemInput {
  exercise: ExerciseNameSource;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax?: number | null;
  targetWeightKg?: number | null;
}

export interface CardSetInput extends TrainingCardSet {
  isWarmup?: boolean;
}

/** A program day as a card: targets only, no sets done yet (previews, program list). */
export function dayToCardData(opts: {
  clientName: string;
  dayTitle: string;
  date: Date;
  items: readonly CardItemInput[];
  locale: string;
}): TrainingCardData {
  return {
    clientName: opts.clientName,
    dayTitle: opts.dayTitle,
    date: opts.date,
    rows: opts.items.map(
      (it): TrainingCardRow => ({
        exerciseName: exerciseName(it.exercise, opts.locale),
        targetSets: it.targetSets,
        targetRepsMin: it.targetRepsMin,
        targetRepsMax: it.targetRepsMax ?? null,
        targetWeightKg: it.targetWeightKg ?? null,
        sets: [],
      }),
    ),
  };
}
