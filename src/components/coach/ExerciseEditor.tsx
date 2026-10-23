'use client';

import { useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useFocusFirstError } from '@/components/auth/useFocusFirstError';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Flash } from '@/components/ui/Flash';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { usePathname, useRouter } from '@/i18n/navigation';
import { deleteExerciseAction, updateExerciseAction, type ExerciseState } from '@/server/coach';
import { joinMeta } from './format';
import { MountedSheet } from './MountedSheet';
import type { ExerciseDetail } from './queries';
import type { CoachErrorCode } from './schemas';
import { STEPS_MAX_LINES } from './schemas';
import { Switch } from './Switch';
import { taxonomyDict, taxonomyLabel } from './taxonomy';
import { useManualForm } from './useManualForm';

const FORM_ID = 'exercise-editor-form';

/** Side sheet that edits one exercise. Open state is the `?edit=<id>` URL param, so it can be linked. */
export function ExerciseEditor({ exercise }: { exercise: ExerciseDetail }) {
  const t = useTranslations('coach');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { toast } = useToast();
  const { state, pending, onSubmit } = useManualForm<ExerciseState>(updateExerciseAction, {});
  const formRef = useFocusFirstError<HTMLFormElement>(state);
  // Closing flips `open` first (the dialog closes in place, so focus returns to the row link) and
  // only then drops `?edit=` from the URL, which unmounts this component.
  const [open, setOpen] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  const body = taxonomyDict(t, 'bodyPart');
  const gear = taxonomyDict(t, 'equipment');
  const target = taxonomyDict(t, 'target');

  const close = () => {
    setOpen(false);
    const sp = new URLSearchParams(params.toString());
    sp.delete('edit');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  useEffect(() => {
    if (state.ok) {
      toast({ tone: 'success', message: t('exercises.editor.saved') });
      close();
    }
    // run once per successful save
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt]);

  const e = state.errors ?? {};
  const err = (code?: CoachErrorCode) => (code ? t(`errors.${code}`, { max: STEPS_MAX_LINES }) : undefined);
  const inUse = exercise.usage.sets + exercise.usage.items > 0;
  const canDelete = exercise.isCustom && !inUse;
  const displayName = locale === 'fa' ? (exercise.nameFa ?? exercise.nameEn) : exercise.nameEn;

  const runDelete = () => {
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteExerciseAction(exercise.id);
      if (result.ok) {
        setConfirmDelete(false);
        toast({ tone: 'success', message: t('exercises.editor.deleted') });
        close();
      } else {
        setDeleteError(t(`errors.${result.error}`));
      }
    });
  };

  return (
    <>
      <MountedSheet
        open={open}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        title={<bdi>{displayName}</bdi>}
        description={joinMeta([taxonomyLabel(body, exercise.bodyPart), taxonomyLabel(gear, exercise.equipment), taxonomyLabel(target, exercise.target)], locale)}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            {canDelete ? (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4" aria-hidden="true" />
                {t('exercises.editor.delete')}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={close}>
                {t('shared.cancel')}
              </Button>
              <Button type="submit" form={FORM_ID} loading={pending}>
                {t('shared.save')}
              </Button>
            </div>
          </div>
        }
      >
        <form id={FORM_ID} ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <input type="hidden" name="id" value={exercise.id} />
          <input type="hidden" name="locale" value={locale} />
          {e.form ? <Flash tone="error">{err(e.form)}</Flash> : null}

          <Field label={t('exercises.editor.nameFa')} error={err(e.nameFa)}>
            <Input name="nameFa" dir="rtl" lang="fa" defaultValue={exercise.nameFa ?? ''} autoComplete="off" />
          </Field>

          {exercise.isCustom ? (
            <Field label={t('exercises.editor.nameEn')} error={err(e.nameEn)} required>
              <Input name="nameEn" dir="ltr" lang="en" defaultValue={exercise.nameEn} autoComplete="off" />
            </Field>
          ) : (
            <div>
              <p className="mb-1.5 text-sm font-semibold">{t('exercises.editor.nameEn')}</p>
              <p dir="ltr" className="rtl:text-end text-base text-ink-2">
                {exercise.nameEn}
              </p>
              <p className="mt-1 text-sm text-ink-3">{t('exercises.editor.nameEnLocked')}</p>
            </div>
          )}

          <Field label={t('exercises.editor.stepsFa')} hint={t('exercises.editor.stepsHint')} error={err(e.stepsFa)}>
            <Textarea name="stepsFa" dir="rtl" lang="fa" rows={6} defaultValue={exercise.stepsFa.join('\n')} />
          </Field>

          <Field label={t('exercises.editor.stepsEn')} hint={t('exercises.editor.stepsHint')} error={err(e.stepsEn)}>
            <Textarea name="stepsEn" dir="ltr" lang="en" rows={6} defaultValue={exercise.stepsEn.join('\n')} />
          </Field>

          <div className="border-t border-rule pt-3">
            <Switch
              name="archived"
              label={t('exercises.editor.archive')}
              hint={t('exercises.editor.archiveHint')}
              defaultChecked={exercise.archived}
            />
            {inUse ? (
              <p className="mt-2 text-sm text-ink-2">
                {t('exercises.editor.usage', { sets: exercise.usage.sets, items: exercise.usage.items })}
              </p>
            ) : null}
          </div>
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
        </form>
      </MountedSheet>

      <Dialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        role="alertdialog"
        title={t('exercises.editor.deleteTitle', { name: displayName })}
        description={t('exercises.editor.deleteBody')}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t('shared.cancel')}
            </Button>
            <Button variant="danger" onClick={runDelete} loading={deleting}>
              {t('exercises.editor.deleteConfirm')}
            </Button>
          </>
        }
      >
        {deleteError ? <Flash tone="error">{deleteError}</Flash> : null}
      </Dialog>
    </>
  );
}
