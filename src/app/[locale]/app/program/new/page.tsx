import { setRequestLocale } from 'next-intl/server';
import { PlaceholderPage } from '@/components/shell/PlaceholderPage';
import { requireUser } from '@/lib/auth';

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireUser(locale);
  return <PlaceholderPage page="programNew" />;
}
