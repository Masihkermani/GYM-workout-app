import { LogOut } from 'lucide-react';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { logoutAction } from '@/server/auth';

/** POSTs to the logout server action (session deleted server-side, cookies cleared). */
export function LogoutButton({ locale, label, className }: { locale: string; label: string; className?: string }) {
  return (
    <form action={logoutAction} className={className}>
      <input type="hidden" name="locale" value={locale} />
      {/* start-aligned like the user row and the language row above it: same 8px inset (no border, so it is not shifted) and 32px leading slot */}
      <SubmitButton variant="ghost" size="sm" fullWidth className="justify-start border-0 px-2">
        <span className="flex size-8 shrink-0 items-center justify-center">
          <LogOut className="size-5 rtl:-scale-x-100" aria-hidden="true" />
        </span>
        {label}
      </SubmitButton>
    </form>
  );
}
