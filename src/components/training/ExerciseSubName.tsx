import { cn } from '@/lib/cn';
import { exerciseSubName, type ExerciseNameSource } from '@/lib/training/types';

/**
 * The English exercise name that sits under the Persian one (fa only, only when it differs).
 *
 * A block-level `dir="ltr"` box inside an RTL parent aligns to the LEFT edge, i.e. the far side from
 * the Persian name it belongs to. The English text is therefore an inline `<bdi dir="ltr">` inside a
 * plain block: the block keeps the page direction (the line starts at the start edge, under the
 * name) and the bdi keeps the Latin words in reading order.
 */
export function ExerciseSubName({
  exercise,
  locale,
  className,
}: {
  exercise: ExerciseNameSource;
  locale: string;
  className?: string;
}) {
  const sub = exerciseSubName(exercise, locale);
  if (!sub) return null;
  return (
    <span className={cn('block text-start text-sm text-ink-3', className)}>
      <bdi lang="en" dir="ltr">
        {sub}
      </bdi>
    </span>
  );
}
