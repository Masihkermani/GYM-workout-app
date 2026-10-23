import type { ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

export interface SectionLabelProps {
  children: ReactNode;
  /**
   * Only for a REAL sequence (step 2 of 3, program day, queue position). Never decorative:
   * a plain section has no number.
   */
  index?: number;
  /** Heading level to render. Page titles use h1. */
  as?: 'h1' | 'h2' | 'h3';
  /** Optional control at the inline-end (a link, a button). */
  action?: ReactNode;
  className?: string;
}

/**
 * Section heading: a small label (uppercase + tracked in English, bold in Persian) sitting on a
 * short hairline. Sections are separated by spacing, not by full-width rules. An `index` renders as
 * `2 · Label` in English and `۲ | برچسب` (hairline divider, no dot) in Persian.
 */
export function SectionLabel({ children, index, as: Tag = 'h2', action, className }: SectionLabelProps) {
  const locale = useLocale();
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div>
        <Tag className="label-caps text-ink-2">
          {index != null ? (
            <>
              <span className="num">{formatNumber(index, locale, { grouping: false })}</span>
              {locale === 'fa' ? (
                // DESIGN.md rule 9: never a middle dot next to Persian digits (the zero «۰» is a dot too).
                // A hairline divider with logical margins separates the number from the label instead.
                <span aria-hidden="true" className="mx-2 inline-block h-3 w-px translate-y-0.5 bg-ink-3" />
              ) : (
                <span aria-hidden="true"> · </span>
              )}
            </>
          ) : null}
          {children}
        </Tag>
        <span aria-hidden="true" className="mt-1.5 block h-px w-8 bg-ink" />
      </div>
      {action ? <div className="shrink-0 text-sm">{action}</div> : null}
    </div>
  );
}
