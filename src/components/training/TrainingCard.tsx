/**
 * CONTRACT STUB (training agent owns this file and builds the real signature component from docs/DESIGN.md;
 * keep the export names and the TrainingCardData shape — the landing page renders it with sample data).
 */
export type TrainingCardSet = { reps: number; weightKg: number; isPr?: boolean };
export type TrainingCardRow = {
  exerciseName: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax?: number | null;
  targetWeightKg?: number | null;
  sets: TrainingCardSet[];
};
export type TrainingCardData = {
  clientName: string;
  dayTitle: string;
  date: Date;
  rows: TrainingCardRow[];
};

export function TrainingCard({ data, locale }: { data: TrainingCardData; locale: string }) {
  return (
    <div data-locale={locale} className="border border-rule-strong bg-card p-4">
      {data.dayTitle}
    </div>
  );
}
