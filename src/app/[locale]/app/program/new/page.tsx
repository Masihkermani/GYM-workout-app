import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { requireUser } from '@/lib/auth';
import { NewProgramForm } from '@/components/training/NewProgramForm';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'training' });
  return { title: t('program.new') };
}

export default async function NewProgramPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale);
  const t = await getTranslations({ locale, namespace: 'training' });
  return (
    <div className="page-x flex flex-col gap-6 py-8 md:py-12">
      <SectionLabel as="h1">{t('program.new')}</SectionLabel>
      <p className="max-w-prose text-base text-ink-2">{t('program.newIntro')}</p>
      <NewProgramForm viewer="client" />
    </div>
  );
}
