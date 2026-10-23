'use client';

import { useId, type FormEvent, type ReactNode } from 'react';
import { CircleAlert, RotateCcw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { BarbellDiagram } from '@/components/ui/BarbellDiagram';
import { Field } from '@/components/ui/Field';
import { NumberInput } from '@/components/ui/NumberInput';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

export interface SetLoggerValues {
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  warmup: boolean;
}

/**
 * The screen a client uses between sets with sweaty hands: two giant steppers (weight in 2.5 kg
 * steps, reps in 1s; 56px+ hit targets, typing accepts Persian digits), optional RPE chips and a
 * warm-up toggle, a barbell diagram for bar-loaded lifts, and a one-tap "same as last set".
 * Enter in either number field logs the set (the Log button lives in the sticky dock and is tied to
 * this form by `formId`).
 */
export function SetLogger({
  formId,
  values,
  onChange,
  onSubmit,
  showBar,
  barKg,
  bodyweight,
  sameAs,
  error,
  errorField,
}: {
  formId: string;
  values: SetLoggerValues;
  onChange: (patch: Partial<SetLoggerValues>) => void;
  onSubmit: () => void;
  showBar: boolean;
  barKg: number;
  bodyweight: boolean;
  sameAs: { label: string; onApply: () => void } | null;
  error: string | null;
  errorField: 'weight' | 'reps' | null;
}): ReactNode {
  const t = useTranslations('training');
  const locale = useLocale();
  const rpeGroup = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <Field
          label={bodyweight ? t('logger.weightBodyweight') : t('logger.weight')}
          error={errorField === 'weight' ? error : undefined}
        >
          <NumberInput
            size="xl"
            step={2.5}
            min={0}
            max={1000}
            decimals={2}
            unit={t('logger.kg')}
            value={values.weightKg}
            onChange={(weightKg) => onChange({ weightKg })}
            aria-invalid={errorField === 'weight' || undefined}
          />
        </Field>
        <Field label={t('logger.reps')} error={errorField === 'reps' ? error : undefined}>
          <NumberInput
            size="xl"
            step={1}
            min={1}
            max={200}
            decimals={0}
            unit={t('logger.repsUnit')}
            value={values.reps}
            onChange={(reps) => onChange({ reps })}
            aria-invalid={errorField === 'reps' || undefined}
          />
        </Field>
      </div>

      {sameAs ? (
        <button
          type="button"
          onClick={sameAs.onApply}
          className="flex min-h-11 items-center justify-center gap-2 self-start rounded-[var(--r)] border-[1.5px] border-ink px-4 text-base font-semibold text-ink tx hover:bg-paper-2 active:translate-y-px"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          {sameAs.label}
        </button>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-rule pt-4">
        <div role="group" aria-labelledby={rpeGroup} className="flex flex-col gap-2">
          <p id={rpeGroup} className="text-sm font-semibold text-ink">
            {t('logger.rpe')} <span className="font-normal text-ink-3">({t('logger.optional')})</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {[6, 7, 8, 9, 10].map((v) => {
              const on = values.rpe === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  aria-label={t('logger.rpeN', { n: formatNumber(v, locale, { grouping: false }) })}
                  onClick={() => onChange({ rpe: on ? null : v })}
                  className={cn(
                    'num flex min-h-11 min-w-12 items-center justify-center rounded-[var(--r)] border-[1.5px] px-3 text-lg tx active:translate-y-px',
                    on ? 'border-ink bg-ink text-paper' : 'border-ink-3 bg-card text-ink hover:border-ink',
                  )}
                >
                  {formatNumber(v, locale, { grouping: false })}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-ink">
          <input
            type="checkbox"
            checked={values.warmup}
            onChange={(e) => onChange({ warmup: e.target.checked })}
            className="size-5 shrink-0 accent-[var(--ink)]"
          />
          <span>{t('logger.warmup')}</span>
        </label>
      </div>

      {error && !errorField ? (
        <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger">
          <CircleAlert className="mt-[0.2em] size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      {showBar ? (
        <div className="min-h-[9.5rem] border-t border-rule pt-3">
          <BarbellDiagram weightKg={values.weightKg ?? 0} barKg={barKg} />
        </div>
      ) : null}
    </form>
  );
}
