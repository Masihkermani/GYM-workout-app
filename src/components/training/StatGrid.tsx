import type { ReactNode } from 'react';

/** Four-ish big numbers in a ruled box (sets, volume, records, time). Hairlines come from a 1px gap over a rule-coloured ground. */
export function StatGrid({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-px border-[1.5px] border-rule-strong bg-rule sm:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="flex flex-col gap-1 bg-card px-4 py-3">
          <dt className="label-caps text-ink-2">{s.label}</dt>
          <dd className="num text-2xl leading-tight sm:text-3xl">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
