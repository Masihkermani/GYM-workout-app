'use client';

import { ErrorView } from '@/components/shell/ErrorView';

/** Last-resort boundary for every page without a nearer one (landing, auth, styleguide). */
export default function LocaleError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView {...props} />;
}
