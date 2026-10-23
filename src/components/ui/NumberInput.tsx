'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { localizeNumberString, normalizeNumberString, parseDecimal } from '@/lib/digits';
import { useControlAria } from './Field';

export interface NumberInputProps {
  /** Controlled value. `null` = empty. Omit for uncontrolled use with `defaultValue`. */
  value?: number | null;
  defaultValue?: number | null;
  onChange?: (value: number | null) => void;
  min?: number;
  max?: number;
  /** Stepper increment. 2.5 for kilograms, 1 for reps. */
  step?: number;
  /** Max digits after the separator. Defaults to the decimals in `step` (at least 2 for fractional steps). */
  decimals?: number;
  /** Unit shown after the number ("kg"). */
  unit?: string;
  /** `md` = 44px controls; `xl` = giant 56px steppers and a 72px condensed number for the set logger. */
  size?: 'md' | 'xl';
  /** Submitted as a hidden input holding the normalised Latin value, whatever digits were typed. */
  name?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

const decimalsOf = (n: number) => {
  const s = String(n);
  const i = s.indexOf('.');
  return i === -1 ? 0 : s.length - i - 1;
};

const clamp = (n: number, min?: number, max?: number) => {
  let out = n;
  if (min != null && out < min) out = min;
  if (max != null && out > max) out = max;
  return out;
};

const roundTo = (n: number, places: number) => Number(n.toFixed(places));

const PARTIAL = /^-?\d*\.?\d*$/;

/**
 * Number field with +/- steppers. Accepts Persian, Arabic-Indic and Latin digits and ٫ , . as the
 * decimal separator; shows the number in the locale's digits. Base control of the set logger.
 */
export function NumberInput(props: NumberInputProps) {
  const {
    value,
    defaultValue = null,
    onChange,
    min,
    max,
    step = 1,
    unit,
    size = 'md',
    name,
    disabled,
    placeholder,
    className,
  } = props;

  const t = useTranslations('common');
  const locale = useLocale();
  const aria = useControlAria(props);

  const stepDecimals = decimalsOf(step);
  const maxDecimals = props.decimals ?? (stepDecimals > 0 ? Math.max(stepDecimals, 2) : 0);
  const stepperPlaces = Math.max(stepDecimals, 0);

  const controlled = value !== undefined;
  const [inner, setInner] = useState<number | null>(defaultValue);
  const current = controlled ? value : inner;

  const show = (n: number | null) => (n == null ? '' : localizeNumberString(String(n), locale));
  const [text, setText] = useState(() => show(current));
  const [prev, setPrev] = useState(current);
  // Re-sync the visible text only when the value changed from outside (stepper, "same as last set"),
  // never while the user is mid-way through typing something like "30." that parses to the same value.
  if (current !== prev) {
    setPrev(current);
    if (parseDecimal(text) !== current) setText(show(current));
  }

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdRepeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const didHold = useRef(false);
  const latest = useRef(current);
  latest.current = current;

  const commit = (next: number | null) => {
    if (!controlled) setInner(next);
    onChange?.(next);
  };

  const bump = (dir: 1 | -1) => {
    const base = latest.current ?? (dir === 1 ? (min ?? 0) - step : (min ?? 0) + step);
    const next = clamp(roundTo(base + dir * step, stepperPlaces), min, max);
    latest.current = next;
    commit(next);
    setText(show(next));
  };

  const stopHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (holdRepeat.current) clearInterval(holdRepeat.current);
    holdTimer.current = null;
    holdRepeat.current = null;
  };

  const startHold = (dir: 1 | -1) => {
    didHold.current = false;
    stopHold();
    holdTimer.current = setTimeout(() => {
      didHold.current = true;
      bump(dir);
      holdRepeat.current = setInterval(() => bump(dir), 90);
    }, 450);
  };

