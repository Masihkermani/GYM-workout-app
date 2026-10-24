/**
 * Shared by the accessibility spec (tests/e2e/a11y.spec.ts) and the final screenshot run
 * (scripts/qa-final.ts): the route map of docs/ARCHITECTURE.md with the ids it needs resolved from
 * the seeded database, the personas to sign in as, and the open states of the key sheets.
 *
 * Needs a migrated, seeded database (`npm run db:seed`) and DATABASE_URL pointing at it. It plants two
 * things and removes them again in `cleanup()`: an open workout with two logged sets for the seeded
 * client 3 (so the live logger, the edit-set sheet and the coach's session page have something to show)
 * and a throwaway client with nothing in it (the empty states, and a booking sheet that is never at the
 * three-booking cap).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { hashPassword } from '../../../src/lib/password';

export const LANGS = ['fa', 'en'] as const;
export const THEMES = ['light', 'dark'] as const;
export const WIDTHS = [390, 1280] as const;
export type Lang = (typeof LANGS)[number];
export type Theme = (typeof THEMES)[number];
export type Width = (typeof WIDTHS)[number];

export const VIEWPORT: Record<Width, { width: number; height: number }> = {
  390: { width: 390, height: 844 },
  1280: { width: 1280, height: 900 },
};

export type Persona = 'public' | 'client' | 'empty' | 'coach';

/** Seeded accounts (prisma/seed.ts). Client 3 has the richest data: a coach program, one of her own, 6+ weeks of history. */
export const ACCOUNTS = {
  coach: { phone: '09120000000', password: 'coach-pass-1234' },
  client: { phone: '09120000003', password: 'client-pass-1234' },
  empty: { phone: '09139999990', password: 'qa-empty-pass-1234', name: 'QA Empty Client' },
} as const;

export interface QaIds {
  /** the seeded client 3 */
  clientId: string;
  /** a program the coach wrote for her */
  coachProgramId: string;
  /** the first day of that program */
  programDayId: string;
  /** a program she wrote herself (the only kind a client may edit) */
  ownProgramId: string;
  /** one of her finished workouts (history detail) */
  historyWorkoutId: string;
  /** the open workout planted by createFixture */
  openWorkoutId: string;
}

export interface RouteDef {
  /** file-name friendly, unique */
  slug: string;
  persona: Persona;
  /** path after `/<lang>` ('' is the landing page) */
  path: (ids: QaIds) => string;
  /** the status the page answers with (default 200) */
  status?: number;
}

export const ROUTES: RouteDef[] = [
  // public
  { slug: 'landing', persona: 'public', path: () => '' },
  { slug: 'login', persona: 'public', path: () => '/login' },
  { slug: 'register', persona: 'public', path: () => '/register' },
  { slug: 'not-found', persona: 'public', path: () => '/no/such/page', status: 404 },
  // client (a client with data)
  { slug: 'app-today', persona: 'client', path: () => '/app' },
  { slug: 'app-book', persona: 'client', path: () => '/app/book' },
  { slug: 'app-bookings', persona: 'client', path: () => '/app/bookings' },
  { slug: 'app-program', persona: 'client', path: () => '/app/program' },
  { slug: 'app-program-new', persona: 'client', path: () => '/app/program/new' },
  { slug: 'app-program-edit', persona: 'client', path: (i) => `/app/program/${i.ownProgramId}/edit` },
  { slug: 'app-workout-new', persona: 'client', path: (i) => `/app/workout/new?day=${i.programDayId}` },
  { slug: 'app-workout', persona: 'client', path: (i) => `/app/workout/${i.openWorkoutId}` },
  { slug: 'app-history', persona: 'client', path: () => '/app/history' },
  { slug: 'app-history-detail', persona: 'client', path: (i) => `/app/history/${i.historyWorkoutId}` },
  { slug: 'app-progress', persona: 'client', path: () => '/app/progress' },
  { slug: 'app-me', persona: 'client', path: () => '/app/me' },
  // client with nothing yet: the empty states
  { slug: 'app-today-empty', persona: 'empty', path: () => '/app' },
  { slug: 'app-bookings-empty', persona: 'empty', path: () => '/app/bookings' },
  { slug: 'app-program-empty', persona: 'empty', path: () => '/app/program' },
  { slug: 'app-history-empty', persona: 'empty', path: () => '/app/history' },
  { slug: 'app-progress-empty', persona: 'empty', path: () => '/app/progress' },
  // coach
  { slug: 'coach-dashboard', persona: 'coach', path: () => '/coach' },
  { slug: 'coach-schedule', persona: 'coach', path: () => '/coach/schedule' },
  { slug: 'coach-clients', persona: 'coach', path: () => '/coach/clients' },
  { slug: 'coach-client', persona: 'coach', path: (i) => `/coach/clients/${i.clientId}` },
  { slug: 'coach-program-new', persona: 'coach', path: (i) => `/coach/clients/${i.clientId}/programs/new` },
  { slug: 'coach-program', persona: 'coach', path: (i) => `/coach/clients/${i.clientId}/programs/${i.coachProgramId}` },
  { slug: 'coach-session', persona: 'coach', path: (i) => `/coach/clients/${i.clientId}/workouts/${i.openWorkoutId}` },
  { slug: 'coach-exercises', persona: 'coach', path: () => '/coach/exercises' },
  { slug: 'coach-settings', persona: 'coach', path: () => '/coach/settings' },
];

