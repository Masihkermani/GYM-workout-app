import { twMerge } from 'tailwind-merge';

type ClassValue = string | number | null | undefined | false | ClassValue[];

function join(values: ClassValue[]): string {
  const out: string[] = [];
  for (const v of values) {
    if (!v && v !== 0) continue;
    if (Array.isArray(v)) {
      const inner = join(v);
      if (inner) out.push(inner);
    } else {
      out.push(String(v));
    }
  }
  return out.join(' ');
}

/**
 * Class-name joiner with Tailwind conflict resolution (tailwind-merge): when two classes set the
 * same property, the LAST one wins, so a component can take a `className` that overrides its own
 * defaults (`buttonClass({ className: 'px-2' })` beats the size's `px-4`).
 */
export function cn(...values: ClassValue[]): string {
  return twMerge(join(values));
}
