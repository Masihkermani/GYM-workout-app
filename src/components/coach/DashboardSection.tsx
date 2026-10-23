import type { ReactNode } from 'react';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

/** A dashboard block: a labelled section with an optional "see all" link at the end edge. */
export function DashboardSection({
  title,
  href,
  linkLabel,
  className,
  children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-3', className)}>
      <SectionLabel
        action={
          href && linkLabel ? (
            <Link href={href} className="inline-flex min-h-11 items-center px-1 font-semibold underline underline-offset-4">
              {linkLabel}
            </Link>
          ) : undefined
        }
      >
        {title}
      </SectionLabel>
      {children}
    </section>
  );
}
