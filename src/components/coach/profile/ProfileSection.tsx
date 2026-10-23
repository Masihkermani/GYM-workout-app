import type { ReactNode } from 'react';

/** A ruled card on /app/me: heavy rule under the title strip, content below. */
export function ProfileSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-[1.5px] border-rule-strong bg-card">
      <div className="border-b-[1.5px] border-rule-strong px-4 py-3">
        <h2 className="text-lg font-bold">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-2">{description}</p> : null}
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}
