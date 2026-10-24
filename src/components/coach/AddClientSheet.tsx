'use client';

import { useState } from 'react';
import { KeyRound, Plus, UserPlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useFocusFirstError } from '@/components/auth/useFocusFirstError';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Flash } from '@/components/ui/Flash';
import { Input } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Sheet } from '@/components/ui/Sheet';
import { formatPhone } from '@/lib/phone';
import { createClientAction, type CreateClientState } from '@/server/coach';
import { CopyButton } from './CopyButton';
import type { CoachErrorCode } from './schemas';
import { generateTempPassword } from './tempPassword';
import { useManualForm } from './useManualForm';

const FORM_ID = 'add-client-form';

/**
 * Stays mounted while closed (so the dialog closes in place and focus returns to the button); the
 * parent gives it a new `key` for every opening, which discards the form state.
 */
function AddClientPanel({ open, onClose, onAnother }: { open: boolean; onClose: () => void; onAnother: () => void }) {
  const t = useTranslations('coach');
  const locale = useLocale();
  const { state, pending, onSubmit } = useManualForm<CreateClientState>(createClientAction, {});
  const [password, setPassword] = useState('');
  const formRef = useFocusFirstError<HTMLFormElement>(state);
  const e = state.errors ?? {};
  const err = (code?: CoachErrorCode) => (code ? t(`errors.${code}`) : undefined);
  const created = state.created;

  const clip = created
    ? `${t('clients.add.clipPhone')}: ${formatPhone(created.phone, 'en')}\n${t('clients.add.clipPassword')}: ${password}`
    : '';

  return (
    <Sheet
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={created ? t('clients.add.createdTitle', { name: created.name }) : t('clients.add.title')}
      description={created ? undefined : t('clients.add.description')}
      footer={
        created ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onAnother}>
              <Plus className="size-4" aria-hidden="true" />
              {t('clients.add.another')}
            </Button>
            <ButtonLink href={`/coach/clients/${created.id}`}>{t('clients.add.openProfile')}</ButtonLink>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('shared.cancel')}
            </Button>
            <Button type="submit" form={FORM_ID} loading={pending}>
              {t('clients.add.submit')}
            </Button>
          </div>
        )
      }
    >
      {created ? (
        <div className="flex flex-col gap-5">
          <Flash tone="success">{t('clients.add.createdBody')}</Flash>
          <dl className="border-[1.5px] border-rule-strong bg-paper-2">
            <div className="flex items-baseline justify-between gap-4 border-b border-rule px-4 py-3">
              <dt className="text-sm font-semibold text-ink-2">{t('clients.add.phone')}</dt>
              <dd dir="ltr" className="text-lg font-bold">
                {formatPhone(created.phone, locale)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="text-sm font-semibold text-ink-2">{t('clients.add.password')}</dt>
              <dd dir="ltr" data-testid="temp-password" className="select-all text-lg font-bold tracking-wide">
                {password}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-ink-2">{t('clients.add.shareHint')}</p>
          <div>
            <CopyButton text={clip} label={t('clients.add.copy')} />
          </div>
        </div>
      ) : (
        <form id={FORM_ID} ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="clientLocale" value={locale} />
          {e.form ? <Flash tone="error">{err(e.form)}</Flash> : null}

          <Field label={t('clients.add.name')} error={err(e.name)} required>
            <Input name="name" autoComplete="off" defaultValue={state.values?.name ?? ''} autoFocus />
          </Field>

          <Field label={t('clients.add.phone')} hint={t('clients.add.phoneHint')} error={err(e.phone)} required>
            <PhoneInput name="phone" autoComplete="off" defaultValue={state.values?.phone ?? ''} />
          </Field>

          <div className="flex flex-col gap-2">
            <Field label={t('clients.add.password')} hint={t('clients.add.passwordHint')} error={err(e.password)} required>
              <Input
                name="password"
                dir="ltr"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
                className="rtl:text-end"
              />
            </Field>
            <div>
              <Button variant="outline" size="sm" onClick={() => setPassword(generateTempPassword())}>
                <KeyRound className="size-4" aria-hidden="true" />
                {t('clients.add.generate')}
              </Button>
            </div>
          </div>
          {/* lets Enter submit from any field; the visible submit button lives in the sheet footer */}
          <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
        </form>
      )}
    </Sheet>
  );
}

/** "Add client" button + sheet. After saving, the sheet shows the login details to hand over. */
export function AddClientSheet() {
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
        <UserPlus className="size-5" aria-hidden="true" />
        {t('clients.add.button')}
      </Button>
      <AddClientPanel
        key={round}
        open={open}
        onClose={() => setOpen(false)}
        onAnother={() => setRound((r) => r + 1)}
      />
    </>
  );
}
