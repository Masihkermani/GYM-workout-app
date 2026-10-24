/**
 * The coach's public profile the demo seed writes (names, bio, location). Kept in its own module so
 * the e2e landing-page spec asserts against exactly what the seed wrote instead of a copy of it.
 */
export const DEMO_COACH_PROFILE = {
  coachName: 'Coach Arash Kamali',
  coachNameFa: 'مربی آرش کمالی',
  bioEn:
    "I've coached strength for ten years, mostly with people who are just starting out or coming back " +
    'from an injury: good movement first, heavier weight after. Sessions are one-to-one in my small ' +
    'studio in Saadat Abad, so only one person trains with me at a time.',
  bioFa:
    'ده سال است مربی قدرتی‌ام. بیشتر با کسانی کار می‌کنم که تازه شروع کرده‌اند یا بعد از آسیب‌دیدگی به ' +
    'تمرین برمی‌گردند؛ اول حرکت درست، بعد وزنه‌ی بیشتر. جلسه‌ها در استودیوی کوچکی در سعادت‌آباد است ' +
    'و هر ساعت فقط یک نفر پیش من تمرین می‌کند.',
  locationEn: 'Private training studio, Saadat Abad, Tehran. Ground floor, entrance from the side street.',
  locationFa: 'استودیوی خصوصی تمرین، سعادت‌آباد، تهران. طبقه‌ی همکف، ورودی از کوچه.',
} as const;
