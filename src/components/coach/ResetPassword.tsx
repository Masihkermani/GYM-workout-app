'use client';

import { useState, useTransition } from 'react';
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Flash } from '@/components/ui/Flash';
import { resetClientPasswordAction } from '@/server/coach';
import { CopyButton } from './CopyButton';

/**
 * Reset a client's password. The new temporary password is generated on the server, returned once
 * and held only in this component's state: closing the dialog discards it for good.
 */
export function ResetPassword({ clientId, clientName }: { clientId: string; clientName: string }) {
  const t = useTranslations('coach');
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    setOpen(false);
    setPassword(null);
    setError(null);
  };

  const reset = () => {
    setError(null);
    startTransition(async () => {
      const result = await resetClientPasswordAction(clientId);
      if (result.ok) setPassword(result.password);
      else setError(t(`errors.${result.error}`));
    });
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <KeyRound className="size-5" aria-hidden="true" />
        {t('client.reset.button')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        role={password ? 'dialog' : 'alertdialog'}
        title={password ? t('client.reset.doneTitle') : t('client.reset.title', { name: clientName })}
        description={password ? t('client.reset.doneBody') : t('client.reset.body')}
        actions={
          password ? (
            <>
              <CopyButton text={password} label={t('client.reset.copy')} />
              <Button onClick={close}>{t('shared.done')}</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>
                {t('shared.cancel')}
              </Button>
              <Button variant="danger" onClick={reset} loading={pending}>
                {t('client.reset.confirm')}
              </Button>
            </>
          )
        }
      >
        {password ? (
          <p
            dir="ltr"
            data-testid="reset-password"
            className="select-all border-[1.5px] border-rule-strong bg-paper-2 px-4 py-3 text-center text-2xl font-bold tracking-wide"
          >
            {password}
          </p>
        ) : error ? (
          <Flash tone="error">{error}</Flash>
        ) : null}
      </Dialog>
    </>
  );
}
