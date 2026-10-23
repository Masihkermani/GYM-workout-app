import type { Metadata } from 'next';
import { Users } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AddClientSheet } from '@/components/coach/AddClientSheet';
import { ClientsTable } from '@/components/coach/ClientsTable';
import { ClientsToolbar } from '@/components/coach/ClientsToolbar';
import { PageHeader } from '@/components/coach/PageHeader';
import {
  CLIENT_SORTS,
  listClients,
  type ClientSort,
  type ClientStatusFilter,
  type SortDir,
} from '@/components/coach/queries';
import { EmptyState } from '@/components/ui/EmptyState';
import { requireCoach } from '@/lib/auth';
import { getCoachSettings } from '@/lib/settings';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'coach' });
  return { title: t('clients.title'), robots: { index: false } };
}

export default async function CoachClientsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireCoach(locale);

  const sp = await searchParams;
  const q = (first(sp.q) ?? '').slice(0, 80);
  const status = pick<ClientStatusFilter>(first(sp.status), ['all', 'active', 'inactive'], 'all');
  const sort = pick<ClientSort>(first(sp.sort), CLIENT_SORTS, 'name');
  const dir = pick<SortDir>(first(sp.dir), ['asc', 'desc'], sort === 'last' ? 'desc' : 'asc');

  const [t, settings] = await Promise.all([getTranslations('coach'), getCoachSettings()]);
  const { rows, counts } = await listClients({ q, status, sort, dir, locale });

  return (
    <div className="page-x flex flex-col gap-6 py-6 md:py-10">
      <PageHeader title={t('clients.title')} description={t('clients.subtitle')} actions={<AddClientSheet />} />

      {counts.all === 0 ? (
        <EmptyState icon={Users} title={t('clients.empty.title')} description={t('clients.empty.body')} />
      ) : (
        <>
          <ClientsToolbar q={q} status={status} sort={sort} dir={dir} counts={counts} />
          {rows.length === 0 ? (
            <EmptyState icon={Users} title={t('clients.noResults.title')} description={t('clients.noResults.body')} />
          ) : (
            <ClientsTable
              rows={rows}
              locale={locale}
              timeZone={settings.timezone}
              q={q}
              status={status}
              sort={sort}
              dir={dir}
            />
          )}
        </>
      )}
    </div>
  );
}
