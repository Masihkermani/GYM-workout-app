import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Title row of a coach page: h1 on the start side, page-level actions on the end side. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold font-expanded md:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-prose text-base text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
