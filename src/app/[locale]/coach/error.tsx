'use client';

import { ErrorView } from '@/components/shell/ErrorView';

/** A page inside the coach area failed: the navigation stays, only the page is replaced. */
export default function CoachAreaError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView {...props} framed />;
}