// ------------------------------------------------------------------------------------ messages

type Json = { [k: string]: Json | string };
const catalogues = new Map<string, Json>();

/** A string from messages/<lang>/<namespace>.json by its dotted key (so the specs never hard-code copy). */
export function msg(lang: Lang, namespace: string, key: string): string {
  const file = join(process.cwd(), 'messages', lang, `${namespace}.json`);
  let root = catalogues.get(file);
  if (!root) {
    root = JSON.parse(readFileSync(file, 'utf8')) as Json;
    catalogues.set(file, root);
  }
  let node: Json | string | undefined = root;
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  if (typeof node !== 'string') throw new Error(`no message ${namespace}:${key} in ${lang}`);
  return node;
}

/** The text before the first ICU placeholder ("Edit set {n}" -> "Edit set "), as a case-sensitive prefix regex. */
export function msgPrefixRe(lang: Lang, namespace: string, key: string): RegExp {
  const prefix = msg(lang, namespace, key).split('{')[0];
  return new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
}

// -------------------------------------------------------------------------------------- fixture

export interface QaFixture {
  ids: QaIds;
  /** removes what createFixture planted */
  cleanup(): Promise<void>;
}

export async function createFixture(prisma: PrismaClient): Promise<QaFixture> {
  const [coach, client] = await Promise.all([
    prisma.user.findUnique({ where: { phone: '+989120000000' } }),
    prisma.user.findUnique({ where: { phone: '+989120000003' } }),
  ]);
  if (!coach || !client)
    throw new Error('the seeded coach / client 3 are missing: run `npm run db:seed` on this database first');

  const coachProgram = await prisma.program.findFirst({
    where: { clientId: client.id, authorId: coach.id, active: true },
    orderBy: { createdAt: 'asc' },
    include: { days: { orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' }, take: 1 } } } },
  });
  const ownProgram = await prisma.program.findFirst({ where: { clientId: client.id, authorId: client.id } });
  const history = await prisma.workoutLog.findFirst({
    where: { clientId: client.id, finishedAt: { not: null } },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  });
  const day = coachProgram?.days[0];
  const item = day?.items[0];
  if (!coachProgram || !ownProgram || !history || !day || !item)
    throw new Error('client 3 is missing seeded programs or workouts');

  // an open workout with two logged sets on the first exercise of the first day
  await prisma.workoutLog.deleteMany({ where: { clientId: client.id, finishedAt: null } });
  const open = await prisma.workoutLog.create({
    data: {
      clientId: client.id,
      programDayId: day.id,
      startedAt: new Date(Date.now() - 20 * 60_000),
      sets: {
        create: [1, 2].map((setIndex) => ({ exerciseId: item.exerciseId, setIndex, reps: 8, weightKg: 40 })),
      },
    },
    select: { id: true },
  });

  // a client with no bookings, programs or workouts
  await prisma.user.deleteMany({ where: { phone: toE164(ACCOUNTS.empty.phone) } });
  await prisma.user.create({
    data: {
      phone: toE164(ACCOUNTS.empty.phone),
      name: ACCOUNTS.empty.name,
      passwordHash: await hashPassword(ACCOUNTS.empty.password),
      role: 'CLIENT',
      locale: 'fa',
    },
  });

  return {
    ids: {
      clientId: client.id,
      coachProgramId: coachProgram.id,
      programDayId: day.id,
      ownProgramId: ownProgram.id,
      historyWorkoutId: history.id,
      openWorkoutId: open.id,
    },
    async cleanup() {
      await prisma.workoutLog.deleteMany({ where: { id: open.id } });
      await prisma.user.deleteMany({ where: { phone: toE164(ACCOUNTS.empty.phone) } });
    },
  };
}

const toE164 = (national: string) => `+98${national.slice(1)}`;

// ---------------------------------------------------------------------------------- sessions

export type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

/** Sign in once per persona and keep the cookies; `public` has none. */
export async function signInStates(
  browser: Browser,
  baseURL: string,
): Promise<Record<Persona, StorageState | undefined>> {
  const states: Record<Persona, StorageState | undefined> = {
    public: undefined,
    client: undefined,
    empty: undefined,
    coach: undefined,
  };
  for (const persona of ['client', 'empty', 'coach'] as const) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto('/fa/login');
    await page.locator('input[name=phone]').fill(ACCOUNTS[persona].phone);
    await page.locator('input[name=password]').fill(ACCOUNTS[persona].password);
    await page.locator('button[type=submit]').click();
    await page.waitForURL(/\/fa\/(app|coach)$/, { timeout: 60_000 });
    states[persona] = await context.storageState();
    await context.close();
  }
  return states;
}

/** A browser context for one persona in one theme and width (reduced motion: nothing is mid-animation when we look). */
export async function openContext(
  browser: Browser,
  baseURL: string,
  states: Record<Persona, StorageState | undefined>,
  persona: Persona,
  theme: Theme,
  width: Width,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL,
    storageState: states[persona],
    viewport: VIEWPORT[width],
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
  await context.addCookies([{ name: 'theme', value: theme, url: baseURL }]);
  return context;
}

/** Wait until the page has settled: network idle, web fonts decoded. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
}

// ------------------------------------------------------------------------------------- sheets

export interface SheetDef {
  slug: string;
  persona: Persona;
  /** Navigate and open the sheet; resolves when its dialog is visible. */
  open(page: Page, lang: Lang, ids: QaIds): Promise<void>;
}

