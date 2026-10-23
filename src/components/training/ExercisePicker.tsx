'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Sheet } from '@/components/ui/Sheet';
import { formatNumber } from '@/lib/format';
import { exerciseName, exerciseSubName, type ExerciseDTO } from '@/lib/training/types';
import { searchExercisesAction } from '@/server/training';
import { joinFacts } from './sep';
import { BODY_PARTS, EQUIPMENT, bodyPartLabel, equipmentLabel } from './labels';

/**
 * Searchable sheet over the exercise library. Matches English and Persian names (every word), can be
 * narrowed by body part and equipment, and asks the server for at most 30 results at a time. In
 * Persian the Persian name leads and the English one sits small beneath it.
 */
export function ExercisePicker({
  open,
  onOpenChange,
  onSelect,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (exercise: ExerciseDTO) => void;
  title?: string;
}) {
  const t = useTranslations('training');
  const locale = useLocale();
  const [q, setQ] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [equipment, setEquipment] = useState('');
  const [results, setResults] = useState<ExerciseDTO[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const seq = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const statusId = useId();

  // focus the search box when the sheet opens (the dialog would otherwise focus the close button)
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => searchRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    setState('loading');
    const timer = setTimeout(async () => {
      try {
        const r = await searchExercisesAction({ q, bodyPart: bodyPart || null, equipment: equipment || null, limit: 30 });
        if (mine !== seq.current) return; // a newer search is already running
        if (r.ok) {
          setResults(r.exercises);
          setState('idle');
        } else {
          setState('error');
        }
      } catch {
        if (mine === seq.current) setState('error');
      }
    }, q ? 220 : 0);
    return () => clearTimeout(timer);
  }, [open, q, bodyPart, equipment]);

  const count = formatNumber(results.length, locale, { grouping: false });

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title ?? t('picker.title')}>
      <div className="flex flex-col gap-4">
        <Field label={t('picker.search')}>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-5 text-ink-3" aria-hidden="true" />
            <Input
              ref={searchRef}
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              placeholder={t('picker.placeholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-describedby={statusId}
              className="ps-10"
            />
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('picker.bodyPart')}>
            <Select value={bodyPart} onChange={(e) => setBodyPart(e.target.value)}>
              <option value="">{t('picker.all')}</option>
              {BODY_PARTS.map((b) => (
                <option key={b} value={b}>
                  {bodyPartLabel(t, b)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('picker.equipment')}>
            <Select value={equipment} onChange={(e) => setEquipment(e.target.value)}>
              <option value="">{t('picker.all')}</option>
              {EQUIPMENT.map((b) => (
                <option key={b} value={b}>
                  {equipmentLabel(t, b)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <p id={statusId} role="status" aria-live="polite" className="text-sm text-ink-2">
          {state === 'error'
            ? t('picker.error')
            : state === 'loading' && results.length === 0
              ? t('picker.loading')
              : t('picker.count', { count: results.length, n: count })}
        </p>

        {results.length === 0 && state === 'idle' ? (
          <p className="border-[1.5px] border-dashed border-ink-3 px-4 py-8 text-center text-base text-ink-2">
            {t('picker.empty')}
          </p>
        ) : (
          <ul className={state === 'loading' ? 'opacity-60 tx' : 'tx'}>
            {results.map((ex) => {
              const sub = exerciseSubName(ex, locale);
              return (
                <li key={ex.id} className="border-b border-rule last:border-b-0">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(ex);
                      onOpenChange(false);
                    }}
                    className="flex min-h-14 w-full flex-col justify-center py-2 text-start tx hover:bg-paper-2 focus-visible:bg-paper-2"
                  >
                    <span className="text-base font-semibold">
                      <bdi>{exerciseName(ex, locale)}</bdi>
                    </span>
                    {sub ? (
                      <span className="self-start text-sm text-ink-2" dir="ltr" lang="en">
                        {sub}
                      </span>
                    ) : null}
                    <span className="text-sm text-ink-3">
                      {joinFacts([bodyPartLabel(t, ex.bodyPart), equipmentLabel(t, ex.equipment)], locale)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
