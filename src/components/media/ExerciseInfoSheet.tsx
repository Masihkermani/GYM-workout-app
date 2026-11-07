'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { bodyPartLabel, equipmentLabel } from '@/components/training/labels';
import { joinFacts } from '@/components/training/sep';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import type { ExerciseInfoDTO } from '@/lib/media/dto';
import { exerciseName, exerciseSubName, type ExerciseNameSource } from '@/lib/training/types';
import { exerciseInfoAction } from '@/server/media';
import { DemoPlaceholder, ExerciseDemo } from './ExerciseDemo';
import { muscleLabel } from './muscles';

/** What the sheet needs up front: the title and the facts a row already knows. The rest is fetched when it opens. */
export interface InfoExercise extends ExerciseNameSource {
  id: string;
  bodyPart: string;
  equipment: string;
  target: string;
}

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ready'; info: ExerciseInfoDTO };

// Opening the same exercise again (the logger, then the picker) should not wait for the server twice.
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; info: ExerciseInfoDTO }>();

/** Forget cached demonstrations, e.g. after the coach changed them. */
export function clearExerciseInfoCache(exerciseId?: string) {
  if (exerciseId) cache.delete(exerciseId);
  else cache.clear();
}

function useExerciseInfo(exerciseId: string, enabled: boolean): [Load, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>(() => {
    const hit = cache.get(exerciseId);
    return hit && Date.now() - hit.at < CACHE_MS ? { status: 'ready', info: hit.info } : { status: 'loading' };
  });

  useEffect(() => {
    if (!enabled) return;
    const hit = cache.get(exerciseId);
    if (hit && Date.now() - hit.at < CACHE_MS && attempt === 0) return;
    let live = true;
    exerciseInfoAction(exerciseId)
      .then((r) => {
        if (!live) return;
        if (r.ok) {
          cache.set(exerciseId, { at: Date.now(), info: r.info });
          setLoad({ status: 'ready', info: r.info });
        } else {
          setLoad({ status: 'error' });
        }
      })
      .catch(() => live && setLoad({ status: 'error' }));
    return () => {
      live = false;
    };
  }, [exerciseId, enabled, attempt]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);
  return [load, retry];
}

function Steps({ steps, lang, locale }: { steps: string[]; lang: 'fa' | 'en'; locale: string }) {
  return (
    <ol className="flex flex-col gap-2.5" lang={lang} dir={lang === 'fa' ? 'rtl' : 'ltr'} data-testid="exercise-steps">
      {steps.map((text, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="num mt-px flex size-7 shrink-0 items-center justify-center border-[1.5px] border-ink text-sm">
            {formatNumber(i + 1, locale, { grouping: false })}
          </span>
          <span className="min-w-0 flex-1 text-base leading-relaxed">{text}</span>
        </li>
      ))}
    </ol>
  );
}

function Facts({ info, locale }: { info: ExerciseInfoDTO; locale: string }) {
  const t = useTranslations('training');
  const list = (items: string[]) => items.map((m) => muscleLabel(t, m)).join(locale === 'fa' ? '، ' : ', ');
  const rows: [string, string][] = [
    [t('info.target'), muscleLabel(t, info.target)],
    ...(info.secondaryMuscles.length ? ([[t('info.secondary'), list(info.secondaryMuscles)]] as [string, string][]) : []),
    [t('info.equipment'), equipmentLabel(t, info.equipment)],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-ink-2">{label}</dt>
          <dd className="min-w-0 font-semibold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * "How to do this exercise": the demonstration (flipbook, image or animation, with its credit), the steps in
 * the viewer's language (Persian when written, otherwise English with a note), and the muscles and equipment.
 * Everything beyond the name is fetched when the sheet opens, so a list can carry hundreds of rows cheaply.
 */
export function ExerciseInfoSheet({
  open,
  onOpenChange,
  exercise,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: InfoExercise;
}) {
  const t = useTranslations('training');
  const locale = useLocale();
  const [load, retry] = useExerciseInfo(exercise.id, open);
  const [pick, setPick] = useState(0);
  const loadingId = useId();
  const name = exerciseName(exercise, locale);
  const sub = exerciseSubName(exercise, locale);

  const info = load.status === 'ready' ? load.info : null;
  const media = info?.media ?? [];
  const current = media[Math.min(pick, Math.max(0, media.length - 1))];
  const stepsFa = info?.stepsFa ?? [];
  const stepsEn = info?.stepsEn ?? [];
  const faSteps = locale === 'fa' && stepsFa.length > 0;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={<bdi>{name}</bdi>}
      description={
        <>
          {sub ? (
            <>
              <bdi lang="en" dir="ltr">
                {sub}
              </bdi>
              <br />
            </>
          ) : null}
          {joinFacts([bodyPartLabel(t, exercise.bodyPart), equipmentLabel(t, exercise.equipment)], locale)}
        </>
      }
    >
      <div className="flex flex-col gap-5" data-testid="exercise-info" aria-busy={load.status === 'loading'}>
        {load.status === 'loading' ? (
          <div className="demo-stage flex items-center justify-center bg-paper-2">
            <p id={loadingId} role="status" className="text-sm text-ink-2">
              {t('info.loading')}
            </p>
          </div>
        ) : null}

        {load.status === 'error' ? (
          <div className="flex flex-col items-start gap-3 border-[1.5px] border-dashed border-ink-3 p-4">
            <p role="alert" className="text-base text-ink-2">
              {t('info.error')}
            </p>
            <Button variant="outline" size="sm" onClick={retry}>
              <RotateCw className="size-4" aria-hidden="true" />
              {t('info.retry')}
            </Button>
          </div>
        ) : null}

        {info ? (
          <>
            <section aria-label={t('info.demoTitle')} className="flex flex-col gap-2">
              {current ? (
                <ExerciseDemo key={current.id} media={current} name={name} />
              ) : (
                <DemoPlaceholder>{t('info.noDemo')}</DemoPlaceholder>
              )}
              {media.length > 1 ? (
                <div role="group" aria-label={t('info.variants')} className="flex flex-wrap gap-2">
                  {media.map((m, i) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={i === pick}
                      onClick={() => setPick(i)}
                      className={cn(
                        'num min-h-11 min-w-11 border-[1.5px] px-3 text-sm font-semibold tx',
                        i === pick ? 'border-ink bg-ink text-paper' : 'border-ink-3 text-ink hover:border-ink',
                      )}
                    >
                      {t('info.variant', { n: formatNumber(i + 1, locale, { grouping: false }) })}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <section aria-labelledby={`${loadingId}-steps`} className="flex flex-col gap-3">
              <h3 id={`${loadingId}-steps`} className="label-caps text-ink-2">
                {t('info.stepsTitle')}
              </h3>
              {faSteps ? (
                <Steps steps={stepsFa} lang="fa" locale={locale} />
              ) : stepsEn.length > 0 ? (
                <>
                  {locale === 'fa' ? (
                    <p className="text-sm text-ink-2" data-testid="steps-english-note">
                      {t('info.stepsEnglishOnly')}
                    </p>
                  ) : null}
                  <Steps steps={stepsEn} lang="en" locale={locale} />
                </>
              ) : (
                <p className="text-base text-ink-2">{t('info.noSteps')}</p>
              )}
            </section>

            <section aria-labelledby={`${loadingId}-facts`} className="flex flex-col gap-3">
              <h3 id={`${loadingId}-facts`} className="label-caps text-ink-2">
                {t('info.musclesTitle')}
              </h3>
              <Facts info={info} locale={locale} />
            </section>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}