  const onType = (raw: string) => {
    const norm = normalizeNumberString(raw);
    if (!PARTIAL.test(norm)) return; // ignore letters and stray symbols
    const dot = norm.indexOf('.');
    if (dot !== -1 && (maxDecimals === 0 || norm.length - dot - 1 > maxDecimals)) return;
    if (min != null && min >= 0 && norm.startsWith('-')) return;
    setText(localizeNumberString(norm, locale));
    const n = parseDecimal(norm);
    commit(n);
  };

  const onBlur = () => {
    const n = parseDecimal(text);
    if (n == null) {
      setText(show(current));
      return;
    }
    const fixed = clamp(roundTo(n, Math.max(maxDecimals, 0)), min, max);
    if (fixed !== n) commit(fixed);
    setText(show(fixed));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      bump(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      bump(-1);
    }
  };

  const xl = size === 'xl';
  const invalid = aria['aria-invalid'] === true || aria['aria-invalid'] === 'true';
  const atMin = min != null && current != null && current <= min;
  const atMax = max != null && current != null && current >= max;

  const stepButton = (dir: 1 | -1) => {
    const isDisabled = disabled || (dir === 1 ? atMax : atMin);
    return (
      <button
        type="button"
        disabled={isDisabled}
        aria-label={dir === 1 ? t('number.increase') : t('number.decrease')}
        onClick={() => {
          if (didHold.current) {
            didHold.current = false;
            return;
          }
          bump(dir);
        }}
        onPointerDown={() => startHold(dir)}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          'flex shrink-0 select-none items-center justify-center rounded-[var(--r)] border-[1.5px] border-ink bg-card text-ink',
          'tx hover:bg-paper-2 active:translate-y-px disabled:pointer-events-none disabled:opacity-40',
          xl ? 'w-16 self-stretch' : 'w-11 self-stretch',
        )}
      >
        {dir === 1 ? (
          <Plus className={xl ? 'size-7' : 'size-5'} aria-hidden="true" />
        ) : (
          <Minus className={xl ? 'size-7' : 'size-5'} aria-hidden="true" />
        )}
      </button>
    );
  };

  return (
    // The numeric axis is always LTR (digits read LTR): minus on the low side, plus on the high side,
    // in both languages.
    <div dir="ltr" className={cn('flex items-stretch gap-2', className)}>
      {stepButton(-1)}
      <div
        className={cn(
          'focus-wrap relative flex min-w-0 flex-1 flex-col justify-center rounded-[var(--r)] border-[1.5px] bg-card tx',
          xl ? 'min-h-[7rem]' : 'min-h-11',
          invalid ? 'border-danger' : 'border-ink-3 hover:border-ink-2 has-[input:focus]:border-ink',
          disabled && 'opacity-50',
        )}
      >
        <input
          id={aria.id}
          aria-describedby={aria['aria-describedby']}
          aria-invalid={aria['aria-invalid']}
          aria-required={aria['aria-required']}
          aria-label={props['aria-label']}
          role="spinbutton"
          aria-valuenow={current ?? undefined}
          aria-valuemin={min}
          aria-valuemax={max}
          type="text"
          inputMode={maxDecimals > 0 ? 'decimal' : 'numeric'}
          autoComplete="off"
          enterKeyHint="done"
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          onChange={(e) => onType(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className={cn(
            'focus-bare w-full min-w-0 bg-transparent px-2 text-center text-ink placeholder:text-ink-3',
            xl ? 'num h-[5rem] text-5xl sm:text-6xl' : 'h-11 text-lg font-semibold',
            unit && !xl && 'pe-12 ps-12',
          )}
        />
        {unit ? (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none text-ink-2',
              xl
                ? 'pb-2 text-center text-sm font-semibold'
                : 'absolute inset-y-0 end-3 flex items-center text-sm font-semibold',
            )}
          >
            {unit}
          </span>
        ) : null}
      </div>
      {stepButton(1)}
      {name ? <input type="hidden" name={name} value={current == null ? '' : String(current)} /> : null}
    </div>
  );
}
