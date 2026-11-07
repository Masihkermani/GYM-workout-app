'use client';

import { useState, type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { exerciseName } from '@/lib/training/types';
import type { ExerciseThumbDTO } from '@/lib/media/dto';
import { ExerciseInfoSheet, type InfoExercise } from './ExerciseInfoSheet';
import { ExerciseThumb } from './ExerciseThumb';

type Variant = 'thumb' | 'icon' | 'text';

/**
 * Opens the "how to" sheet for an exercise. Three looks, one behaviour:
 *  - thumb: the exercise's picture (or the placeholder) as a button, `size` px square (min 44),
 *  - icon: a 44 px "?" button,
 *  - text: its children (the exercise name) as a link-styled button.
 * The sheet is mounted only while open, so a list of rows costs no dialogs.
 */
export function ExerciseInfoButton({
  exercise,
  thumb,
  variant = 'icon',
  size = 56,
  className,
  children,
}: {
  exercise: InfoExercise;
  thumb?: ExerciseThumbDTO | null;
  variant?: Variant;
  size?: number;
  className?: string;
  children?: ReactNode;
}) {
  const t = useTranslations('training');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const label = t('info.openFor', { name: exerciseName(exercise, locale) });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={label}
        data-testid="exercise-info-button"
        className={cn(
          'shrink-0 rounded-[var(--r)] tx focus-visible:outline-offset-2',
          variant === 'thumb' && 'flex items-center justify-center hover:opacity-80',
          variant === 'icon' && 'flex size-11 items-center justify-center text-ink-2 hover:bg-paper-2 hover:text-ink',
          variant === 'text' && 'inline-flex min-h-11 items-center text-start font-semibold underline decoration-ink-3 decoration-1 underline-offset-4 hover:decoration-ink',
          className,
        )}
        style={variant === 'thumb' ? { minWidth: Math.max(44, size), minHeight: Math.max(44, size) } : undefined}
      >
        {variant === 'thumb' ? <ExerciseThumb thumb={thumb} size={size} /> : null}
        {variant === 'icon' ? <CircleHelp className="size-5" aria-hidden="true" /> : null}
        {variant === 'text' ? children : null}
      </button>
      {open ? <ExerciseInfoSheet open onOpenChange={setOpen} exercise={exercise} /> : null}
    </>
  );
}
