import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

export type FlashTone = 'info' | 'success' | 'warning' | 'error';

const TONE: Record<FlashTone, { border: string; Icon: typeof Info }> = {
  info: { border: 'border-s-plate-blue', Icon: Info },
  success: { border: 'border-s-plate-green', Icon: CircleCheck },
  warning: { border: 'border-s-plate-yellow', Icon: TriangleAlert },
  error: { border: 'border-s-danger', Icon: CircleAlert },
};

export interface FlashProps {
  tone?: FlashTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * Inline message (form-level error, saved confirmation). Errors use role="alert" so they are
 * announced immediately; the rest use role="status". The icon and tone border back up the words.
 */
export function Flash({ tone = 'info', title, children, className }: FlashProps) {
  const { border, Icon } = TONE[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 border-[1.5px] border-s-4 border-rule-strong bg-card px-4 py-3 text-ink',
        border,
        className,
      )}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', tone === 'error' && 'text-danger')} aria-hidden="true" />
      <div className="min-w-0 text-sm">
        {title ? <p className="font-bold">{title}</p> : null}
        {children ? <div className={title ? 'mt-0.5 text-ink-2' : undefined}>{children}</div> : null}
      </div>
    </div>
  );
}
