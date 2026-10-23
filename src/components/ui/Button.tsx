import type { ComponentProps, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'ink' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const base =
  'relative inline-flex select-none items-center justify-center gap-2 rounded-[var(--r)] border-[1.5px] ' +
  'font-semibold whitespace-nowrap tx active:translate-y-px ' +
  'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45';

const variants: Record<ButtonVariant, string> = {
  // plate-red: the one primary action per screen
  primary: 'border-plate-red bg-plate-red text-on-red hover:border-plate-red-hover hover:bg-plate-red-hover',
  ink: 'border-ink bg-ink text-paper hover:border-ink-hover hover:bg-ink-hover',
  outline: 'border-ink bg-transparent text-ink hover:bg-paper-2',
  ghost: 'border-transparent bg-transparent text-ink hover:bg-paper-2',
  // destructive is oxblood, deliberately not plate-red
  danger: 'border-danger bg-danger text-on-danger hover:border-danger-hover hover:bg-danger-hover',
};

// Every size keeps a 44px minimum target; lg/xl are for the set logger and primary calls to action.
const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3 text-sm',
  md: 'min-h-11 px-4 text-base',
  lg: 'min-h-14 px-6 text-lg',
  xl: 'min-h-16 px-8 text-xl',
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Class string for anything that should look like a Button (links, summary, label). */
export function buttonClass({ variant = 'primary', size = 'md', fullWidth, className }: ButtonStyleOptions = {}) {
  return cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className);
}

export interface ButtonProps extends Omit<ComponentProps<'button'>, 'className'>, ButtonStyleOptions {
  /** Shows a spinner, disables the button and sets aria-busy. The label keeps its width. */
  loading?: boolean;
}

export function Button({
  variant,
  size,
  fullWidth,
  className,
  loading = false,
  disabled,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, fullWidth, className })}
      {...props}
    >
      <span className={cn('inline-flex items-center justify-center gap-2', loading && 'opacity-0')}>{children}</span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Loader2 className="spin size-5" />
        </span>
      ) : null}
    </button>
  );
}

export interface ButtonLinkProps
  extends Omit<ComponentProps<typeof Link>, 'className' | 'children'>,
    ButtonStyleOptions {
  children?: ReactNode;
}

/** A locale-aware link styled as a Button. */
export function ButtonLink({ variant, size, fullWidth, className, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClass({ variant, size, fullWidth, className })} {...props}>
      {children}
    </Link>
  );
}