const dialog = (page: Page) => page.getByRole('dialog');

/** Find an open timetable slot (any week, either layout) and press it. */
async function pressAnOpenSlot(page: Page, lang: Lang): Promise<void> {
  const open = page.locator('button[data-tone=open]:visible');
  const days = page.getByRole('group', { name: msg(lang, 'booking', 'week.days') }).getByRole('button');
  for (let week = 0; week < 3; week++) {
    // phone layout: a strip of days, one day's slots at a time
    const dayCount = (await days.count()) > 0 && (await days.first().isVisible()) ? await days.count() : 0;
    for (let d = 0; d < Math.max(dayCount, 1); d++) {
      if (dayCount > 0) await days.nth(d).click();
      if ((await open.count()) > 0) {
        await open.first().click();
        return;
      }
    }
    await page.getByRole('button', { name: msg(lang, 'booking', 'week.next') }).click();
    await page.waitForLoadState('networkidle');
  }
  throw new Error('no open slot found in the next three weeks');
}

export const SHEETS: SheetDef[] = [
  {
    slug: 'sheet-booking-confirm',
    persona: 'empty',
    async open(page, lang) {
      await page.goto(`/${lang}/app/book`);
      await settle(page);
      await pressAnOpenSlot(page, lang);
      await dialog(page).waitFor();
    },
  },
  {
    slug: 'sheet-add-client',
    persona: 'coach',
    async open(page, lang) {
      await page.goto(`/${lang}/coach/clients`);
      await settle(page);
      await page.getByRole('button', { name: msg(lang, 'coach', 'clients.add.button') }).click();
      await dialog(page).waitFor();
    },
  },
  {
    slug: 'sheet-exercise-picker',
    persona: 'client',
    async open(page, lang, ids) {
      await page.goto(`/${lang}/app/workout/${ids.openWorkoutId}`);
      await settle(page);
      await page.getByRole('button', { name: msg(lang, 'training', 'strip.add') }).click();
      await dialog(page).waitFor();
      // the library list is fetched when the picker opens
      await settle(page);
    },
  },
  {
    slug: 'sheet-edit-set',
    persona: 'client',
    async open(page, lang, ids) {
      await page.goto(`/${lang}/app/workout/${ids.openWorkoutId}`);
      await settle(page);
      await page
        .getByRole('button', { name: msgPrefixRe(lang, 'training', 'logger.editSet') })
        .first()
        .click();
      await dialog(page).waitFor();
    },
  },
];
