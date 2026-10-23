'use client';

import { useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useFocusFirstError } from '@/components/auth/useFocusFirstError';
import { Field } from '@/components/ui/Field';
import { Flash } from '@/components/ui/Flash';
import { Input } from '@/components/ui/Input';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { updateProfileAction, type ProfileState } from '@/server/coach';
import { GOAL_MAX, type CoachErrorCode } from '../schemas';
import { useManualForm } from '../useManualForm';

export function ProfileForm({ name, goal }: { name: string; goal: string }) {
  const t = useTranslations('coach');
  const locale = useLocale();
  const { toast } = useToast();
  const { state, pending, onSubmit } = useManualForm<ProfileState>(updateProfileAction, {});
  const formRef = useFocusFirstError<HTMLFormElement>(state);
  const e = state.errors ?? {};
  const err = (code?: CoachErrorCode) => (code ? t(`errors.${code}`) : undefined);

  useEffect(() => {
    if (state.ok) toast({ tone: 'success', message: t('profile.saved') });
    // once per successful save
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt]);

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />
      {e.form ? <Flash tone="error">{err(e.form)}</Flash> : null}
      <Field label={t('profile.name')} error={err(e.name)} required>
        <Input name="name" autoComplete="name" defaultValue={name} />
      </Field>
      <Field label={t('profile.goal')} hint={t('profile.goalHint')} error={err(e.goal)} optional>
        <Textarea name="goal" rows={3} maxLength={GOAL_MAX} defaultValue={goal} />
      </Field>
      <div>
        <SubmitButton loading={pending}>{t('profile.save')}</SubmitButton>
      </div>
    </form>
  );
}
