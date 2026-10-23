'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Field } from '@/components/ui/Field';
import { Flash } from '@/components/ui/Flash';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AuthErrorCode } from '@/lib/validation';
import { registerAction, type AuthFormState } from '@/server/auth';
import { useFocusFirstError } from './useFocusFirstError';

export function RegisterForm() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [state, action] = useActionState<AuthFormState, FormData>(registerAction, {});
  const formRef = useFocusFirstError<HTMLFormElement>(state);
  const e = state.errors ?? {};
  const errorText = (code?: AuthErrorCode) => (code ? t(`errors.${code}`) : undefined);

  return (
    <form ref={formRef} action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />

      {e.form ? <Flash tone="error">{errorText(e.form)}</Flash> : null}

      <Field label={t('register.name')} error={errorText(e.name)} required>
        <Input name="name" autoComplete="name" defaultValue={state.values?.name ?? ''} autoFocus />
      </Field>

      <Field label={t('register.phone')} hint={t('register.phoneHint')} error={errorText(e.phone)} required>
        <PhoneInput name="phone" defaultValue={state.values?.phone ?? ''} />
      </Field>

      <Field label={t('register.password')} hint={t('register.passwordHint')} error={errorText(e.password)} required>
        <PasswordInput name="password" autoComplete="new-password" minLength={8} />
      </Field>

      <SubmitButton size="lg" fullWidth>
        {t('register.submit')}
      </SubmitButton>
    </form>
  );
}
