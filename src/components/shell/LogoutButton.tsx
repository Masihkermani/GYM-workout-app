import { LogOut } from 'lucide-react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { logoutAction } from '@/server/auth';

/** POSTs to the logout server action (session deleted server-side, cookies cleared). */
export function LogoutButton({ locale, label, className }: { locale: string; label: string; className?: string }) {
  return (
    <form action={logoutAction} className={className}>
      <input type="hidden" name="locale" value={locale} />
      <SubmitButton variant="ghost" size="sm" fullWidth>
        <LogOut className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        {label}
      </SubmitButton>
    </form>
  );
}
