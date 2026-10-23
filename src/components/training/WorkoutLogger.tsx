'use client';

import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowRight, CircleAlert, Clock, Loader2, Plus, RotateCw, Square } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Stamp } from '@/components/ui/Stamp';
import { Tally } from '@/components/ui/Tally';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { formatKg, formatLoggedSet, formatNumber, formatSet } from '@/lib/format';
import { useRouter } from '@/i18n/navigation';
import { epleyE1rm, round1 } from '@/lib/training/e1rm';
import type { ExerciseContext, LoggerData, LoggerExercise, WorkoutSummaryDTO } from '@/lib/training/dto';
import { prefillFor } from '@/lib/training/prefill';
import { EMPTY_BASELINE, flagPrs, isPr } from '@/lib/training/prs';
import {
  exerciseName,
  exerciseSubName,
  isBodyweight,
  usesBarbell,
  type ExerciseDTO,
  type PrFlag,
  type SetDTO,
} from '@/lib/training/types';
import {
  deleteSetAction,
  deleteWorkoutAction,
  exerciseContextAction,
  finishWorkoutAction,
  logSetAction,
  restoreSetAction,
  updateSetAction,
} from '@/server/training';
import { formatClock } from './clock';
import { EditSetSheet } from './EditSetSheet';
import { ExercisePicker } from './ExercisePicker';
import { RestTimer, type RestState } from './RestTimer';
import { sepFor } from './sep';
import { SetLogger, type SetLoggerValues } from './SetLogger';
import { TrainingCard, type TrainingCardData } from './TrainingCard';
import { useNow } from './use-now';
import { WorkoutSummary } from './WorkoutSummary';

// ------------------------------------------------------------------------------------ set rows

type Row = SetDTO & { status: 'saved' | 'saving' | 'failed' };

type RowAction =
  | { type: 'add'; row: Row }
  | { type: 'replace'; tmpId: string; row: SetDTO }
  | { type: 'fail'; id: string }
  | { type: 'saving'; id: string }
  | { type: 'patch'; id: string; patch: Partial<SetDTO> }
  | { type: 'remove'; id: string }
  | { type: 'insert'; row: SetDTO };

function rowsReducer(rows: Row[], action: RowAction): Row[] {
  switch (action.type) {
    case 'add':
      return [...rows, action.row];
    case 'replace':
      return rows.map((r) => (r.id === action.tmpId ? { ...action.row, status: 'saved' as const } : r));
    case 'fail':
      return rows.map((r) => (r.id === action.id ? { ...r, status: 'failed' as const } : r));
    case 'saving':
      return rows.map((r) => (r.id === action.id ? { ...r, status: 'saving' as const } : r));
    case 'patch':
      return rows.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r));
    case 'remove': {
      const gone = rows.find((r) => r.id === action.id);
      if (!gone) return rows;
      return rows
        .filter((r) => r.id !== action.id)
        .map((r) =>
          r.exerciseId === gone.exerciseId && r.setIndex > gone.setIndex ? { ...r, setIndex: r.setIndex - 1 } : r,
        );
    }
    case 'insert': {
      const shifted = rows.map((r) =>
        r.exerciseId === action.row.exerciseId && r.setIndex >= action.row.setIndex ? { ...r, setIndex: r.setIndex + 1 } : r,
      );
      return [...shifted, { ...action.row, status: 'saved' as const }];
    }
    default:
      return rows;
  }
}

const bySetIndex = (a: SetDTO, b: SetDTO) => a.setIndex - b.setIndex;
const DEFAULT_REST = 90;
const WARMUP_REST = 60;

function lastTimeText(ctx: ExerciseContext | undefined, locale: string): string | null {
  const sets = ctx?.lastTime?.sets;
  if (!sets || sets.length === 0) return null;
  const first = sets[0];
  if (sets.every((s) => s.reps === first.reps && s.weightKg === first.weightKg)) {
    return formatSet({ sets: sets.length, reps: first.reps, weightKg: first.weightKg }, locale);
  }
  const list = locale === 'fa' ? '، ' : ', ';
  if (sets.every((s) => s.weightKg === first.weightKg)) {
    // same weight, reps varied: "6, 7, 6, 7 x 37.5 kg"
    const reps = sets.slice(0, 8).map((s) => formatNumber(s.reps, locale, { grouping: false })).join(list);
    return first.weightKg === 0 ? reps : `${reps} × ${formatKg(first.weightKg, locale)}`;
  }
  return sets
    .slice(0, 6)
    .map((s) => formatLoggedSet(s.reps, s.weightKg, locale))
    .join(list);
}

