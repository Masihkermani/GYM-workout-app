'use client';

import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { usePathname, useRouter } from '@/i18n/navigation';
import { exerciseName } from '@/lib/training/types';
import type { ExerciseDTO } from '@/lib/training/types';

/** Exercise chooser for the progress page: navigates to `?exercise=<id>` so the page stays server-rendered and shareable. */
export function ExerciseSelect({
  options,
  value,
  locale,
}: {
  options: { exercise: ExerciseDTO; workouts: number }[];
  value: string;
  locale: string;
}) {
  const t = useTranslations('training');
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Field label={t('progress.exercise')}>
      <Select
        value={value}
        onChange={(e) => router.replace(`${pathname}?exercise=${encodeURIComponent(e.target.value)}`, { scroll: false })}
      >
        {options.map((o) => (
          <option key={o.exercise.id} value={o.exercise.id}>
            {exerciseName(o.exercise, locale)}
          </option>
        ))}
      </Select>
    </Field>
  );
}
