'use client';

import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useFocusFirstError } from '@/components/auth/useFocusFirstError';
import { Field } from '@/components/ui/Field';
import { Flash } from '@/components/ui/Flash';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { changePasswordAction, type PasswordState } from '@/server/coach';
import type { CoachErrorCode } from '../schemas';
import { useManualForm } from '../useManualForm';

export function PasswordForm() {
  const t = useTranslations('coach');
  const locale = useLocale();
  const { state, pending, onSubmit } = useManualForm<PasswordState>(changePasswordAction, {});
  const formRef = useFocusFirstError<HTMLFormElement>(state);
  const resetRef = useRef<HTMLFormElement | null>(null);
  const e = state.errors ?? {};
  const err = (code?: CoachErrorCode) => (code ? t(`errors.${code}`) : undefined);

  // the fields are cleared after a successful change so the passwords do not linger in the DOM
  useEffect(() => {
    if (state.ok) resetRef.current?.reset();
  }, [state.savedAt, state.ok]);

  return (
    <form
      ref={(node) => {
        formRef.current = node;
        resetRef.current = node;
      }}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="locale" value={locale} />
      {state.ok ? <Flash tone="success">{t('profile.password.done')}</Flash> : null}
      {e.form ? <Flash tone="error">{err(e.form)}</Flash> : null}
      <Field label={t('profile.password.current')} error={err(e.current)} required>
        <PasswordInput name="current" autoComplete="current-password" />
      </Field>
      <Field label={t('profile.password.next')} hint={t('profile.password.nextHint')} error={err(e.next)} required>
        <PasswordInput name="next" autoComplete="new-password" />
      </Field>
      <Field label={t('profile.password.confirm')} error={err(e.confirm)} required>
        <PasswordInput name="confirm" autoComplete="new-password" />
      </Field>
      <div>
        <SubmitButton variant="ink" loading={pending}>
          {t('profile.password.submit')}
        </SubmitButton>
      </div>
    </form>
  );
}
