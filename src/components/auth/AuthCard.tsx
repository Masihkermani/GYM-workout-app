import type { ReactNode } from 'react';

/**
 * The narrow ruled "card" (the clipboard card a coach hands a client): 1.5px ink edge, a header
 * strip with a heavy rule under it, a hairline above the footer. Rules live inside the card only.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section aria-labelledby="auth-title" className="border-[1.5px] border-rule-strong bg-card">
      <div className="border-b-[1.5px] border-rule-strong px-5 py-4">
        <h1 id="auth-title" className="text-2xl font-expanded">
          {title}
        </h1>
        {subtitle ? <p className="mt-1 text-base text-ink-2">{subtitle}</p> : null}
      </div>
      <div className="px-5 py-5">{children}</div>
      {footer ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 border-t border-rule px-5 py-3 text-sm text-ink-2">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
