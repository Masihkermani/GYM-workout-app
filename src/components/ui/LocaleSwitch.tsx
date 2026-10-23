'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/cn';

export interface LocaleSwitchProps {
  className?: string;
  /**
   * `inline` = text link style; `button` = outlined 44px target; `rail` = a row of the shell's
   * account block (icon in the same 32px leading slot as the avatar and the logout icon, so the three
   * rows line up at the start edge in both directions).
   */
  variant?: 'inline' | 'button' | 'rail';
}

function SwitchLink({ query, className, variant = 'inline' }: LocaleSwitchProps & { query: string }) {
  const t = useTranslations('common');
  const locale = useLocale();
  const pathname = usePathname(); // path without the locale prefix: switching keeps the page
  const other = locale === 'fa' ? 'en' : 'fa';
  const href = query ? `${pathname}?${query}` : pathname;

  return (
    <Link
      href={href}
      locale={other}
      hrefLang={other}
      lang={other}
      aria-label={t('locale.switchLabel')}
      scroll={false}
      className={cn(
        'inline-flex min-h-11 items-center gap-2 rounded-[var(--r)] px-3 text-sm font-semibold text-ink tx hover:bg-paper-2',
        variant === 'button' && 'border-[1.5px] border-ink',
        variant === 'rail' && 'px-2',
        className,
      )}
    >
      {variant === 'rail' ? (
        <span className="flex size-8 shrink-0 items-center justify-center">
          <Languages className="size-5" aria-hidden="true" />
        </span>
      ) : (
        <Languages className="size-5" aria-hidden="true" />
      )}
      <span>{t('locale.switchName')}</span>
    </Link>
  );
}

function WithQuery(props: LocaleSwitchProps) {
  const params = useSearchParams();
  return <SwitchLink {...props} query={params.toString()} />;
}

/** Switches fa <-> en on the same page (path and query string are kept, e.g. login?next=). */
export function LocaleSwitch(props: LocaleSwitchProps) {
  return (
    <Suspense fallback={<SwitchLink {...props} query="" />}>
      <WithQuery {...props} />
    </Suspense>
  );
}
