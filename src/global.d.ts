import type common from '../messages/fa/common.json';
import type auth from '../messages/fa/auth.json';
import type landing from '../messages/fa/landing.json';
import type booking from '../messages/fa/booking.json';
import type training from '../messages/fa/training.json';
import type coach from '../messages/fa/coach.json';

// Typed message keys: a typo in t('...') fails `npm run typecheck`.
// fa is the source of truth for the shape; `npm run i18n:check` keeps en identical.
// (The locale itself is deliberately NOT typed: route params arrive as plain strings.)
declare module 'next-intl' {
  interface AppConfig {
    Messages: {
      common: typeof common;
      auth: typeof auth;
      landing: typeof landing;
      booking: typeof booking;
      training: typeof training;
      coach: typeof coach;
    };
  }
}
