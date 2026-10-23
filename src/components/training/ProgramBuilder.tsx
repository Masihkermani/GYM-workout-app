'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Check, CircleAlert, Loader2, Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { DirIcon } from '@/components/ui/DirIcon';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { NumberInput } from '@/components/ui/NumberInput';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Tabs } from '@/components/ui/Tabs';
import { Textarea } from '@/components/ui/Textarea';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { Link, useRouter } from '@/i18n/navigation';
import { dayToCardData } from '@/lib/training/card';
import { defaultDayTitle } from '@/lib/training/day-title';
import type { ProgramDTO, ProgramDayDTO, ProgramItemDTO } from '@/lib/training/dto';
import type { ActionErrorCode } from '@/lib/training/schemas';
import { exerciseName, type ExerciseDTO } from '@/lib/training/types';
import {
  addDayAction,
  addItemAction,
  deleteDayAction,
  deleteItemAction,
  deleteProgramAction,
  renameDayAction,
  reorderDaysAction,
  reorderItemsAction,
  updateItemAction,
  updateProgramAction,
} from '@/server/training';
import { ExercisePicker } from './ExercisePicker';
import { ExerciseSubName } from './ExerciseSubName';
import { TrainingCard } from './TrainingCard';

const SAVE_DELAY = 600;

type SaveState = 'saved' | 'saving' | 'error';
type PickerMode = { kind: 'add'; dayId: string } | { kind: 'change'; itemId: string } | null;
type Confirm = { kind: 'item'; dayId: string; itemId: string } | { kind: 'day'; dayId: string } | { kind: 'program' } | null;

