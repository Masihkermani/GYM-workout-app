'use client';

import { useId, useState } from 'react';
import { Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { useRouter } from '@/i18n/navigation';
import { formatNumber } from '@/lib/format';
import type { SessionOptionsDTO } from '@/lib/training/dto';
import { sessionOptionsAction, startWorkoutAction } from '@/server/training';
import { sepFor } from './sep';

const FREE = 'free';

type Load = { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; options: SessionOptionsDTO };

/**
 * The coach's "Start session": opens a sheet with the client's program days (the next one in rotation
 * preselected) and a free-workout choice, then starts a workout for the client, linked to the booking
 * when there is one, and opens the live logger in the coach shell. It continues a workout that is
 * already open instead of starting a second one.
 *
 * The options are fetched when the sheet opens, not with the page: a dashboard lists several sessions
 * and most are never started. Coach only (the server action refuses anyone else).
 */
export function StartSessionButton({
  bookingId,
  clientId,
  locale,
  variant = 'ink',
  size = 'md',
  label,
}: {
  /** The CONFIRMED booking this session belongs to; null/undefined starts an unlinked session. */
  bookingId?: string | null;
  clientId: string;
  locale: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Defaults to «شروع جلسه» / "Start session". */
  label?: string;
}) {
  const t = useTranslations('training');
  const router = useRouter();
  const choiceName = useId();
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'idle' });
  const [choice, setChoice] = useState<string>(FREE);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = (v: number) => formatNumber(v, locale, { grouping: false });
  const workoutHref = (id: string) => `/coach/clients/${clientId}/workouts/${id}`;

  async function show() {
    setOpen(true);
    setError(null);
    setStarting(false);
    setLoad({ state: 'loading' });
    try {
      const r = await sessionOptionsAction({ clientId, bookingId: bookingId ?? null });
      if (r.ok) {
        setChoice(r.options.nextDayId ?? FREE);
        setLoad({ state: 'ready', options: r.options });
      } else {
        setLoad({ state: 'error', message: t(`errors.${r.error}`) });
      }
    } catch {
      setLoad({ state: 'error', message: t('errors.generic') });
    }
  }

  async function start() {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const r = await startWorkoutAction({
        dayId: choice === FREE ? null : choice,
        bookingId: bookingId ?? null,
        clientId,
      });
      if (r.ok) {
        router.push(workoutHref(r.id));
        return; // keep the spinner until the logger has loaded
      }
      setError(t(`errors.${r.error}`));
    } catch {
      setError(t('errors.generic'));
    }
    setStarting(false);
  }

  const options = load.state === 'ready' ? load.options : null;
  // A workout already tied to this booking is THE workout for it (a second start would only resume it).
  // Otherwise an open workout of the client is offered first, above the choice of a new one.
  const linkedOpen = options?.linked && !options.linked.finished ? options.linked : null;
  const resume: { id: string; day: string | null; sets: number } | null = linkedOpen
    ? { id: linkedOpen.id, day: null, sets: 0 }
    : options?.open
      ? { id: options.open.id, day: options.open.dayTitle ?? t('workout.free'), sets: options.open.setCount }
      : null;
  const closed = options?.linked?.finished === true;
  const canStart = options !== null && !closed && !linkedOpen;

  // the sheet's confirm is the one red action in the sheet, unless the trigger already is
  const confirmVariant: ButtonVariant = variant === 'primary' ? 'ink' : 'primary';

  return (
    <>
      <Button variant={variant} size={size} aria-haspopup="dialog" onClick={show}>
        <Play className="size-5 rtl:-scale-x-100" aria-hidden="true" />
        {label ?? t('session.start')}
      </Button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!starting) setOpen(next);
        }}
        title={options ? t('session.title', { name: options.clientName }) : t('session.start')}
        description={t('session.description')}
        footer={
          canStart ? (
            <Button variant={confirmVariant} size="lg" fullWidth loading={starting} onClick={start}>
              <Play className="size-5 rtl:-scale-x-100" aria-hidden="true" />
              {t('session.confirm')}
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-5" aria-busy={load.state === 'loading'}>
          {load.state === 'loading' ? (
            <p role="status" className="py-6 text-center text-base text-ink-2">
              {t('session.loading')}
            </p>
          ) : null}

          {load.state === 'error' ? (
            <p role="alert" className="text-base font-medium text-danger">
              {load.message}
            </p>
          ) : null}

          {resume ? (
            <div className="flex flex-col gap-3 border-[1.5px] border-rule-strong bg-paper-2 p-4">
              <p className="text-base font-bold">{t('session.openTitle')}</p>
              {resume.day ? (
                <p className="text-sm text-ink-2">
                  <bdi>{resume.day}</bdi>
                  {resume.sets > 0 ? `${sepFor(locale)}${t('todayCard.openSets', { count: resume.sets, n: n(resume.sets) })}` : null}
                </p>
              ) : null}
              <div>
                <Button
                  variant="ink"
                  onClick={() => {
                    setStarting(true);
                    router.push(workoutHref(resume.id));
                  }}
                  loading={starting}
                >
                  {t('session.continue')}
                </Button>
              </div>
            </div>
          ) : null}

          {closed ? <p className="text-base text-ink-2">{t('session.linkedDone')}</p> : null}

          {options && canStart ? (
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="mb-1 text-sm font-semibold text-ink">
                {resume ? t('session.orNew') : t('session.legend')}
              </legend>
              {options.days.length === 0 ? <p className="text-sm text-ink-2">{t('session.noProgram')}</p> : null}
              {options.days.map((d) => (
                <label
                  key={d.id}
                  className="flex min-h-14 cursor-pointer items-center gap-3 border-[1.5px] border-ink-3 bg-card px-3 py-2 tx has-[:checked]:border-ink has-[:checked]:bg-paper-2"
                >
                  <input
                    type="radio"
                    name={choiceName}
                    value={d.id}
                    checked={choice === d.id}
                    onChange={() => setChoice(d.id)}
                    className="size-5 shrink-0 accent-[var(--ink)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-bold">
                      <bdi>{d.title}</bdi>
                    </span>
                    <span className="block text-sm text-ink-2">
                      <bdi>{d.programTitle}</bdi>
                      {sepFor(locale)}
                      {t('panel.exercises', { count: d.exerciseCount, n: n(d.exerciseCount) })}
                    </span>
                  </span>
                  {d.id === options.nextDayId ? <span className="label-caps shrink-0 text-ink-2">{t('session.next')}</span> : null}
                </label>
              ))}
              <label className="flex min-h-14 cursor-pointer items-center gap-3 border-[1.5px] border-ink-3 bg-card px-3 py-2 tx has-[:checked]:border-ink has-[:checked]:bg-paper-2">
                <input
                  type="radio"
                  name={choiceName}
                  value={FREE}
                  checked={choice === FREE}
                  onChange={() => setChoice(FREE)}
                  className="size-5 shrink-0 accent-[var(--ink)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold">{t('workout.free')}</span>
                  <span className="block text-sm text-ink-2">{t('session.freeHint')}</span>
                </span>
              </label>
            </fieldset>
          ) : null}

          <p role="alert" className="text-sm font-medium text-danger empty:hidden">
            {error}
          </p>
        </div>
      </Sheet>
    </>
  );
}