// ------------------------------------------------------------------------------------ component

/**
 * The live logging screen, the most important one in the product. Sets are appended optimistically
 * (the row, the tally stroke, the rest timer and any PR stamp appear at once) while a sequential
 * queue sends them to the server; a set that fails to save stays on screen with a retry button.
 * PRs are decided on the client from the exercise's history baseline with the same pure functions
 * the server uses for history and the summary.
 */
export function WorkoutLogger({ data, locale: localeProp }: { data: LoggerData; locale: string }) {
  const t = useTranslations('training');
  const locale = useLocale() || localeProp;
  const router = useRouter();
  const { toast } = useToast();
  const formId = useId();
  const nameId = useId();

  const [exercises, setExercises] = useState<LoggerExercise[]>(data.exercises);
  const [contexts, setContexts] = useState<Record<string, ExerciseContext>>(data.contexts);
  const [rows, dispatch] = useReducer(
    rowsReducer,
    data.sets,
    (sets): Row[] => sets.map((s) => ({ ...s, status: 'saved' as const })),
  );
  const [currentId, setCurrentId] = useState<string | null>(() => {
    const open = data.exercises.find((e) => {
      const done = data.sets.filter((s) => s.exerciseId === e.exercise.id && !s.isWarmup).length;
      return e.target ? done < e.target.sets : false;
    });
    return (open ?? data.exercises[0])?.exercise.id ?? null;
  });
  const [inputs, setInputs] = useState<Record<string, SetLoggerValues>>({});
  const [fieldError, setFieldError] = useState<{ field: 'weight' | 'reps' | null; message: string } | null>(null);
  const [justLogged, setJustLogged] = useState(false);
  const [live, setLive] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishNote, setFinishNote] = useState(data.note ?? '');
  const [summary, setSummary] = useState<WorkoutSummaryDTO | null>(null);
  const [rest, setRest] = useState<RestState | null>(null);
  const [restOver, setRestOver] = useState(false);

  const queue = useRef<Promise<void>>(Promise.resolve());
  const tmpCounter = useRef(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const restKey = `daftar:rest:${data.workoutId}`;

  // --------------------------------------------------------------------------------- helpers
  const enqueue = useCallback((job: () => Promise<void>) => {
    queue.current = queue.current.then(job).catch(() => undefined);
    return queue.current;
  }, []);

  const current = exercises.find((e) => e.exercise.id === currentId) ?? null;
  const ctxOf = useCallback((id: string) => contexts[id], [contexts]);

  const exerciseRows = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const list = map.get(r.exerciseId) ?? [];
      list.push(r);
      map.set(r.exerciseId, list);
    }
    for (const list of map.values()) list.sort(bySetIndex);
    return map;
  }, [rows]);

  /** setId -> PR flag, replayed per exercise over the history baseline (failed sets do not count). */
  const prFlags = useMemo(() => {
    const out = new Map<string, PrFlag>();
    for (const [exerciseId, list] of exerciseRows) {
      const working = list.filter((r) => !r.isWarmup && r.status !== 'failed');
      const flags = flagPrs(contexts[exerciseId]?.baseline ?? EMPTY_BASELINE, working);
      working.forEach((r, i) => {
        if (isPr(flags[i])) out.set(r.id, flags[i]);
      });
    }
    return out;
  }, [exerciseRows, contexts]);

  const doneCount = (id: string) => (exerciseRows.get(id) ?? []).filter((r) => !r.isWarmup).length;

  // ---------------------------------------------------------------------- steppers' values
  const valuesFor = useCallback(
    (id: string): SetLoggerValues => {
      const stored = inputs[id];
      if (stored) return stored;
      const ex = exercises.find((e) => e.exercise.id === id);
      const mine = (exerciseRows.get(id) ?? []).filter((r) => !r.isWarmup);
      const previous = mine.length ? mine[mine.length - 1] : null;
      const pre = prefillFor({
        setNumber: mine.length + 1,
        previous,
        lastTime: contexts[id]?.lastTime?.sets ?? null,
        target: ex?.target ?? null,
        bodyweight: ex ? isBodyweight(ex.exercise.equipment) : false,
      });
      return { weightKg: pre.weightKg, reps: pre.reps, rpe: null, warmup: false };
    },
    [inputs, exercises, exerciseRows, contexts],
  );

  const values = current ? valuesFor(current.exercise.id) : { weightKg: null, reps: null, rpe: null, warmup: false };
  const setValues = (patch: Partial<SetLoggerValues>) => {
    if (!current) return;
    const id = current.exercise.id;
    setFieldError(null);
    setInputs((prev) => ({ ...prev, [id]: { ...(prev[id] ?? valuesFor(id)), ...patch } }));
  };

  // ------------------------------------------------------------------- rest timer persistence
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(restKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as RestState;
      if (saved.endsAt > Date.now() - 12_000) setRest(saved);
    } catch {
      /* storage can be blocked; the timer simply starts fresh */
    }
  }, [restKey]);

  const saveRest = useCallback(
    (next: RestState | null) => {
      setRest(next);
      setRestOver(false);
      try {
        if (next) sessionStorage.setItem(restKey, JSON.stringify(next));
        else sessionStorage.removeItem(restKey);
      } catch {
        /* ignore */
      }
    },
    [restKey],
  );

  // clear the "rest over" banner a few seconds after it appears
  useEffect(() => {
    if (!restOver) return;
    const id = setTimeout(() => saveRest(null), 12_000);
    return () => clearTimeout(id);
  }, [restOver, saveRest]);

  const onRestFinished = useCallback(() => {
    setRestOver(true);
  }, []);

  // ----------------------------------------------------------------- warn before leaving unsaved
  const unsaved = rows.some((r) => r.status !== 'saved');
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);

  // keep the active chip in view
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>('[aria-current="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [currentId]);

  // ---------------------------------------------------------------------------- logging
  function sendSet(tmpId: string, payload: { exerciseId: string; reps: number; weightKg: number; rpe: number | null; isWarmup: boolean }) {
    void enqueue(async () => {
      try {
        const r = await logSetAction({ workoutId: data.workoutId, ...payload });
        if (r.ok) dispatch({ type: 'replace', tmpId, row: r.set });
        else dispatch({ type: 'fail', id: tmpId });
      } catch {
        dispatch({ type: 'fail', id: tmpId });
      }
    });
  }

  function logSet() {
    if (!current) return;
    const id = current.exercise.id;
    const bw = isBodyweight(current.exercise.equipment);
    const weight = values.weightKg ?? (bw ? 0 : null);
    if (values.reps == null || values.reps < 1) {
      setFieldError({ field: 'reps', message: t('logger.needReps') });
      return;
    }
    if (weight == null) {
      setFieldError({ field: 'weight', message: t('logger.needWeight') });
      return;
    }
    setFieldError(null);

    const mine = exerciseRows.get(id) ?? [];
    const row: Row = {
      id: `tmp-${++tmpCounter.current}`,
      exerciseId: id,
      setIndex: mine.reduce((m, r) => Math.max(m, r.setIndex), 0) + 1,
      reps: values.reps,
      weightKg: weight,
      rpe: values.rpe,
      isWarmup: values.warmup,
      createdAt: new Date().toISOString(),
      status: 'saving',
    };

    // would this set be a record? (same maths as the replay used for display)
    const workingBefore = mine.filter((r) => !r.isWarmup && r.status !== 'failed');
    const withNew = row.isWarmup ? workingBefore : [...workingBefore, row];
    const flags = flagPrs(contexts[id]?.baseline ?? EMPTY_BASELINE, withNew);
    const newFlag = row.isWarmup ? null : flags[flags.length - 1];

    dispatch({ type: 'add', row });
    setJustLogged(true);
    setInputs((prev) => ({ ...prev, [id]: { weightKg: weight, reps: values.reps, rpe: null, warmup: false } }));
    const restSec = row.isWarmup ? WARMUP_REST : (current.target?.restSeconds ?? DEFAULT_REST);
    saveRest({ endsAt: Date.now() + restSec * 1000, totalSec: restSec });

    const workingNumber = row.isWarmup ? null : workingBefore.length + 1;
    setLive(
      newFlag && isPr(newFlag)
        ? t('logger.liveRecord', { n: formatNumber(workingNumber ?? 0, locale, { grouping: false }) })
        : t('logger.liveLogged', { n: formatNumber(workingNumber ?? mine.length + 1, locale, { grouping: false }) }),
    );
    sendSet(row.id, { exerciseId: id, reps: row.reps, weightKg: row.weightKg, rpe: row.rpe, isWarmup: row.isWarmup });
  }

  function retry(row: Row) {
    dispatch({ type: 'saving', id: row.id });
    sendSet(row.id, { exerciseId: row.exerciseId, reps: row.reps, weightKg: row.weightKg, rpe: row.rpe, isWarmup: row.isWarmup });
  }

  // ----------------------------------------------------------------------- edit and delete
  const editing = rows.find((r) => r.id === editingId) ?? null;

  function saveEdit(row: Row, v: { reps: number; weightKg: number; rpe: number | null; isWarmup: boolean }) {
    const before = { reps: row.reps, weightKg: row.weightKg, rpe: row.rpe, isWarmup: row.isWarmup };
    dispatch({ type: 'patch', id: row.id, patch: v });
    void enqueue(async () => {
      try {
        const r = await updateSetAction({ setId: row.id, ...v });
        if (!r.ok) throw new Error(r.error);
        dispatch({ type: 'patch', id: row.id, patch: r.set });
      } catch {
        dispatch({ type: 'patch', id: row.id, patch: before });
        toast({ message: t('errors.generic'), tone: 'error' });
      }
    });
  }

  function undoDelete(row: Row) {
    void enqueue(async () => {
      try {
        const r = await restoreSetAction({
          workoutId: data.workoutId,
          exerciseId: row.exerciseId,
          setIndex: row.setIndex,
          reps: row.reps,
          weightKg: row.weightKg,
          rpe: row.rpe,
          isWarmup: row.isWarmup,
        });
        if (!r.ok) throw new Error(r.error);
        dispatch({ type: 'insert', row: r.set });
      } catch {
        toast({ message: t('errors.generic'), tone: 'error' });
      }
    });
  }

  function deleteRow(row: Row) {
    dispatch({ type: 'remove', id: row.id });
    void enqueue(async () => {
      try {
        const r = await deleteSetAction({ setId: row.id });
        if (!r.ok) throw new Error(r.error);
        toast({
          tone: 'info',
          duration: 8000,
          message: (
            <span className="flex flex-wrap items-center gap-x-3">
              {t('edit.deleted')}
              <button
                type="button"
                onClick={() => undoDelete(row)}
                className="min-h-11 rounded-[var(--r)] px-2 font-bold underline underline-offset-4"
              >
                {t('edit.undo')}
              </button>
            </span>
          ),
        });
      } catch {
        dispatch({ type: 'insert', row });
        toast({ message: t('errors.generic'), tone: 'error' });
      }
    });
  }

  // ------------------------------------------------------------------------- exercises
  async function addExercise(ex: ExerciseDTO) {
    if (!exercises.some((e) => e.exercise.id === ex.id)) {
      setExercises((prev) => [...prev, { exercise: ex, target: null }]);
      setContexts((prev) => ({ ...prev, [ex.id]: prev[ex.id] ?? { lastTime: null, baseline: EMPTY_BASELINE } }));
      try {
        const r = await exerciseContextAction({ exerciseId: ex.id, workoutId: data.workoutId, locale });
        if (r.ok) setContexts((prev) => ({ ...prev, [ex.id]: r.context }));
      } catch {
        /* the logger works without history; it just cannot prefill or flag records */
      }
    }
    selectExercise(ex.id);
  }

  function selectExercise(id: string) {
    setCurrentId(id);
    setJustLogged(false);
    setFieldError(null);
  }

  // --------------------------------------------------------------------------- finishing
  const failedCount = rows.filter((r) => r.status === 'failed').length;
  const workingTotal = rows.filter((r) => !r.isWarmup).length;
  const remainingTargets = exercises.reduce(
    (n, e) => n + (e.target ? Math.max(0, e.target.sets - doneCount(e.exercise.id)) : 0),
    0,
  );

  async function finish() {
    setFinishing(true);
    setFinishError(null);
    try {
      await queue.current; // let pending saves land first
      const r = await finishWorkoutAction({ workoutId: data.workoutId, note: finishNote });
      if (r.ok) {
        saveRest(null);
        setFinishOpen(false);
        setSummary(r.summary);
        window.scrollTo({ top: 0 });
      } else {
        setFinishError(t(`errors.${r.error}`));
      }
    } catch {
      setFinishError(t('errors.generic'));
    }
    setFinishing(false);
  }

  async function discard() {
    setFinishing(true);
    setFinishError(null);
    try {
      await queue.current;
      const r = await deleteWorkoutAction({ workoutId: data.workoutId });
      if (r.ok) {
        saveRest(null);
        router.replace('/app');
        return;
      }
      setFinishError(t(`errors.${r.error}`));
    } catch {
      setFinishError(t('errors.generic'));
    }
    setFinishing(false);
  }

  // ------------------------------------------------------------------------------ clock
  const startedMs = Date.parse(data.startedAt);
  const now = useNow(!summary, 1000, Date.parse(data.serverNow));
  const elapsed = Math.max(0, Math.floor((now - startedMs) / 1000));

  // ------------------------------------------------------------------------------ cards
  const cardData: TrainingCardData = {
    clientName: data.clientName,
    dayTitle: data.dayTitle ?? t('workout.free'),
    date: new Date(data.startedAt),
    rows: exercises.map((e) => ({
      exerciseName: exerciseName(e.exercise, locale),
      targetSets: e.target?.sets ?? 0,
      targetRepsMin: e.target?.repsMin ?? 0,
      targetRepsMax: e.target?.repsMax ?? null,
      targetWeightKg: e.target?.weightKg ?? null,
      sets: (exerciseRows.get(e.exercise.id) ?? [])
        .filter((r) => !r.isWarmup && r.status !== 'failed')
        .map((r) => ({ reps: r.reps, weightKg: r.weightKg, isPr: prFlags.has(r.id) })),
    })),
  };

  if (summary) {
    const prSets = exercises.flatMap((e) =>
      (exerciseRows.get(e.exercise.id) ?? [])
        .filter((r) => prFlags.has(r.id))
        .map((r) => ({ id: r.id, name: exerciseName(e.exercise, locale), reps: r.reps, weightKg: r.weightKg })),
    );
    return <WorkoutSummary summary={summary} locale={locale} prSets={prSets} card={cardData} />;
  }

  // ------------------------------------------------------------------------------ render
  const ex = current?.exercise ?? null;
  const exRows = ex ? (exerciseRows.get(ex.id) ?? []) : [];
  const working = exRows.filter((r) => !r.isWarmup);
  const target = current?.target ?? null;
  const ctx = ex ? ctxOf(ex.id) : undefined;
  const lastText = lastTimeText(ctx, locale);
  const targetDone = target ? working.length >= target.sets : false;
  const nextExercise = (() => {
    if (!current) return null;
    const idx = exercises.findIndex((e) => e.exercise.id === current.exercise.id);
    for (let i = 1; i <= exercises.length; i++) {
      const e = exercises[(idx + i) % exercises.length];
      if (e.exercise.id === current.exercise.id) break;
      if (e.target && doneCount(e.exercise.id) < e.target.sets) return e;
    }
    return null;
  })();

  // "same as ..." shortcut
  const lastLogged = [...exRows].reverse().find((r) => !r.isWarmup) ?? exRows[exRows.length - 1] ?? null;
  const lastTimeSet = ctx?.lastTime
    ? ctx.lastTime.sets[Math.min(working.length, ctx.lastTime.sets.length - 1)]
    : null;
  const sameSource = lastLogged
    ? { weightKg: lastLogged.weightKg, reps: lastLogged.reps, label: t('logger.sameLastSet') }
    : lastTimeSet
      ? { weightKg: lastTimeSet.weightKg, reps: lastTimeSet.reps, label: t('logger.sameLastTime') }
      : null;
  const sameAs =
    sameSource && (values.weightKg !== sameSource.weightKg || values.reps !== sameSource.reps)
      ? {
          label: sameSource.label,
          onApply: () => setValues({ weightKg: sameSource.weightKg, reps: sameSource.reps }),
        }
      : null;

  const setNumber = values.warmup ? null : working.length + 1;
  const dateText = data.dateLabel;

  return (
    <div className="page-x flex flex-col gap-4 py-3 pb-56 md:gap-5 md:py-8 md:pb-8 lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-10">
      <div className="flex min-w-0 flex-col gap-4 md:gap-5">
        {/* header ------------------------------------------------------------------------- */}
        <header className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-3">
            <h1 className="min-w-0 text-xl md:text-2xl">
              <bdi>{data.dayTitle ?? t('workout.free')}</bdi>
            </h1>
            <p className="flex shrink-0 items-center gap-1.5 leading-none">
              <Clock className="size-5 text-ink-2" aria-hidden="true" />
              <span className="sr-only">{t('workout.elapsed')}</span>
              <span className="num text-2xl" role="timer" aria-label={t('workout.elapsedAria')}>
                {formatClock(elapsed, locale)}
              </span>
            </p>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-sm text-ink-2">
              {dateText}
              {data.programTitle ? (
                <span className="hidden md:inline">
                  {sepFor(locale)}
                  <bdi>{data.programTitle}</bdi>
                </span>
              ) : null}
            </p>
            <Button variant="outline" size="sm" onClick={() => setFinishOpen(true)}>
              <Square className="size-4" aria-hidden="true" />
              {t('workout.finish')}
            </Button>
          </div>
        </header>

        {/* exercise strip ----------------------------------------------------------------- */}
        <nav aria-label={t('strip.label')}>
          <div ref={stripRef} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
            {exercises.map((e) => {
              const done = doneCount(e.exercise.id);
              const active = e.exercise.id === currentId;
              const complete = e.target ? done >= e.target.sets : false;
              return (
                <button
                  key={e.exercise.id}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => selectExercise(e.exercise.id)}
                  className={cn(
                    'flex min-h-11 shrink-0 flex-col justify-center rounded-[var(--r)] border-[1.5px] px-3 text-start tx active:translate-y-px',
                    active ? 'border-ink bg-ink text-paper' : 'border-ink-3 bg-card text-ink hover:border-ink',
                  )}
                >
                  <span className="max-w-[10rem] truncate text-sm font-semibold">
                    <bdi>{exerciseName(e.exercise, locale)}</bdi>
                  </span>
                  <span className={cn('num text-xs', active ? 'text-paper' : 'text-ink-2')}>
                    {e.target
                      ? t('strip.progress', {
                          done: formatNumber(done, locale, { grouping: false }),
                          total: formatNumber(e.target.sets, locale, { grouping: false }),
                        })
                      : t('strip.done', { count: done })}
                    {complete ? <span className="sr-only"> {t('strip.complete')}</span> : null}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-[var(--r)] border-[1.5px] border-dashed border-ink-3 px-3 text-sm font-semibold text-ink tx hover:border-ink"
            >
              <Plus className="size-4" aria-hidden="true" />
              {t('strip.add')}
            </button>
          </div>
        </nav>

        {ex ? (
          <>
            {/* current exercise ---------------------------------------------------------- */}
            <section aria-labelledby={nameId} className="flex flex-col gap-2 md:gap-3">
              <div>
                <h2 id={nameId} className="text-2xl">
                  <bdi>{exerciseName(ex, locale)}</bdi>
                </h2>
                {exerciseSubName(ex, locale) ? (
                  <p lang="en" dir="ltr" className="hidden w-fit text-sm text-ink-2 md:block">
                    {exerciseSubName(ex, locale)}
                  </p>
                ) : null}
              </div>
              <dl className="grid gap-1 text-base">
                {target ? (
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <dt className="text-ink-2">{t('logger.target')}</dt>
                    <dd className="num text-xl">
                      {formatSet(
                        { sets: target.sets, reps: target.repsMin, repsMax: target.repsMax, weightKg: target.weightKg },
                        locale,
                      )}
                    </dd>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="text-ink-2">
                    {ctx?.lastTime
                      ? t('logger.lastTime', { date: ctx.lastTime.dateLabel })
                      : t('logger.lastTimeLabel')}
                  </dt>
                  <dd className="num text-xl">{lastText ?? <span className="text-base font-normal text-ink-2">{t('logger.firstTime')}</span>}</dd>
                </div>
              </dl>
              {target?.note ? (
                <p className="border-s-[3px] border-ink ps-3 text-base text-ink-2">{target.note}</p>
              ) : null}
            </section>

            {targetDone ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-[1.5px] border-ink bg-paper-2 p-3">
                <p className="text-base font-semibold">{t('logger.setsDone')}</p>
                {nextExercise ? (
                  <Button variant="ink" size="md" onClick={() => selectExercise(nextExercise.exercise.id)}>
                    <span className="max-w-[14rem] truncate">
                      {t('logger.next')}: <bdi>{exerciseName(nextExercise.exercise, locale)}</bdi>
                    </span>
                    <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                  </Button>
                ) : (
                  <Button variant="ink" size="md" onClick={() => setFinishOpen(true)}>
                    {t('workout.finish')}
                  </Button>
                )}
              </div>
            ) : null}

            {/* set logger ---------------------------------------------------------------- */}
            <SetLogger
              formId={formId}
              values={values}
              onChange={setValues}
              onSubmit={logSet}
              showBar={usesBarbell(ex.equipment)}
              barKg={data.barKg}
              bodyweight={isBodyweight(ex.equipment)}
              sameAs={sameAs}
              error={fieldError?.message ?? null}
              errorField={fieldError?.field ?? null}
            />

            {/* dock: rest timer + Log set -------------------------------------------------- */}
            <div
              className={cn(
                'fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-3 border-t-[1.5px] border-rule-strong bg-card px-4 py-3',
                'md:static md:z-auto md:border-0 md:bg-transparent md:p-0',
              )}
            >
              {rest ? (
                <RestTimer
                  rest={rest}
                  locale={locale}
                  onSkip={() => saveRest(null)}
                  onAdd={() => {
                    const nowMs = Date.now();
                    saveRest(
                      rest.endsAt <= nowMs
                        ? { endsAt: nowMs + 30_000, totalSec: 30 }
                        : { endsAt: rest.endsAt + 30_000, totalSec: rest.totalSec + 30 },
                    );
                  }}
                  onFinished={onRestFinished}
                />
              ) : null}
              <Button type="submit" form={formId} variant="primary" size="xl" fullWidth>
                {values.warmup ? t('logger.logWarmup') : t('logger.logSet', { n: formatNumber(setNumber ?? 0, locale, { grouping: false }) })}
              </Button>
            </div>

            {/* sets of this exercise ---------------------------------------------------------- */}
            <section aria-label={t('logger.setsLabel')} className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="label-caps text-ink-2">{t('logger.setsLabel')}</h3>
                <Tally
                  count={working.length}
                  size={26}
                  animateNewest={justLogged}
                  label={t('logger.tally', { count: working.length })}
                />
              </div>
              {exRows.length === 0 ? (
                <p className="border-[1.5px] border-dashed border-ink-3 px-4 py-5 text-center text-base text-ink-2">{t('logger.noSets')}</p>
              ) : (
                <ol className="border-[1.5px] border-rule-strong bg-card">
                  {exRows.map((r) => {
                    const flag = prFlags.get(r.id);
                    const e1 = r.isWarmup ? null : epleyE1rm(r.weightKg, r.reps);
                    const workingIndex = r.isWarmup ? null : exRows.filter((x) => !x.isWarmup && x.setIndex <= r.setIndex).length;
                    const disabled = r.status === 'saving';
                    return (
                      <li key={r.id} className="border-b border-rule last:border-b-0">
                        <div className="flex items-stretch">
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => setEditingId(r.id)}
                            aria-label={
                              workingIndex != null
                                ? t('logger.editSet', { n: formatNumber(workingIndex, locale, { grouping: false }) })
                                : t('logger.editWarmup')
                            }
                            className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 text-start tx hover:bg-paper-2 disabled:opacity-60"
                          >
                            <span className="num w-8 shrink-0 text-center text-xl text-ink-2">
                              {workingIndex != null ? formatNumber(workingIndex, locale, { grouping: false }) : t('logger.warmupShort')}
                            </span>
                            <span className="num text-xl">{formatLoggedSet(r.reps, r.weightKg, locale)}</span>
                            <span className="ms-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                              {e1 != null ? (
                                <span className="num text-sm text-ink-2">{t('logger.e1rm', { kg: formatKg(round1(e1), locale) })}</span>
                              ) : null}
                              {r.rpe != null ? (
                                <span className="num text-sm text-ink-2">{t('logger.rpeShort', { n: formatNumber(r.rpe, locale) })}</span>
                              ) : null}
                              {r.isWarmup ? <span className="label-caps text-ink-2">{t('logger.warmupTag')}</span> : null}
                              {flag ? <Stamp status="PR" size="sm" /> : null}
                              {r.status === 'saving' ? (
                                <Loader2 className="spin size-4 text-ink-3" aria-label={t('logger.saving')} />
                              ) : null}
                            </span>
                          </button>
                          {r.status === 'failed' ? (
                            <button
                              type="button"
                              onClick={() => retry(r)}
                              className="flex min-h-14 shrink-0 items-center gap-1.5 border-s border-danger px-3 text-sm font-bold text-danger tx hover:bg-paper-2"
                            >
                              <RotateCw className="size-4" aria-hidden="true" />
                              {t('logger.retry')}
                            </button>
                          ) : null}
                        </div>
                        {r.status === 'failed' ? (
                          <p role="alert" className="flex items-start gap-1.5 px-3 pb-2 text-sm font-medium text-danger">
                            <CircleAlert className="mt-[0.2em] size-4 shrink-0" aria-hidden="true" />
                            {t('logger.saveFailed')}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 border-[1.5px] border-dashed border-ink-3 px-6 py-10 text-center">
            <p className="text-lg font-bold">{t('workout.emptyTitle')}</p>
            <p className="max-w-prose text-base text-ink-2">{t('workout.emptyBody')}</p>
            <Button variant="ink" size="lg" onClick={() => setPickerOpen(true)}>
              <Plus className="size-5" aria-hidden="true" />
              {t('strip.add')}
            </Button>
          </div>
        )}

        <p role="status" aria-live="polite" className="sr-only">
          {live}
        </p>
      </div>

      {/* desktop: the card fills in as you lift ---------------------------------------------- */}
      <aside className="hidden lg:sticky lg:top-6 lg:block" aria-label={t('workout.cardLabel')}>
        <TrainingCard data={cardData} locale={locale} />
      </aside>

      <ExercisePicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={addExercise} title={t('picker.addTitle')} />

      <EditSetSheet
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) setEditingId(null);
        }}
        title={
          !editing
            ? ''
            : editing.isWarmup
              ? t('edit.titleWarmup')
              : t('edit.title', {
                  n: formatNumber(
                    (exerciseRows.get(editing.exerciseId) ?? []).filter((x) => !x.isWarmup && x.setIndex <= editing.setIndex).length,
                    locale,
                    { grouping: false },
                  ),
                })
        }
        initial={{
          reps: editing?.reps ?? 1,
          weightKg: editing?.weightKg ?? 0,
          rpe: editing?.rpe ?? null,
          isWarmup: editing?.isWarmup ?? false,
        }}
        onSave={(v) => editing && saveEdit(editing, v)}
        onDelete={() => editing && deleteRow(editing)}
      />

      <Dialog
        open={finishOpen}
        onOpenChange={(o) => {
          if (!finishing) setFinishOpen(o);
        }}
        role="alertdialog"
        title={workingTotal === 0 && rows.length === 0 ? t('finish.emptyTitle') : t('finish.title')}
        description={
          workingTotal === 0 && rows.length === 0
            ? t('finish.emptyBody')
            : remainingTargets > 0
              ? t('finish.remaining', { sets: rows.filter((r) => r.status !== 'failed').length, left: remainingTargets })
              : t('finish.body', { count: rows.filter((r) => r.status !== 'failed').length })
        }
        actions={
          rows.length === 0 ? (
            <>
              <Button variant="danger" loading={finishing} onClick={discard}>
                {t('finish.discard')}
              </Button>
              <Button variant="outline" disabled={finishing} onClick={() => setFinishOpen(false)}>
                {t('finish.keepGoing')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ink" loading={finishing} disabled={failedCount > 0} onClick={finish}>
                {t('finish.confirm')}
              </Button>
              <Button variant="outline" disabled={finishing} onClick={() => setFinishOpen(false)}>
                {t('finish.keepGoing')}
              </Button>
            </>
          )
        }
      >
        {rows.length > 0 ? (
          <div className="flex flex-col gap-3">
            {failedCount > 0 ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {t('finish.failed', { count: failedCount })}
              </p>
            ) : null}
            <div>
              <label htmlFor={`${formId}-note`} className="mb-1.5 block text-sm font-semibold">
                {t('finish.note')} <span className="font-normal text-ink-3">({t('logger.optional')})</span>
              </label>
              <Textarea id={`${formId}-note`} rows={3} value={finishNote} onChange={(e) => setFinishNote(e.target.value)} maxLength={1000} />
            </div>
          </div>
        ) : null}
        <p role="alert" className="mt-2 text-sm font-medium text-danger empty:hidden">
          {finishError}
        </p>
      </Dialog>
    </div>
  );
}
