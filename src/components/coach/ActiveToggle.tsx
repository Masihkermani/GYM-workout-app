'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/Toast';
import { setClientActiveAction } from '@/server/coach';
import { Switch } from './Switch';

/** Active / inactive switch. Turning a client off asks first: they are signed out and cannot log in. */
export function ActiveToggle({ clientId, clientName, active: initial }: { clientId: string; clientName: string; active: boolean }) {
  const t = useTranslations('coach');
  const { toast } = useToast();
  const [active, setActive] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const apply = (next: boolean) => {
    setActive(next);
    startTransition(async () => {
      const result = await setClientActiveAction(clientId, next);
      if (!result.ok) {
        setActive(!next);
        toast({ tone: 'error', message: t(`errors.${result.error}`) });
        return;
      }
      toast({ tone: 'success', message: next ? t('client.activeOn', { name: clientName }) : t('client.activeOff', { name: clientName }) });
    });
  };

  return (
    <>
      <Switch
        label={t('client.activeLabel')}
        hint={active ? t('client.activeHintOn') : t('client.activeHintOff')}
        checked={active}
        disabled={pending}
        onChange={(e) => {
          if (e.target.checked) apply(true);
          else setConfirming(true);
        }}
      />
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        role="alertdialog"
        title={t('client.deactivate.title', { name: clientName })}
        description={t('client.deactivate.body')}
        actions={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t('shared.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setConfirming(false);
                apply(false);
              }}
            >
              {t('client.deactivate.confirm')}
            </Button>
          </>
        }
      />
    </>
  );
}
