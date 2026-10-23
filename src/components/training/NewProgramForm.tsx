'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useRouter } from '@/i18n/navigation';
import { defaultDayTitle } from '@/lib/training/day-title';
import { createProgramAction } from '@/server/training';

/** First step of a new program: just a name. It creates the program with one empty day and opens the builder. */
export function NewProgramForm({ viewer, clientId }: { viewer: 'coach' | 'client'; clientId?: string }) {
  const t = useTranslations('training');
  const locale = useLocale();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!title.trim()) {
      setError(t('builder.titleRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await createProgramAction({ title, clientId: clientId ?? null, dayTitle: defaultDayTitle(1, locale) });
      if (r.ok) {
        router.push(viewer === 'coach' ? `/coach/clients/${clientId}/programs/${r.id}` : `/app/program/${r.id}/edit`);
        return;
      }
      setError(t(`errors.${r.error}`));
    } catch {
      setError(t('errors.generic'));
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-md flex-col gap-4">
      <Field label={t('builder.programTitle')} error={error ?? undefined} hint={t('builder.newHint')}>
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          maxLength={80}
          autoComplete="off"
          enterKeyHint="done"
          autoFocus
        />
      </Field>
      <div>
        <Button type="submit" variant="primary" size="lg" loading={busy}>
          {t('builder.create')}
        </Button>
      </div>
    </form>
  );
}
