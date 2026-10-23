import { setRequestLocale } from 'next-intl/server';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';
import { requireCoach } from '@/lib/auth';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireCoach(locale);
  return <PlaceholderPage page="exercises" />;
}
