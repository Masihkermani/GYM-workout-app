import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SwitchProps extends Omit<ComponentProps<'input'>, 'type' | 'role' | 'className' | 'children'> {
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
}

/**
 * On/off setting as a native checkbox with role="switch": keyboard, form submission and screen
 * readers all come for free. Square track and knob (the system has no pills), 44px minimum target.
 */
export function Switch({ label, hint, className, id, ...props }: SwitchProps) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const hintId = `${uid}-hint`;
  return (
    <label className={cn('group flex min-h-11 cursor-pointer items-start gap-3 py-1.5', className)}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        className="peer sr-only"
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-[var(--r)] border-[1.5px] border-ink bg-card tx',
          'after:absolute after:top-[2px] after:start-[2px] after:size-4 after:rounded-[1px] after:bg-ink after:tx',
          'peer-checked:bg-ink peer-checked:after:translate-x-5 peer-checked:after:bg-paper rtl:peer-checked:after:-translate-x-5',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink',
          'peer-disabled:opacity-45',
        )}
      />
      <span className="min-w-0">
        <span id={labelId} className="block text-base font-semibold text-ink">
          {label}
        </span>
        {hint ? (
          <span id={hintId} className="mt-0.5 block text-sm text-ink-2">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}
