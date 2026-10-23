'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useFocusFirstError } from '@/components/auth/useFocusFirstError';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Flash } from '@/components/ui/Flash';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import { createExerciseAction, type ExerciseState } from '@/server/coach';
import { MountedSheet } from './MountedSheet';
import type { CoachErrorCode } from './schemas';
import { useManualForm } from './useManualForm';

interface Option {
  value: string;
  label: string;
}

const FORM_ID = 'add-exercise-form';

function AddExercisePanel({
  open,
  bodyParts,
  equipment,
  targets,
  onClose,
}: {
  open: boolean;
  bodyParts: Option[];
  equipment: Option[];
  targets: Option[];
  onClose: () => void;
}) {
  const t = useTranslations('coach');
  const locale = useLocale();
  const { toast } = useToast();
  const { state, pending, onSubmit } = useManualForm<ExerciseState>(createExerciseAction, {});
  const formRef = useFocusFirstError<HTMLFormElement>(state);
  const e = state.errors ?? {};
  const err = (code?: CoachErrorCode) => (code ? t(`errors.${code}`) : undefined);

  useEffect(() => {
    if (state.ok) {
      toast({ tone: 'success', message: t('exercises.add.created') });
      onClose();
    }
    // once per successful save
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt]);

  const select = (name: 'bodyPart' | 'equipment' | 'target', options: Option[], code?: CoachErrorCode, label?: string) => (
    <Field label={label ?? ''} error={err(code)} required>
      <Select name={name} defaultValue={state.values?.[name] ?? ''}>
        <option value="">{t('exercises.add.choose')}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <MountedSheet
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('exercises.add.title')}
      description={t('exercises.add.description')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('shared.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} loading={pending}>
            {t('exercises.add.submit')}
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="locale" value={locale} />
        {e.form ? <Flash tone="error">{err(e.form)}</Flash> : null}
        <Field label={t('exercises.add.nameEn')} error={err(e.nameEn)} required>
          <Input name="nameEn" dir="ltr" lang="en" autoComplete="off" defaultValue={state.values?.nameEn ?? ''} autoFocus />
        </Field>
        <Field label={t('exercises.add.nameFa')} hint={t('exercises.add.nameFaHint')} error={err(e.nameFa)} optional>
          <Input name="nameFa" dir="rtl" lang="fa" autoComplete="off" defaultValue={state.values?.nameFa ?? ''} />
        </Field>
        {select('bodyPart', bodyParts, e.bodyPart, t('exercises.add.bodyPart'))}
        {select('equipment', equipment, e.equipment, t('exercises.add.equipment'))}
        {select('target', targets, e.target, t('exercises.add.target'))}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </MountedSheet>
  );
}

/** "Add custom exercise": Persian name optional; body part, equipment and target come from the library's own lists. */
export function AddExerciseSheet(props: { bodyParts: Option[]; equipment: Option[]; targets: Option[] }) {
  const t = useTranslations('coach');
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setRound((r) => r + 1); // a fresh form for every opening
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        <Plus className="size-5" aria-hidden="true" />
        {t('exercises.add.button')}
      </Button>
      <AddExercisePanel key={round} {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
