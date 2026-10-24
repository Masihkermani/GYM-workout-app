import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROFILE_ERROR_CODES } from '@/components/coach/profile/errors';

/**
 * Guards for the Persian copy decisions in docs/DESIGN.md ("Copy voice"): one name per equipment item,
 * audience twins for shared messages, client-voice profile errors, and the words we retired.
 * Parity of keys and placeholders between fa and en is `npm run i18n:check`.
 */

type Tree = { [key: string]: Tree | string };
const NAMESPACES = ['common', 'auth', 'landing', 'booking', 'training', 'coach'] as const;
const read = (...parts: string[]) => JSON.parse(readFileSync(join(process.cwd(), ...parts), 'utf8')) as unknown;
const messages = (locale: 'fa' | 'en', ns: (typeof NAMESPACES)[number]) => read('messages', locale, `${ns}.json`) as Tree;

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === 'string' ? [[`${prefix}${k}`, v] as [string, string]] : leaves(v, `${prefix}${k}.`),
  );
}
/** `\b` knows only ASCII word characters, so "the word ends here" is spelled with a lookahead. */
const END = '(?![\\u0600-\\u06FF\\u200c])';
const at = (tree: Tree, path: string): string => {
  let node: Tree | string = tree;
  for (const part of path.split('.')) node = (node as Tree)[part];
  if (typeof node !== 'string') throw new Error(`no message ${path}`);
  return node;
};

describe('Persian equipment names (W4)', () => {
  const training = messages('fa', 'training').equipment as Tree;
  const taxonomy = (messages('fa', 'coach').taxonomy as Tree).equipment as Tree;
  const exercisesEn = read('data', 'exercises', 'exercises.en.json') as { id: string; equipment: string }[];
  const exercisesFa = read('data', 'exercises', 'exercises.fa.json') as Record<string, string>;

  it('names every item once: the picker and the library agree', () => {
    const shared = Object.keys(training).filter((k) => k in taxonomy);
    expect(shared.length).toBeGreaterThan(15);
    for (const key of shared) expect(taxonomy[key], key).toBe(training[key]);
  });

  it('uses the word the Persian exercise names use', () => {
    // "body weight" exercises carry no equipment word in their names; the rest must appear in them
    const checked = [
      'cable',
      'sled machine',
      'stability ball',
      'medicine ball',
      'roller',
      'wheel roller',
      'ez barbell',
      'leverage machine',
      'weighted',
      'bosu ball',
      'band',
      'smith machine',
      'trap bar',
      'hammer',
      'stepmill machine',
    ];
    for (const key of checked) {
      const label = (taxonomy[key] ?? training[key]) as string;
      const names = exercisesEn.filter((e) => e.equipment === key).map((e) => exercisesFa[e.id]);
      expect(names.length, key).toBeGreaterThan(0);
      expect(
        names.some((n) => n.includes(label)),
        `${key}: «${label}» is in no exercise name`,
      ).toBe(true);
    }
  });
});

describe('audience twins (shared message, two voices)', () => {
  it.each([
    ['booking', 'errors.notAllowed', 'errors.notAllowedCoach'],
    ['training', 'errors.dailyLimit', 'errors.dailyLimitCoach'],
  ] as const)('%s: %s has a coach twin %s', (ns, client, coach) => {
    const fa = messages('fa', ns);
    expect(at(fa, coach)).not.toBe(at(fa, client));
    // the coach twin speaks «شما», the client message «تو»
    expect(at(fa, coach)).toMatch(new RegExp(`کنید${END}`));
    expect(at(fa, client)).toMatch(new RegExp(`کن${END}`));
    expect(at(messages('en', ns), coach)).toBeTruthy();
  });

  it('the client profile has its own «تو» errors for every code /app/me can show', () => {
    for (const locale of ['fa', 'en'] as const) {
      const profile = (messages(locale, 'coach').profile as Tree).errors as Tree;
      for (const code of PROFILE_ERROR_CODES) expect(typeof profile[code], `${locale} ${code}`).toBe('string');
    }
    const fa = messages('fa', 'coach');
    expect(at(fa, 'profile.errors.generic')).toMatch(new RegExp(`کن${END}`));
    expect(at(fa, 'errors.generic')).toMatch(new RegExp(`کنید${END}`));
    expect(at(fa, 'profile.errors.rateLimited')).not.toBe(at(fa, 'errors.rateLimited'));
  });
});

describe('shared booking and training errors name no addressee', () => {
  const SHARED = [
    ['booking', ['generic', 'invalid', 'forbidden', 'notFound', 'slotTaken', 'slotUnavailable', 'slotPast', 'notStarted']],
    ['training', ['invalid', 'forbidden', 'notFound', 'finished', 'limit', 'generic']],
  ] as const;
  it.each(SHARED)('%s', (ns, keys) => {
    const m = messages('fa', ns);
    for (const key of keys) {
      const text = at(m, `errors.${key}`);
      // a heuristic, not a parser: no imperative or «you» verb in either register, and no pronoun
      expect(text, key).not.toMatch(new RegExp(`(کن|کنید|بزن|بزنید|بگیر|بگیرید|ببر|بساز|بگذار|داری|رسیدی|کرده\u200cای)${END}`));
      expect(text, key).not.toMatch(new RegExp(`(^|[\\s،؛.])(تو|شما)${END}`));
    }
  });
});

describe('Persian typography and glossary', () => {
  const all = NAMESPACES.flatMap((ns) => leaves(messages('fa', ns)).map(([k, v]) => [`${ns}.${k}`, v] as const));

  it('writes digits as Persian digits (ICU selectors such as =0 aside)', () => {
    for (const [key, text] of all) expect(text.replace(/=\d+/g, ''), key).not.toMatch(/[0-9]/);
  });

  it('keeps one word per concept', () => {
    const retired = ['نویسه', 'تاریخچه', 'نوبت', 'تازه', 'کیلوگرم', 'زیادی نزدیک'];
    for (const [key, text] of all) for (const word of retired) expect(text, `${key} uses «${word}»`).not.toContain(word);
  });
});

describe('booking.errors.tooManyBookings names the cap through {max}', () => {
  it('in both languages', () => {
    for (const locale of ['fa', 'en'] as const) expect(at(messages(locale, 'booking'), 'errors.tooManyBookings')).toContain('{max}');
  });
});
