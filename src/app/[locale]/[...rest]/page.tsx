import { notFound } from 'next/navigation';

/** Unknown paths under /[locale] render the localized not-found page inside the locale layout. */
export default function CatchAll() {
  notFound();
}
