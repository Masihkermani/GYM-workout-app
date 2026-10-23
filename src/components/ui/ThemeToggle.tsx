'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { THEME_COOKIE } from '@/lib/constants';
import { cn } from '@/lib/cn';

type Theme = 'light' | 'dark' | 'system';

function persist(theme: Theme) {
  try {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
      document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
    } else {
      root.setAttribute('data-theme', theme);
      document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
    }
  } catch {
    // cookies or DOM unavailable: the preference simply is not remembered
  }
}

function readTheme(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' || attr === 'dark' ? attr : 'system';
}

function systemIsDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export interface ThemeToggleProps {
  /** `icon` flips light <-> dark; `segmented` offers Auto / Light / Dark. */
  variant?: 'icon' | 'segmented';
  className?: string;
}

/** Theme switch. Writes the `theme` cookie so the server renders the right theme next time. */
export function ThemeToggle({ variant = 'icon', className }: ThemeToggleProps) {
  const t = useTranslations('common');
  const [theme, setTheme] = useState<Theme>('system');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Read the live DOM state after hydration (the server cannot know a system preference).
    setTheme(readTheme());
    setMounted(true);
  }, []);

  const choose = (next: Theme) => {
    setTheme(next);
    persist(next);
  };

  if (variant === 'segmented') {
    const options: { value: Theme; label: string; Icon: typeof Sun }[] = [
      { value: 'system', label: t('theme.system'), Icon: Monitor },
      { value: 'light', label: t('theme.light'), Icon: Sun },
      { value: 'dark', label: t('theme.dark'), Icon: Moon },
    ];
    return (
      <div role="group" aria-label={t('theme.label')} className={cn('inline-flex border-[1.5px] border-ink', className)}>
        {options.map(({ value, label, Icon }) => {
          const active = mounted && theme === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => choose(value)}
              className={cn(
                'flex min-h-11 items-center gap-2 px-3 text-sm font-semibold tx',
                active ? 'bg-ink text-paper' : 'text-ink hover:bg-paper-2',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  const isDark = theme === 'dark' || (theme === 'system' && mounted && systemIsDark());
  return (
    <button
      type="button"
      aria-label={t('theme.label')}
      title={isDark ? t('theme.toLight') : t('theme.toDark')}
      aria-pressed={mounted ? isDark : undefined}
      onClick={() => choose(isDark ? 'light' : 'dark')}
      className={cn(
        'flex size-11 items-center justify-center rounded-[var(--r)] text-ink tx hover:bg-paper-2',
        className,
      )}
    >
      {/* both icons render; CSS shows the right one so there is no flash before hydration */}
      <Sun className="theme-sun size-5" aria-hidden="true" />
      <Moon className="theme-moon size-5" aria-hidden="true" />
    </button>
  );
}
