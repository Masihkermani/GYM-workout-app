'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { NumberInput } from '@/components/ui/NumberInput';
import { Sheet } from '@/components/ui/Sheet';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

export interface EditSetValues {
  reps: number;
  weightKg: number;
  rpe: number | null;
  isWarmup: boolean;
}

/**
 * Fix or remove a logged set. Keep it mounted and toggle `open` (the Sheet must see open go false ->
 * true; mounting it already open is closed again by React Strict Mode's double effect in dev). The
 * fields reload from `initial` each time it opens.
 */
export function EditSetSheet({
  open,
  onOpenChange,
  title,
  initial,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: EditSetValues;
  onSave: (values: EditSetValues) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('training');
  const locale = useLocale();
  const [reps, setReps] = useState<number | null>(initial.reps);
  const [weight, setWeight] = useState<number | null>(initial.weightKg);
  const [rpe, setRpe] = useState<number | null>(initial.rpe);
  const [warmup, setWarmup] = useState(initial.isWarmup);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    // adjust state while rendering (the documented pattern for "reset when a prop changes")
    setWasOpen(open);
    if (open) {
      setReps(initial.reps);
      setWeight(initial.weightKg);
      setRpe(initial.rpe);
      setWarmup(initial.isWarmup);
      setError(null);
    }
  }

  function save() {
    if (reps == null || reps < 1) return setError(t('logger.needReps'));
    if (weight == null) return setError(t('logger.needWeight'));
    onSave({ reps, weightKg: weight, rpe, isWarmup: warmup });
    onOpenChange(false);
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <div className="flex gap-3">
          <Button variant="ink" size="lg" className="flex-1" onClick={save}>
            {t('edit.save')}
          </Button>
          <Button
            variant="danger"
            size="lg"
            onClick={() => {
              onDelete();
              onOpenChange(false);
            }}
          >
            <Trash2 className="size-5" aria-hidden="true" />
            {t('edit.delete')}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={t('logger.weight')}>
          <NumberInput size="xl" step={2.5} min={0} max={1000} decimals={2} unit={t('logger.kg')} value={weight} onChange={setWeight} />
        </Field>
        <Field label={t('logger.reps')}>
          <NumberInput size="xl" step={1} min={1} max={200} decimals={0} unit={t('logger.repsUnit')} value={reps} onChange={setReps} />
        </Field>
        <div role="group" aria-label={t('logger.rpe')} className="flex flex-wrap gap-2">
          {[6, 7, 8, 9, 10].map((v) => {
            const on = rpe === v;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                aria-label={t('logger.rpeN', { n: formatNumber(v, locale, { grouping: false }) })}
                onClick={() => setRpe(on ? null : v)}
                className={cn(
                  'num flex min-h-11 min-w-12 items-center justify-center rounded-[var(--r)] border-[1.5px] px-3 text-lg tx',
                  on ? 'border-ink bg-ink text-paper' : 'border-ink-3 bg-card text-ink hover:border-ink',
                )}
              >
                {formatNumber(v, locale, { grouping: false })}
              </button>
            );
          })}
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base">
          <input type="checkbox" checked={warmup} onChange={(e) => setWarmup(e.target.checked)} className="size-5 accent-[var(--ink)]" />
          {t('logger.warmup')}
        </label>
        <p role="alert" className="text-sm font-medium text-danger empty:hidden">
          {error}
        </p>
        {/* lets Enter in a number field save; hidden from everyone else (the footer button is the real one) */}
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Sheet>
  );
}
