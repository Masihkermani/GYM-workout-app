import type { ComponentProps } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Booking-flow action buttons whose colours the shared Button has no variant for.
 *
 *   confirm  plate-blue: the coach's Confirm (it creates a confirmed booking)
 *   neutral  outline with ink-2 text: Decline, Cancel, No-show. Never plate-red, never --danger;
 *            the danger variant of Button appears only inside a destructive confirmation step.
 *
 * Same shape, 44px minimum target, press and loading behaviour as the shared Button.
 * (Request for a shared file: a `blue` and a `neutral` Button variant would replace this.)
 */
const base =
  'relative inline-flex select-none items-center justify-center gap-2 rounded-[var(--r)] border-[1.5px] ' +
  'font-semibold whitespace-nowrap tx active:translate-y-px min-h-11 px-3 text-sm ' +
  'disabled:pointer-events-none disabled:opacity-45';

const tone = {
  confirm:
    'border-plate-blue bg-plate-blue text-on-blue ' +
    'hover:border-[color-mix(in_srgb,var(--plate-blue)_84%,var(--ink))] hover:bg-[color-mix(in_srgb,var(--plate-blue)_84%,var(--ink))]',
  neutral: 'border-ink-2 bg-transparent text-ink-2 hover:bg-paper-2 hover:text-ink',
} as const;

export interface ActionButtonProps extends Omit<ComponentProps<'button'>, 'className'> {
  tone: keyof typeof tone;
  loading?: boolean;
  fullWidth?: boolean;
}

export function ActionButton({
  tone: t,
  loading = false,
  fullWidth = false,
  disabled,
  type = 'button',
  children,
  ...props
}: ActionButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(base, tone[t], fullWidth && 'w-full')}
      {...props}
    >
      <span className={cn('inline-flex items-center justify-center gap-2', loading && 'opacity-0')}>{children}</span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Loader2 className="spin size-5" />
        </span>
      ) : null}
    </button>
  );
}
