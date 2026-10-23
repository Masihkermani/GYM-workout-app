'use client';

import { createContext, useContext, useId, type AriaAttributes, type ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';

export interface FieldControl {
  id: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldControl | null>(null);

/** Read the surrounding <Field>'s id / aria wiring (null outside a Field). */
export function useFieldControl(): FieldControl | null {
  return useContext(FieldContext);
}

interface ControlAria {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: AriaAttributes['aria-invalid'];
  'aria-required'?: AriaAttributes['aria-required'];
}

/**
 * Merge a control's own id / aria props with the wiring from the surrounding <Field>.
 * Every input primitive calls this so labels, hints and errors are always connected.
 */
export function useControlAria(props: ControlAria): ControlAria {
  const field = useFieldControl();
  const describedBy = [props['aria-describedby'], field?.describedBy].filter(Boolean).join(' ') || undefined;
  return {
    id: props.id ?? field?.id,
    'aria-describedby': describedBy,
    'aria-invalid': props['aria-invalid'] ?? (field?.invalid ? true : undefined),
    'aria-required': props['aria-required'] ?? (field?.required ? true : undefined),
  };
}

export interface FieldProps {
  label: ReactNode;
  /** Helper text under the control. */
  hint?: ReactNode;
  /** Error text under the control; announced politely when it appears. */
  error?: ReactNode;
  /** Marks the field as optional in the label ("optional" / «اختیاری»). */
  optional?: boolean;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + hint + error, wired with htmlFor / aria-describedby / aria-invalid.
 * Place exactly one control (Input, PhoneInput, PasswordInput, NumberInput, Select, Textarea) inside.
 */
export function Field({ label, hint, error, optional, required, className, children }: FieldProps) {
  const t = useTranslations('common');
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col', className)}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between gap-3 text-sm font-semibold text-ink">
        <span>{label}</span>
        {optional ? <span className="text-xs font-normal text-ink-3">{t('field.optional')}</span> : null}
      </label>
      <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error), required: Boolean(required) }}>
        {children}
      </FieldContext.Provider>
      {hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
      {/* The live region is always mounted so a newly appearing error is announced. */}
      <div id={errorId} aria-live="polite">
        {error ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-danger">
            <CircleAlert className="mt-[0.2em] size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
