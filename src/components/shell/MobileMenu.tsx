'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet } from '@/components/ui/Sheet';
import { usePathname } from '@/i18n/navigation';

/** Menu button + sheet for the coach panel on small screens. Closes itself when the route changes. */
export function MobileMenu({ title, children }: { title: string; children: ReactNode }) {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('nav.menu')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="-me-2 flex size-11 items-center justify-center rounded-[var(--r)] text-ink tx hover:bg-paper-2"
      >
        <Menu className="size-6" aria-hidden="true" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title={title}>
        {children}
      </Sheet>
    </>
  );
}
