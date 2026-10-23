'use client';

import { useState } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import { updateProgramAction } from '@/server/training';

/** Archive / re-activate one of your own programs (the coach does this from the builder). */
export function ProgramStateButton({ programId, active }: { programId: string; active: boolean }) {
  const t = useTranslations('training');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const r = await updateProgramAction({ programId, active: !active });
      if (r.ok) router.refresh();
      else setError(t(`errors.${r.error}`));
    } catch {
      setError(t('errors.generic'));
    }
    setBusy(false);
  }

  return (
    <div>
      <Button variant="outline" size="sm" loading={busy} onClick={toggle}>
        {active ? <Archive className="size-4" aria-hidden="true" /> : <ArchiveRestore className="size-4" aria-hidden="true" />}
        {active ? t('builder.archive') : t('builder.activate')}
      </Button>
      <p role="alert" className="mt-1 text-sm font-medium text-danger empty:hidden">
        {error}
      </p>
    </div>
  );
}
