import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** One call to action (a Button or ButtonLink). */
  action?: ReactNode;
  className?: string;
}

/** Nothing here yet: a dashed ledger box with one line of explanation and at most one action. No illustrations. */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 border-[1.5px] border-dashed border-ink-3 px-6 py-10 text-center',
        className,
      )}
    >
      {Icon ? <Icon className="size-8 text-ink-3" aria-hidden="true" /> : null}
      <p className="text-lg font-bold text-ink">{title}</p>
      {description ? <p className="max-w-prose text-base text-ink-2">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
