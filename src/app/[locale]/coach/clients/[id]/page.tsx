import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ClipboardPlus } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ClientBookingsPanel } from '@/components/booking/ClientBookingsPanel';
import { ActiveToggle } from '@/components/coach/ActiveToggle';
import { ClientStatus } from '@/components/coach/ClientStatus';
import { CoachNotes } from '@/components/coach/CoachNotes';
import { EditClientSheet } from '@/components/coach/EditClientSheet';
import { getClientDetail } from '@/components/coach/queries';
import { ResetPassword } from '@/components/coach/ResetPassword';
import { ClientTrainingPanel } from '@/components/training/ClientTrainingPanel';
import { StartSessionButton } from '@/components/training/StartSessionButton';
import { Avatar } from '@/components/ui/Avatar';
import { ButtonLink } from '@/components/ui/Button';
import { DirIcon } from '@/components/ui/DirIcon';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Link } from '@/i18n/navigation';
import { requireCoach } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { getCoachSettings } from '@/lib/settings';
import { getLinkableBooking } from '@/lib/training/queries';

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'coach' });
  // Generic on purpose: metadata runs before the auth check and must not reveal a client's name.
  return { title: t('client.metaTitle'), robots: { index: false } };
}

export default async function CoachClientPage({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireCoach(locale);

  const [client, settings, t] = await Promise.all([
    getClientDetail(id),
    getCoachSettings(),
    getTranslations('coach'),
  ]);
  if (!client) notFound();
  // a confirmed session of this client around now: the workout started here links to it
  const bookingId = client.active ? await getLinkableBooking(client.id) : null;

  const facts: { label: string; value: ReactNode }[] = [
    {
      label: t('client.fact.phone'),
      value: (
        <a href={`tel:${client.phone}`} dir="ltr" className="inline-block min-h-11 py-2 font-semibold underline-offset-4 hover:underline">
          {formatPhone(client.phone, locale)}
        </a>
      ),
    },
    {
      label: t('client.fact.since'),
      value: formatDate(client.createdAt, locale, { timeZone: settings.timezone, style: 'medium' }),
    },
    {
      label: t('client.fact.language'),
      value: client.locale === 'en' ? 'English' : 'فارسی',
    },
    {
      label: t('client.fact.goal'),
      value: client.goal ? (
        <span dir="auto" className="block whitespace-pre-line">
          {client.goal}
        </span>
      ) : (
        <span className="text-ink-3">{t('client.fact.noGoal')}</span>
      ),
    },
  ];

  return (
    <div className="page-x flex flex-col gap-10 py-6 md:py-10">
      <div className="flex flex-col gap-4">
        <Link
          href="/coach/clients"
          className="-ms-2 inline-flex min-h-11 w-fit items-center gap-1.5 px-2 text-sm font-semibold text-ink-2 tx hover:text-ink"
        >
          <DirIcon name="chevron-back" className="size-4" />
          {t('client.back')}
        </Link>

        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar name={client.name} size="lg" />
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold font-expanded md:text-3xl">{client.name}</h1>
              <div className="mt-1">
                <ClientStatus active={client.active} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {client.active ? (
              <StartSessionButton bookingId={bookingId} clientId={client.id} locale={locale} variant="primary" />
            ) : null}
            <ButtonLink href={`/coach/clients/${client.id}/programs/new`} variant="outline">
              <ClipboardPlus className="size-5" aria-hidden="true" />
              {t('client.newProgram')}
            </ButtonLink>
            <ResetPassword clientId={client.id} clientName={client.name} />
          </div>
        </header>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <section className="flex flex-col gap-4 lg:col-span-5">
          <SectionLabel action={<EditClientSheet clientId={client.id} name={client.name} phone={client.phone} />}>
            {t('client.details')}
          </SectionLabel>
          <div className="border-[1.5px] border-rule-strong bg-card">
            <dl>
              {facts.map((f) => (
                <div
                  key={f.label}
                  className="grid grid-cols-[7rem_1fr] items-baseline gap-3 border-b border-rule px-4 py-2 last:border-b-0"
                >
                  <dt className="text-sm font-semibold text-ink-2">{f.label}</dt>
                  <dd className="min-w-0 text-base">{f.value}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t-[1.5px] border-rule-strong px-4 py-1">
              <ActiveToggle clientId={client.id} clientName={client.name} active={client.active} />
            </div>
          </div>
        </section>

        <div className="lg:col-span-7">
          <CoachNotes clientId={client.id} initial={client.coachNotes ?? ''} timeZone={settings.timezone} />
        </div>
      </div>

      {/* Feature panels from the booking and training agents; the signatures are fixed. */}
      <ClientBookingsPanel clientId={client.id} locale={locale} />
      <ClientTrainingPanel clientId={client.id} locale={locale} />
    </div>
  );
}
