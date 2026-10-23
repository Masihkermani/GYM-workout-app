'use client';

import { useActionState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Field } from '@/components/ui/Field';
import { Flash } from '@/components/ui/Flash';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { SubmitButton } from '@/components/ui/SubmitButton';
import type { AuthErrorCode } from '@/lib/validation';
import { loginAction, type AuthFormState } from '@/server/auth';
import { useFocusFirstError } from './useFocusFirstError';

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations('auth');
  const locale = useLocale();
  const [state, action] = useActionState<AuthFormState, FormData>(loginAction, {});
  const formRef = useFocusFirstError<HTMLFormElement>(state);
  const e = state.errors ?? {};
  const errorText = (code?: AuthErrorCode) =>
    code ? t(`errors.${code}`, { minutes: state.retryAfterMinutes ?? 0 }) : undefined;

  return (
    <form ref={formRef} action={action} noValidate className="flex flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {e.form ? <Flash tone="error">{errorText(e.form)}</Flash> : null}

      <Field label={t('login.phone')} hint={t('login.phoneHint')} error={errorText(e.phone)} required>
        <PhoneInput name="phone" defaultValue={state.values?.phone ?? ''} autoFocus />
      </Field>

      <Field label={t('login.password')} error={errorText(e.password)} required>
        <PasswordInput name="password" autoComplete="current-password" />
      </Field>

      <SubmitButton size="lg" fullWidth>
        {t('login.submit')}
      </SubmitButton>
    </form>
  );
}
