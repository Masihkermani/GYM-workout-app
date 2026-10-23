import { useTranslations } from 'next-intl';
import { Stamp } from '@/components/ui/Stamp';

/** Active / inactive as a stamp: green outline for a client who can log in, grey for one who cannot. */
export function ClientStatus({ active, size = 'md' }: { active: boolean; size?: 'sm' | 'md' }) {
  const t = useTranslations('coach');
  return <Stamp status={active ? 'COMPLETED' : 'CANCELLED'} size={size} label={t(active ? 'status.active' : 'status.inactive')} />;
}
