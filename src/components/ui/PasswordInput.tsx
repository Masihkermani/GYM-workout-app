'use client';

import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/cn';
import { Input } from './Input';

export type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type' | 'dir'>;

/** Password field with a show / hide toggle. Pass autoComplete="current-password" or "new-password". */
export function PasswordInput({ className, autoComplete = 'current-password', ...props }: PasswordInputProps) {
  const t = useTranslations('common');
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        dir="ltr"
        autoComplete={autoComplete}
        autoCapitalize="off"
        spellCheck={false}
        className={cn('pe-12 rtl:text-end', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? t('password.hide') : t('password.show')}
        className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-[var(--r)] text-ink-2 tx hover:text-ink"
      >
        {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
      </button>
    </div>
  );
}
