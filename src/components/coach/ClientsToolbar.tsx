'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Input } from '@/components/ui/Input';
import { Link, useRouter } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

export interface ClientsToolbarProps {
  q: string;
  status: 'all' | 'active' | 'inactive';
  sort: string;
  dir: string;
  counts: { all: number; active: number; inactive: number };
}

function hrefFor(base: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `/coach/clients?${qs}` : '/coach/clients';
}

/** Search box (live, debounced; Enter also submits) and the All / Active / Inactive filter. */
export function ClientsToolbar({ q, status, sort, dir, counts }: ClientsToolbarProps) {
  const t = useTranslations('coach');
  const locale = useLocale();
  const router = useRouter();
  const [value, setValue] = useState(q);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const go = (next: string) => {
    startTransition(() => {
      router.replace(hrefFor({ q: next.trim(), status: status === 'all' ? '' : status, sort, dir }), { scroll: false });
    });
  };

  const onChange = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go(next), 250);
  };

  const filters: { id: ClientsToolbarProps['status']; label: string; count: number }[] = [
    { id: 'all', label: t('clients.filter.all'), count: counts.all },
    { id: 'active', label: t('clients.filter.active'), count: counts.active },
    { id: 'inactive', label: t('clients.filter.inactive'), count: counts.inactive },
  ];

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (timer.current) clearTimeout(timer.current);
          go(value);
        }}
        className="relative w-full md:max-w-sm"
      >
        <label htmlFor="clients-search" className="sr-only">
          {t('clients.search.label')}
        </label>
        <Search
          className="pointer-events-none absolute inset-y-0 start-3 my-auto size-5 text-ink-2"
          aria-hidden="true"
        />
        <Input
          id="clients-search"
          name="q"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('clients.search.placeholder')}
          className="ps-10 pe-10 [&::-webkit-search-cancel-button]:hidden"
        />
        {pending ? (
          <Loader2 className="spin pointer-events-none absolute inset-y-0 end-3 my-auto size-5 text-ink-2" aria-hidden="true" />
        ) : value ? (
          <button
            type="button"
            aria-label={t('clients.search.clear')}
            onClick={() => {
              setValue('');
              go('');
            }}
            className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-[var(--r)] text-ink-2 tx hover:text-ink"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        ) : null}
      </form>

      <nav aria-label={t('clients.filter.label')}>
        <ul className="flex border-[1.5px] border-ink">
          {filters.map((f) => {
            const active = f.id === status;
            return (
              <li key={f.id} className="flex-1 md:flex-none">
                <Link
                  href={hrefFor({ q, status: f.id === 'all' ? '' : f.id, sort, dir })}
                  aria-current={active ? 'true' : undefined}
                  scroll={false}
                  className={cn(
                    'flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold tx',
                    active ? 'bg-ink text-paper' : 'text-ink hover:bg-paper-2',
                  )}
                >
                  {f.label}
                  <span className="num text-xs opacity-80">{formatNumber(f.count, locale, { grouping: false })}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
