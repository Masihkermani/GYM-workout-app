'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Flash } from '@/components/ui/Flash';
import { usePathname, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { setLocalePreferenceAction } from '@/server/coach';

const OPTIONS = [
  { id: 'fa', name: 'فارسی', lang: 'fa' },
  { id: 'en', name: 'English', lang: 'en' },
] as const;

/** Saves the language to the account (User.locale), then opens the same page in that language. */
export function LanguagePicker() {
  const t = useTranslations('coach');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const choose = (next: 'fa' | 'en') => {
    setError(false);
    startTransition(async () => {
      const result = await setLocalePreferenceAction(next);
      if (!result.ok) {
        setError(true);
        return;
      }
      if (next !== locale) router.replace(pathname, { locale: next });
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={t('profile.language.label')} className="grid grid-cols-2 border-[1.5px] border-ink">
        {OPTIONS.map((o) => {
          const active = o.id === locale;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={active}
              lang={o.lang}
              disabled={pending}
              onClick={() => choose(o.id)}
              className={cn(
                'flex min-h-12 items-center justify-center gap-2 px-4 text-base font-semibold tx disabled:opacity-60',
                active ? 'bg-ink text-paper' : 'text-ink hover:bg-paper-2',
              )}
            >
              {active ? <Check className="size-4" aria-hidden="true" /> : null}
              {o.name}
            </button>
          );
        })}
      </div>
      {error ? <Flash tone="error">{t('errors.generic')}</Flash> : null}
    </div>
  );
}
