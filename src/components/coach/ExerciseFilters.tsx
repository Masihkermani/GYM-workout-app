'use client';

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Link, useRouter } from '@/i18n/navigation';
import { Switch } from './Switch';

export interface ExerciseFilterValues {
  q: string;
  bodyPart: string;
  equipment: string;
  show: 'active' | 'archived' | 'all';
  custom: boolean;
}

interface Option {
  value: string;
  label: string;
}

function toHref(v: ExerciseFilterValues) {
  const sp = new URLSearchParams();
  if (v.q.trim()) sp.set('q', v.q.trim());
  if (v.bodyPart) sp.set('bodyPart', v.bodyPart);
  if (v.equipment) sp.set('equipment', v.equipment);
  if (v.show !== 'active') sp.set('show', v.show);
  if (v.custom) sp.set('custom', '1');
  const qs = sp.toString();
  return qs ? `/coach/exercises?${qs}` : '/coach/exercises';
}

/** Search + filters. Everything lives in the URL, so a filtered list can be bookmarked or shared. */
export function ExerciseFilters({
  values,
  bodyParts,
  equipment,
}: {
  values: ExerciseFilterValues;
  bodyParts: Option[];
  equipment: Option[];
}) {
  const t = useTranslations('coach');
  const router = useRouter();
  const [q, setQ] = useState(values.q);
  const [pending, startTransition] = useTransition();
  // Controls answer at once; the URL (and the list) catch up when the navigation finishes.
  const [shown, setShown] = useOptimistic(values);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const go = (patch: Partial<ExerciseFilterValues>) => {
    startTransition(() => {
      const next = { ...shown, ...patch };
      setShown(next);
      router.replace(toHref(next), { scroll: false });
    });
  };

  const dirty = Boolean(shown.q || shown.bodyPart || shown.equipment || shown.show !== 'active' || shown.custom);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        go({ q });
      }}
      className="grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-12 md:gap-x-4"
    >
      <div className="col-span-2 md:col-span-12 lg:col-span-4">
        <Field label={t('exercises.filter.search')}>
          <div className="relative">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-5 text-ink-2" aria-hidden="true" />
            <Input
              name="q"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (timer.current) clearTimeout(timer.current);
                const next = e.target.value;
                timer.current = setTimeout(() => go({ q: next }), 300);
              }}
              placeholder={t('exercises.filter.searchPlaceholder')}
              className="ps-10 pe-10 [&::-webkit-search-cancel-button]:hidden"
            />
            {pending ? (
              <Loader2 className="spin pointer-events-none absolute inset-y-0 end-3 my-auto size-5 text-ink-2" aria-hidden="true" />
            ) : q ? (
              <button
                type="button"
                aria-label={t('clients.search.clear')}
                onClick={() => {
                  setQ('');
                  go({ q: '' });
                }}
                className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-[var(--r)] text-ink-2 tx hover:text-ink"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </Field>
      </div>

      <div className="md:col-span-4 lg:col-span-2">
        <Field label={t('exercises.filter.bodyPart')}>
          <Select name="bodyPart" value={shown.bodyPart} onChange={(e) => go({ bodyPart: e.target.value })}>
            <option value="">{t('exercises.filter.any')}</option>
            {bodyParts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="md:col-span-4 lg:col-span-3">
        <Field label={t('exercises.filter.equipment')}>
          <Select name="equipment" value={shown.equipment} onChange={(e) => go({ equipment: e.target.value })}>
            <option value="">{t('exercises.filter.any')}</option>
            {equipment.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="col-span-2 md:col-span-4 lg:col-span-3">
        <Field label={t('exercises.filter.show')}>
          <Select
            name="show"
            value={shown.show}
            onChange={(e) => go({ show: e.target.value as ExerciseFilterValues['show'] })}
          >
            <option value="active">{t('exercises.filter.showActive')}</option>
            <option value="archived">{t('exercises.filter.showArchived')}</option>
            <option value="all">{t('exercises.filter.showAll')}</option>
          </Select>
        </Field>
      </div>

      <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 md:col-span-12">
        <Switch
          label={t('exercises.filter.custom')}
          checked={shown.custom}
          onChange={(e) => go({ custom: e.target.checked })}
        />
        {dirty ? (
          <Link
            href="/coach/exercises"
            scroll={false}
            className="inline-flex min-h-11 items-center px-2 text-sm font-semibold underline underline-offset-4"
            onClick={() => setQ('')}
          >
            {t('exercises.filter.reset')}
          </Link>
        ) : null}
      </div>
      <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
    </form>
  );
}
