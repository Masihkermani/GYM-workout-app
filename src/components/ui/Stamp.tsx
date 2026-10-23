import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

/** Booking statuses plus the two non-booking stamps the UI uses (an open slot, a personal record). */
export type StampStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW' | 'OPEN' | 'PR';

const TONE: Record<StampStatus, string> = {
  // yellow never carries coloured text: ink on a faint yellow wash
  PENDING: 'border-plate-yellow bg-plate-yellow/20 text-ink',
  CONFIRMED: 'border-plate-blue text-stamp-blue',
  COMPLETED: 'border-plate-green text-stamp-green',
  CANCELLED: 'border-ink-3 text-ink-2',
  NO_SHOW: 'border-danger text-danger',
  OPEN: 'border-dashed border-ink-2 text-ink-2',
  PR: 'border-plate-red text-stamp-red',
};

const LABEL_KEY = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  NO_SHOW: 'noShow',
  OPEN: 'open',
  PR: 'record',
} as const satisfies Record<StampStatus, string>;

const SIZE = {
  sm: 'px-1.5 py-px',
  md: 'px-2.5 py-0.5',
  lg: 'px-4 py-1.5 text-base',
} as const;

export interface StampProps {
  status: StampStatus;
  /**
   * Play the landing animation (scale 1.12 -> 1, settles at -3 degrees, 180ms). Use ONLY on the
   * booking-confirmation screen; everywhere else the stamp is static and unrotated.
   */
  land?: boolean;
  size?: keyof typeof SIZE;
  /** Override the default status words. */
  label?: string;
  className?: string;
}

/**
 * Status as a rubber-stamp label: bordered in the status colour and always carrying words, so
 * status is never conveyed by colour alone. Uppercase in English, plain bold in Persian.
 */
export function Stamp({ status, land = false, size = 'md', label, className }: StampProps) {
  const t = useTranslations('common');
  return (
    <span
      className={cn(
        'label-caps inline-block whitespace-nowrap rounded-[var(--r)] border-[1.5px] leading-tight',
        TONE[status],
        SIZE[size],
        land && 'stamp-land',
        className,
      )}
    >
      {label ?? t(`status.${LABEL_KEY[status]}`)}
    </span>
  );
}