function moveId(ids: string[], id: string, dir: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * The program builder, shared by the coach (/coach/clients/[id]/programs/[programId]) and clients
 * editing their own programs. Every edit autosaves through the server actions (debounced, one at a
 * time) with a visible Saved / Saving / Not saved state; structural changes (add, delete, reorder)
 * save at once. A live TrainingCard preview of the open day sits beside (desktop) or below (phone).
 */
export function ProgramBuilder({
  program: initial,
  viewer,
  backHref,
}: {
  program: ProgramDTO;
  viewer: 'coach' | 'client';
  backHref: string;
}) {
  const t = useTranslations('training');
  const locale = useLocale();
  const router = useRouter();
  const formId = useId();

  const programRef = useRef<ProgramDTO>(initial);
  const [program, setProgramState] = useState<ProgramDTO>(initial);
  const [activeDayId, setActiveDayId] = useState(initial.days[0]?.id ?? '');
  const [save, setSave] = useState<SaveState>('saved');
  const [picker, setPicker] = useState<PickerMode>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusReq, setFocusReq] = useState<{ id: string; n: number } | null>(null);

  /** Apply a change to the latest program synchronously (no stale closures in debounced jobs). */
  const update = useCallback((fn: (p: ProgramDTO) => ProgramDTO) => {
    programRef.current = fn(programRef.current);
    setProgramState(programRef.current);
  }, []);

  // ------------------------------------------------------------------------------ autosave
  const jobs = useRef(new Map<string, () => Promise<boolean>>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const failed = useRef(new Map<string, () => Promise<boolean>>());
  const chain = useRef<Promise<void>>(Promise.resolve());
  const inFlight = useRef(0);

  const settle = useCallback(() => {
    if (failed.current.size > 0) setSave('error');
    else if (inFlight.current === 0 && jobs.current.size === 0) setSave('saved');
  }, []);

  const run = useCallback(
    (key: string, job: () => Promise<boolean>) => {
      inFlight.current += 1;
      chain.current = chain.current.then(async () => {
        let ok = false;
        try {
          ok = await job();
        } catch {
          ok = false;
        }
        inFlight.current -= 1;
        if (ok) failed.current.delete(key);
        else failed.current.set(key, job);
        settle();
      });
    },
    [settle],
  );

  /** Debounced: the latest job for a key wins. */
  const schedule = useCallback(
    (key: string, job: () => Promise<boolean>) => {
      jobs.current.set(key, job);
      failed.current.delete(key);
      const old = timers.current.get(key);
      if (old) clearTimeout(old);
      setSave('saving');
      timers.current.set(
        key,
        setTimeout(() => {
          const j = jobs.current.get(key);
          jobs.current.delete(key);
          timers.current.delete(key);
          if (j) run(key, j);
        }, SAVE_DELAY),
      );
    },
    [run],
  );

  const flushAll = useCallback(() => {
    for (const [key, timer] of timers.current) {
      clearTimeout(timer);
      const j = jobs.current.get(key);
      jobs.current.delete(key);
      if (j) run(key, j);
    }
    timers.current.clear();
  }, [run]);

  /** An immediate, awaited write that still shows the Saving / Saved state. */
  const immediate = useCallback(
    async <T,>(work: () => Promise<T>): Promise<T | null> => {
      setSave('saving');
      inFlight.current += 1;
      try {
        await chain.current; // keep ordering with pending autosaves
        return await work();
      } catch {
        return null;
      } finally {
        inFlight.current -= 1;
        settle();
      }
    },
    [settle],
  );

  const retryFailed = () => {
    const entries = [...failed.current.entries()];
    failed.current.clear();
    setSave('saving');
    for (const [key, job] of entries) run(key, job);
  };

  // flush on tab hide / leave so nothing typed is lost
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushAll();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      flushAll();
      if (jobs.current.size > 0 || inFlight.current > 0 || failed.current.size > 0) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [flushAll]);

  // restore focus to a reorder button after React moves its row
  useEffect(() => {
    if (focusReq) document.getElementById(focusReq.id)?.focus();
  }, [focusReq]);

  const fail = (code: ActionErrorCode = 'generic') => {
    setNotice(t(`errors.${code}`));
    setSave('error');
  };

  // --------------------------------------------------------------------------- field edits
  const itemJob = (itemId: string) => async () => {
    const item = programRef.current.days.flatMap((d) => d.items).find((i) => i.id === itemId);
    if (!item) return true;
    const r = await updateItemAction({
      itemId,
      exerciseId: item.exercise.id,
      targetSets: item.targetSets,
      targetRepsMin: item.targetRepsMin,
      targetRepsMax: item.targetRepsMax,
      targetWeightKg: item.targetWeightKg,
      restSeconds: item.restSeconds,
      note: item.note,
    });
    if (r.ok) {
      // the server may normalise a range back to fixed reps; take its word for it
      update((p) => ({
        ...p,
        days: p.days.map((d) => ({
          ...d,
          items: d.items.map((i) => (i.id === itemId ? { ...i, targetRepsMax: r.item.targetRepsMax, targetRepsMin: r.item.targetRepsMin } : i)),
        })),
      }));
    }
    return r.ok;
  };

  const patchItem = (dayId: string, itemId: string, patch: Partial<ProgramItemDTO>) => {
    update((p) => ({
      ...p,
      days: p.days.map((d) =>
        d.id === dayId ? { ...d, items: d.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) } : d,
      ),
    }));
    schedule(`item:${itemId}`, itemJob(itemId));
  };

  const programJob = () => async () => {
    const cur = programRef.current;
    const r = await updateProgramAction({
      programId: initial.id,
      ...(cur.title.trim() ? { title: cur.title } : {}),
      notes: cur.notes ?? '',
    });
    return r.ok;
  };
  const setTitle = (title: string) => {
    update((p) => ({ ...p, title }));
    if (title.trim()) schedule('program', programJob());
  };
  const setNotes = (notes: string) => {
    update((p) => ({ ...p, notes }));
    schedule('program', programJob());
  };

  const renameDay = (dayId: string, title: string) => {
    update((p) => ({ ...p, days: p.days.map((d) => (d.id === dayId ? { ...d, title } : d)) }));
    if (title.trim()) {
      schedule(`day:${dayId}`, async () => {
        const day = programRef.current.days.find((d) => d.id === dayId);
        if (!day || !day.title.trim()) return true;
        return (await renameDayAction({ dayId, title: day.title })).ok;
      });
    }
  };

  // --------------------------------------------------------------------- structural changes
  async function addDay() {
    setBusy(true);
    const n = programRef.current.days.length + 1;
    const r = await immediate(() => addDayAction({ programId: program.id, title: defaultDayTitle(n, locale) }));
    setBusy(false);
    if (!r || !r.ok) return fail(r && !r.ok ? r.error : undefined);
    update((p) => ({ ...p, days: [...p.days, { id: r.day.id, order: r.day.order, title: r.day.title, items: [] }] }));
    setActiveDayId(r.day.id);
  }

  async function moveDay(dayId: string, dir: -1 | 1) {
    const ids = moveId(programRef.current.days.map((d) => d.id), dayId, dir);
    if (!ids) return;
    const before = programRef.current;
    update((p) => ({ ...p, days: ids.map((id) => p.days.find((d) => d.id === id)!) }));
    const r = await immediate(() => reorderDaysAction({ programId: program.id, orderedIds: ids }));
    if (!r || !r.ok) {
      update(() => before);
      fail(r && !r.ok ? r.error : undefined);
    }
  }

  async function moveItem(dayId: string, itemId: string, dir: -1 | 1, btnId: string) {
    const day = programRef.current.days.find((d) => d.id === dayId);
    if (!day) return;
    const ids = moveId(day.items.map((i) => i.id), itemId, dir);
    if (!ids) return;
    const before = programRef.current;
    update((p) => ({
      ...p,
      days: p.days.map((d) => (d.id === dayId ? { ...d, items: ids.map((id) => d.items.find((i) => i.id === id)!) } : d)),
    }));
    setFocusReq((prev) => ({ id: btnId, n: (prev?.n ?? 0) + 1 }));
    const r = await immediate(() => reorderItemsAction({ dayId, orderedIds: ids }));
    if (!r || !r.ok) {
      update(() => before);
      fail(r && !r.ok ? r.error : undefined);
    }
  }

  async function addItem(dayId: string, exercise: ExerciseDTO) {
    const r = await immediate(() => addItemAction({ dayId, exerciseId: exercise.id }));
    if (!r || !r.ok) return fail(r && !r.ok ? r.error : undefined);
    update((p) => ({ ...p, days: p.days.map((d) => (d.id === dayId ? { ...d, items: [...d.items, r.item] } : d)) }));
  }

  function changeExercise(itemId: string, exercise: ExerciseDTO) {
    update((p) => ({
      ...p,
      days: p.days.map((d) => ({ ...d, items: d.items.map((i) => (i.id === itemId ? { ...i, exercise } : i)) })),
    }));
    schedule(`item:${itemId}`, itemJob(itemId));
  }

  async function doConfirm() {
    if (!confirm) return;
    setBusy(true);
    if (confirm.kind === 'item') {
      const { dayId, itemId } = confirm;
      const r = await immediate(() => deleteItemAction({ itemId }));
      if (r?.ok) {
        update((p) => ({
          ...p,
          days: p.days.map((d) => (d.id === dayId ? { ...d, items: d.items.filter((i) => i.id !== itemId) } : d)),
        }));
      } else fail(r && !r.ok ? r.error : undefined);
    } else if (confirm.kind === 'day') {
      const { dayId } = confirm;
      const r = await immediate(() => deleteDayAction({ dayId }));
      if (r?.ok) {
        const days = programRef.current.days;
        const idx = days.findIndex((d) => d.id === dayId);
        const next = days[idx + 1] ?? days[idx - 1];
        update((p) => ({ ...p, days: p.days.filter((d) => d.id !== dayId) }));
        if (next) setActiveDayId(next.id);
      } else fail(r && !r.ok ? r.error : undefined);
    } else {
      const r = await immediate(() => deleteProgramAction({ programId: program.id }));
      if (r?.ok) {
        router.replace(backHref);
        return;
      }
      fail(r && !r.ok ? r.error : undefined);
    }
    setBusy(false);
    setConfirm(null);
  }

  async function toggleActive() {
    const next = !programRef.current.active;
    const r = await immediate(() => updateProgramAction({ programId: program.id, active: next }));
    if (r?.ok) update((p) => ({ ...p, active: next }));
    else fail(r && !r.ok ? r.error : undefined);
  }

  // ------------------------------------------------------------------------------- render
  const activeDay = program.days.find((d) => d.id === activeDayId) ?? program.days[0];
  const cardData = useMemo(
    () =>
      activeDay
        ? dayToCardData({
            clientName: program.clientName,
            dayTitle: activeDay.title || defaultDayTitle(activeDay.order, locale),
            date: new Date(),
            items: activeDay.items.map((i) => ({
              exercise: i.exercise,
              targetSets: i.targetSets,
              targetRepsMin: i.targetRepsMin,
              targetRepsMax: i.targetRepsMax,
              targetWeightKg: i.targetWeightKg,
            })),
            locale,
          })
        : null,
    [activeDay, program.clientName, locale],
  );

  const statusIcon =
    save === 'saving' ? (
      <Loader2 className="spin size-4" aria-hidden="true" />
    ) : save === 'error' ? (
      <CircleAlert className="size-4" aria-hidden="true" />
    ) : (
      <Check className="size-4" aria-hidden="true" />
    );

  const confirmCopy = (() => {
    if (!confirm) return null;
    if (confirm.kind === 'item') {
      const it = program.days.flatMap((d) => d.items).find((i) => i.id === confirm.itemId);
      return {
        title: t('builder.removeItemTitle'),
        body: t('builder.removeItemBody', { name: it ? exerciseName(it.exercise, locale) : '' }),
        action: t('builder.remove'),
      };
    }
    if (confirm.kind === 'day') {
      const day = program.days.find((d) => d.id === confirm.dayId);
      return { title: t('builder.deleteDayTitle'), body: t('builder.deleteDayBody', { name: day?.title ?? '' }), action: t('builder.deleteDay') };
    }
    return { title: t('builder.deleteProgramTitle'), body: t('builder.deleteProgramBody'), action: t('builder.deleteProgram') };
  })();

  return (
    <div className="page-x flex flex-col gap-6 py-6 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="-ms-2 inline-flex min-h-11 items-center gap-1.5 rounded-[var(--r)] px-2 text-base font-semibold text-ink tx hover:bg-paper-2"
        >
          <DirIcon name="chevron-back" className="size-5" />
          {viewer === 'coach' ? t('builder.backCoach') : t('builder.backClient')}
        </Link>
        <p
          role="status"
          aria-live="polite"
          className={cn(
            'inline-flex min-h-11 items-center gap-2 border-[1.5px] px-3 text-sm font-bold',
            save === 'error' ? 'border-danger text-danger' : save === 'saving' ? 'border-ink-3 text-ink-2' : 'border-plate-green text-stamp-green',
          )}
        >
          {statusIcon}
          {save === 'saving' ? t('builder.saving') : save === 'error' ? t('builder.notSaved') : t('builder.saved')}
          {save === 'error' ? (
            <button type="button" onClick={retryFailed} className="ms-1 min-h-11 px-2 underline underline-offset-4">
              {t('builder.retry')}
            </button>
          ) : null}
        </p>
      </div>

      <header className="flex flex-col gap-1">
        <p className="label-caps text-ink-2">
          {viewer === 'coach' ? t('builder.forClient', { name: program.clientName }) : t('builder.yours')}
          {!program.active ? <span> — {t('builder.archivedTag')}</span> : null}
        </p>
        <h1 className="text-3xl">{t('builder.heading')}</h1>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10">
        <div className="flex min-w-0 flex-col gap-8">
          {/* program fields ------------------------------------------------------------ */}
          <section className="flex flex-col gap-4" aria-label={t('builder.programFields')}>
            <Field label={t('builder.programTitle')} error={program.title.trim() ? undefined : t('builder.titleRequired')} required>
              <Input value={program.title} maxLength={80} onChange={(e) => setTitle(e.target.value)} onBlur={flushAll} />
            </Field>
            <Field label={viewer === 'coach' ? t('builder.notesCoach') : t('builder.notes')} optional>
              <Textarea rows={3} value={program.notes ?? ''} maxLength={2000} onChange={(e) => setNotes(e.target.value)} onBlur={flushAll} />
            </Field>
          </section>

          {/* days ------------------------------------------------------------------- */}
          <section className="flex flex-col gap-4" aria-label={t('builder.daysLabel')}>
            <SectionLabel
              action={
                <Button variant="outline" size="sm" onClick={addDay} loading={busy && !confirm}>
                  <Plus className="size-4" aria-hidden="true" />
                  {t('builder.addDay')}
                </Button>
              }
            >
              {t('builder.daysLabel')}
            </SectionLabel>

            <Tabs
              label={t('builder.daysLabel')}
              value={activeDay?.id}
              onValueChange={setActiveDayId}
              tabs={program.days.map((d, i) => ({
                id: d.id,
                label: <bdi>{d.title.trim() || defaultDayTitle(i + 1, locale)}</bdi>,
                panel: (
                  <DayEditor
                    key={d.id}
                    day={d}
                    index={i}
                    count={program.days.length}
                    onRename={(title) => renameDay(d.id, title)}
                    onFlush={flushAll}
                    onMoveDay={(dir) => moveDay(d.id, dir)}
                    onDeleteDay={() => setConfirm({ kind: 'day', dayId: d.id })}
                    onAddItem={() => setPicker({ kind: 'add', dayId: d.id })}
                    onChangeItem={(itemId) => setPicker({ kind: 'change', itemId })}
                    onPatchItem={(itemId, patch) => patchItem(d.id, itemId, patch)}
                    onFlushItem={flushAll}
                    onMoveItem={(itemId, dir, btnId) => moveItem(d.id, itemId, dir, btnId)}
                    onDeleteItem={(itemId) => setConfirm({ kind: 'item', dayId: d.id, itemId })}
                  />
                ),
              }))}
            />
          </section>

          {/* program settings --------------------------------------------------------- */}
          <section className="flex flex-col gap-3 border-t border-rule pt-6" aria-label={t('builder.settings')}>
            <h2 className="label-caps text-ink-2">{t('builder.settings')}</h2>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={toggleActive}>
                {program.active ? <Archive className="size-5" aria-hidden="true" /> : <ArchiveRestore className="size-5" aria-hidden="true" />}
                {program.active ? t('builder.archive') : t('builder.activate')}
              </Button>
              <Button variant="outline" onClick={() => setConfirm({ kind: 'program' })}>
                <Trash2 className="size-5" aria-hidden="true" />
                {t('builder.deleteProgram')}
              </Button>
            </div>
            <p className="max-w-prose text-sm text-ink-2">{program.active ? t('builder.archiveHint') : t('builder.activateHint')}</p>
          </section>
        </div>

        {/* preview ----------------------------------------------------------------------- */}
        <aside className="mt-8 flex flex-col gap-3 lg:sticky lg:top-6 lg:mt-0" aria-label={t('builder.previewLabel')}>
          <h2 className="label-caps text-ink-2">{t('builder.previewLabel')}</h2>
          {cardData ? <TrainingCard data={cardData} locale={locale} /> : null}
          <p className="text-sm text-ink-2">{t('builder.previewHint')}</p>
        </aside>
      </div>

      <p role="alert" className="text-sm font-medium text-danger empty:hidden" id={`${formId}-notice`}>
        {notice}
      </p>

      <ExercisePicker
        open={picker !== null}
        onOpenChange={(o) => {
          if (!o) setPicker(null);
        }}
        title={picker?.kind === 'change' ? t('picker.changeTitle') : t('picker.addTitle')}
        onSelect={(ex) => {
          if (picker?.kind === 'add') void addItem(picker.dayId, ex);
          else if (picker?.kind === 'change') changeExercise(picker.itemId, ex);
        }}
      />

      <Dialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o && !busy) setConfirm(null);
        }}
        role="alertdialog"
        title={confirmCopy?.title ?? ''}
        description={confirmCopy?.body}
        actions={
          <>
            <Button variant="danger" loading={busy} onClick={doConfirm}>
              {confirmCopy?.action}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
              {t('builder.cancel')}
            </Button>
          </>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------- day editor

function DayEditor({
  day,
  index,
  count,
  onRename,
  onFlush,
  onMoveDay,
  onDeleteDay,
  onAddItem,
  onChangeItem,
  onPatchItem,
  onFlushItem,
  onMoveItem,
  onDeleteItem,
}: {
  day: ProgramDayDTO;
  index: number;
  count: number;
  onRename: (title: string) => void;
  onFlush: () => void;
  onMoveDay: (dir: -1 | 1) => void;
  onDeleteDay: () => void;
  onAddItem: () => void;
  onChangeItem: (itemId: string) => void;
  onPatchItem: (itemId: string, patch: Partial<ProgramItemDTO>) => void;
  onFlushItem: () => void;
  onMoveItem: (itemId: string, dir: -1 | 1, btnId: string) => void;
  onDeleteItem: (itemId: string) => void;
}) {
  const t = useTranslations('training');
  const locale = useLocale();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('builder.dayTitle')} className="min-w-0 flex-1 basis-56">
          <Input
            value={day.title}
            maxLength={80}
            onChange={(e) => onRename(e.target.value)}
            onBlur={onFlush}
            placeholder={defaultDayTitle(index + 1, locale)}
          />
        </Field>
        <div className="flex gap-1" role="group" aria-label={t('builder.dayActions')}>
          <IconButton label={t('builder.dayEarlier')} disabled={index === 0} onClick={() => onMoveDay(-1)}>
            <DirIcon name="chevron-back" className="size-5" />
          </IconButton>
          <IconButton label={t('builder.dayLater')} disabled={index === count - 1} onClick={() => onMoveDay(1)}>
            <DirIcon name="chevron-forward" className="size-5" />
          </IconButton>
          <IconButton label={t('builder.deleteDay')} disabled={count <= 1} onClick={onDeleteDay}>
            <Trash2 className="size-5" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      {day.items.length === 0 ? (
        <p className="border-[1.5px] border-dashed border-ink-3 px-4 py-8 text-center text-base text-ink-2">{t('builder.emptyDay')}</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {day.items.map((item, i) => (
            <ItemRow
              key={item.id}
              item={item}
              number={i + 1}
              first={i === 0}
              last={i === day.items.length - 1}
              onChange={() => onChangeItem(item.id)}
              onPatch={(patch) => onPatchItem(item.id, patch)}
              onBlur={onFlushItem}
              onMove={(dir, btnId) => onMoveItem(item.id, dir, btnId)}
              onDelete={() => onDeleteItem(item.id)}
            />
          ))}
        </ol>
      )}

      <div>
        <Button variant="ink" onClick={onAddItem}>
          <Plus className="size-5" aria-hidden="true" />
          {t('builder.addExercise')}
        </Button>
      </div>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  id,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  id?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      id={id}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 shrink-0 items-center justify-center rounded-[var(--r)] border-[1.5px] border-transparent text-ink tx hover:border-ink-3 hover:bg-paper-2 active:translate-y-px disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------------- item row

function ItemRow({
  item,
  number,
  first,
  last,
  onChange,
  onPatch,
  onBlur,
  onMove,
  onDelete,
}: {
  item: ProgramItemDTO;
  number: number;
  first: boolean;
  last: boolean;
  onChange: () => void;
  onPatch: (patch: Partial<ProgramItemDTO>) => void;
  onBlur: () => void;
  onMove: (dir: -1 | 1, btnId: string) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('training');
  const locale = useLocale();
  const name = exerciseName(item.exercise, locale);
  const isRange = item.targetRepsMax != null;
  const upId = `move-up-${item.id}`;
  const downId = `move-down-${item.id}`;
  const modeName = useId();

  return (
    <li className="border-[1.5px] border-rule-strong bg-card" onBlur={onBlur}>
      <div className="flex items-start gap-2 border-b border-rule py-1.5 ps-3 pe-1">
        <span className="num mt-2.5 w-6 shrink-0 text-xl text-ink-2">{formatNumber(number, locale, { grouping: false })}</span>
        <button
          type="button"
          onClick={onChange}
          aria-label={t('builder.changeExercise', { name })}
          className="min-h-11 min-w-0 flex-1 rounded-[var(--r)] py-1 text-start tx hover:bg-paper-2"
        >
          <span className="block text-base font-bold">
            <bdi>{name}</bdi>
          </span>
          <ExerciseSubName exercise={item.exercise} locale={locale} />
        </button>
        <div className="flex shrink-0">
          <IconButton id={upId} label={t('builder.moveUp', { name })} disabled={first} onClick={() => onMove(-1, upId)}>
            <ArrowUp className="size-5" aria-hidden="true" />
          </IconButton>
          <IconButton id={downId} label={t('builder.moveDown', { name })} disabled={last} onClick={() => onMove(1, downId)}>
            <ArrowDown className="size-5" aria-hidden="true" />
          </IconButton>
          <IconButton label={t('builder.removeExercise', { name })} onClick={onDelete}>
            <Trash2 className="size-5" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-4 p-3">
        <Field label={t('builder.sets')}>
          <NumberInput
            min={1}
            max={20}
            step={1}
            decimals={0}
            value={item.targetSets}
            onChange={(v) => v != null && v >= 1 && onPatch({ targetSets: v })}
          />
        </Field>

        <Field label={t('builder.rest')}>
          <NumberInput
            min={0}
            max={1800}
            step={15}
            decimals={0}
            value={item.restSeconds}
            onChange={(v) => onPatch({ restSeconds: v })}
          />
        </Field>

        <div className="col-span-2 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold">{t('builder.reps')}</span>
            <div role="radiogroup" aria-label={t('builder.repsMode')} className="flex border-[1.5px] border-ink-3">
              {(['fixed', 'range'] as const).map((mode) => {
                const on = (mode === 'range') === isRange;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    name={modeName}
                    onClick={() =>
                      mode === 'range'
                        ? !isRange && onPatch({ targetRepsMax: Math.min(100, item.targetRepsMin + 2) })
                        : isRange && onPatch({ targetRepsMax: null })
                    }
                    className={cn(
                      'min-h-11 px-3 text-sm font-semibold tx',
                      on ? 'bg-ink text-paper' : 'bg-card text-ink hover:bg-paper-2',
                    )}
                  >
                    {t(mode === 'fixed' ? 'builder.repsFixed' : 'builder.repsRange')}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-end gap-3">
            <Field label={isRange ? t('builder.repsFrom') : t('builder.repsCount')} className="min-w-0 flex-1">
              <NumberInput
                min={1}
                max={100}
                step={1}
                decimals={0}
                value={item.targetRepsMin}
                onChange={(v) => v != null && v >= 1 && onPatch({ targetRepsMin: v })}
              />
            </Field>
            {isRange ? (
              <Field label={t('builder.repsTo')} className="min-w-0 flex-1">
                <NumberInput
                  min={item.targetRepsMin + 1}
                  max={100}
                  step={1}
                  decimals={0}
                  value={item.targetRepsMax}
                  onChange={(v) => v != null && v > item.targetRepsMin && onPatch({ targetRepsMax: v })}
                />
              </Field>
            ) : null}
          </div>
        </div>

        <Field label={t('builder.weight')} hint={t('builder.weightHint')} className="col-span-2 sm:col-span-1">
          <NumberInput
            min={0}
            max={1000}
            step={2.5}
            decimals={2}
            value={item.targetWeightKg}
            onChange={(v) => onPatch({ targetWeightKg: v })}
          />
        </Field>

        <Field label={t('builder.note')} optional className="col-span-2 sm:col-span-1">
          <Input value={item.note ?? ''} maxLength={300} onChange={(e) => onPatch({ note: e.target.value })} />
        </Field>
      </div>
    </li>
  );
}
