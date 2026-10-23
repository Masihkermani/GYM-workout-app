import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Showcase } from '@/components/styleguide/Showcase';
import { LocaleSwitch } from '@/components/ui/LocaleSwitch';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

export const metadata: Metadata = { title: 'Styleguide', robots: { index: false, follow: false } };

/** Dev-only: every primitive in both themes. 404s in production builds. */
export default async function StyleguidePage({ params }: { params: Promise<{ locale: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="page-x py-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-expanded">Styleguide</h1>
        <div className="flex items-center gap-1">
          <LocaleSwitch variant="button" />
          <ThemeToggle variant="segmented" />
        </div>
      </header>
      <div className="grid gap-6 xl:grid-cols-2">
        <div data-theme="light" className="theme-scope min-w-0 border-[1.5px] border-rule-strong p-4 md:p-6">
          <p className="label-caps mb-6 text-ink-2">Light</p>
          <Showcase />
        </div>
        <div data-theme="dark" className="theme-scope min-w-0 border-[1.5px] border-rule-strong p-4 md:p-6">
          <p className="label-caps mb-6 text-ink-2">Dark</p>
          <Showcase />
        </div>
      </div>
    </div>
  );
}
