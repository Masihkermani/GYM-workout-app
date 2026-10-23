'use client';

import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useFocusFirstError } from '@/components/auth/useFocusFirstError';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Flash } from '@/components/ui/Flash';
import { Input } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { formatPhone } from '@/lib/phone';
import { updateClientAction, type UpdateClientState } from '@/server/coach';
import type { CoachErrorCode } from './schemas';
import { useManualForm } from './useManualForm';

const FORM_ID = 'edit-client-form';

function EditClientPanel({
  open,
  onClose,
  clientId,
  name,
  phone,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  name: string;
  phone: string;
}) {
  const t = useTranslations('coach');
  const locale = useLocale();
  const { toast } = useToast();
  const { state, pending, onSubmit } = useManualForm<UpdateClientState>(updateClientAction, {});
  const formRef = useFocusFirstError<HTMLFormElement>(state);
  const e = state.errors ?? {};
  const err = (code?: CoachErrorCode) => (code ? t(`errors.${code}`) : undefined);

  // a saved edit closes the sheet and says so once; the page behind refreshes with the new details
  useEffect(() => {
    if (!state.ok) return;
    toast({ tone: 'success', message: t('client.edit.saved') });
    onClose();
    // once per successful save
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t('client.edit.title')}
      description={t('client.edit.description')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('shared.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} loading={pending}>
            {t('shared.save')}
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="id" value={clientId} />
        {e.form ? <Flash tone="error">{err(e.form)}</Flash> : null}

        <Field label={t('clients.add.name')} error={err(e.name)} required>
          <Input name="name" autoComplete="off" defaultValue={state.values?.name ?? name} autoFocus />
        </Field>

        <Field label={t('clients.add.phone')} hint={t('clients.add.phoneHint')} error={err(e.phone)} required>
          <PhoneInput name="phone" autoComplete="off" defaultValue={state.values?.phone ?? formatPhone(phone, locale)} />
        </Field>

        {/* lets Enter submit from any field; the visible submit button lives in the sheet footer */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Sheet>
  );
}

/**
 * "Edit details" on the coach's client page: name and phone in a sheet. The phone is the client's
 * login, so a number that already belongs to someone else is reported on the field. A new `key` per
 * opening discards the previous attempt's errors.
 */
export function EditClientSheet({ clientId, name, phone }: { clientId: string; name: string; phone: string }) {
  const t = useTranslations('coach');
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-haspopup="dialog"
        onClick={() => {
          setRound((r) => r + 1);
          setOpen(true);
        }}
      >
        <Pencil className="size-4" aria-hidden="true" />
        {t('client.edit.button')}
      </Button>
      <EditClientPanel
        key={round}
        open={open}
        onClose={() => setOpen(false)}
        clientId={clientId}
        name={name}
        phone={phone}
      />
    </>
  );
}
