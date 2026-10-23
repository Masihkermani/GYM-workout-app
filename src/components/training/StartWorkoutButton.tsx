'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';
import { startWorkoutAction } from '@/server/training';

/**
 * Starts (or resumes) a workout and opens the live logger. A button, never a link: creating a row
 * must not happen on a GET (prefetch, crawlers, a back-navigation).
 */
export function StartWorkoutButton({
  dayId,
  bookingId,
  clientId,
  label,
  variant = 'ink',
  size = 'lg',
  fullWidth,
  icon = true,
}: {
  dayId?: string | null;
  bookingId?: string | null;
  /** Coach starting a workout for a client. */
  clientId?: string | null;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  icon?: boolean;
}) {
  const t = useTranslations('training');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await startWorkoutAction({ dayId: dayId ?? null, bookingId: bookingId ?? null, clientId: clientId ?? null });
      if (result.ok) {
        router.push(`/app/workout/${result.id}`);
        return; // keep the spinner while the next page loads
      }
      setError(t(`errors.${result.error}`));
    } catch {
      setError(t('errors.generic'));
    }
    setBusy(false);
  }

  return (
    <div className={fullWidth ? 'w-full' : undefined}>
      <Button variant={variant} size={size} fullWidth={fullWidth} loading={busy} onClick={start}>
        {icon ? <Play className="size-5 rtl:-scale-x-100" aria-hidden="true" /> : null}
        {label}
      </Button>
      <p role="alert" className="mt-2 text-sm font-medium text-danger empty:hidden">
        {error}
      </p>
    </div>
  );
}
