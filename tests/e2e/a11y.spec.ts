import { PrismaClient } from '@prisma/client';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type BrowserContext } from '@playwright/test';
import {
  createFixture,
  LANGS,
  msg,
  openContext,
  ROUTES,
  settle,
  SHEETS,
  signInStates,
  THEMES,
  WIDTHS,
  type Persona,
  type QaFixture,
  type QaIds,
  type StorageState,
} from './support/qa';

/**
 * Accessibility: axe-core (WCAG 2.0 A + AA, 2.1 AA, 2.2 AA) on every route of the route map
 * (docs/ARCHITECTURE.md) as the right persona, in fa and en, light and dark, at 390 and 1280 px,
 * plus the open state of the key sheets (booking confirm, add client, exercise picker, edit set).
 * Automated checks cover only part of WCAG: keyboard order, focus and screen-reader wording are
 * covered by the interaction specs and by hand.
 *
 * Needs the seeded database and DATABASE_URL (see tests/e2e/support/qa.ts, which plants and removes
 * an open workout and a throwaway empty client).
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

test.describe.configure({ timeout: 90_000 });

const prisma = new PrismaClient();
let fixture: QaFixture;
let states: Record<Persona, StorageState | undefined>;
let baseURL = '';
// filled in beforeAll; the paths of the dynamic routes are resolved from it when each test runs
const ids = {} as QaIds;

test.beforeAll(async ({ browser }, testInfo) => {
  if (!process.env.DATABASE_URL)
    throw new Error('a11y.spec.ts needs DATABASE_URL (the seeded database the server uses)');
  baseURL = String(testInfo.project.use.baseURL);
  fixture = await createFixture(prisma);
  Object.assign(ids, fixture.ids);
  states = await signInStates(browser, baseURL);
});

test.afterAll(async () => {
  await fixture?.cleanup();
  await prisma.$disconnect();
});

type Violation = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number];

function describeViolations(violations: Violation[]): string {
  return violations
    .map((v) => {
      const nodes = v.nodes
        .slice(0, 4)
        .map(
          (n) => `      ${n.target.join(' ')}\n        ${(n.failureSummary ?? '').split('\n').slice(0, 3).join(' | ')}`,
        )
        .join('\n');
      return `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})\n${nodes}`;
    })
    .join('\n');
}

async function expectNoViolations(page: import('@playwright/test').Page) {
  const { violations, incomplete } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  // "Needs review" results: axe cannot compute colour contrast for SVG chart text or for text under the
  // native dialog's backdrop (the token pairs are checked by scripts/contrast-check.mjs), so those are
  // left out. Any other rule that stays incomplete (for example aria-label on a plain div) is a real finding.
  const review = incomplete.filter((i) => i.id !== 'color-contrast');
  const problems = [...violations, ...review];
  expect(problems, `axe violations:\n${describeViolations(problems)}`).toEqual([]);
}

for (const lang of LANGS) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test.describe(`${lang} ${theme} ${width}`, () => {
        // one context per persona for the whole block (sign-in cookies come from beforeAll)
        const contexts = new Map<Persona, BrowserContext>();
        const contextFor = async (browser: import('@playwright/test').Browser, persona: Persona) => {
          let context = contexts.get(persona);
          if (!context) {
            context = await openContext(browser, baseURL, states, persona, theme, width);
            contexts.set(persona, context);
          }
          return context;
        };
        test.afterAll(async () => {
          await Promise.all([...contexts.values()].map((c) => c.close()));
          contexts.clear();
        });

        for (const route of ROUTES) {
          test(`route ${route.slug}`, async ({ browser }) => {
            const page = await (await contextFor(browser, route.persona)).newPage();
            try {
              const response = await page.goto(`/${lang}${route.path(ids)}`);
              expect(response?.status()).toBe(route.status ?? 200);
              if (route.persona !== 'public') expect(page.url()).not.toContain('/login');
              await expect(page.locator('html')).toHaveAttribute('lang', lang);
              await settle(page);
              await expectNoViolations(page);
            } finally {
              await page.close();
            }
          });
        }

        for (const sheet of SHEETS) {
          test(`${sheet.slug}`, async ({ browser }) => {
            const page = await (await contextFor(browser, sheet.persona)).newPage();
            try {
              await sheet.open(page, lang, ids);
              await expect(page.getByRole('dialog')).toBeVisible();
              await settle(page);
              await expectNoViolations(page);
            } finally {
              await page.close();
            }
          });
        }
      });
    }
  }
}

// The house rule (docs/DESIGN.md): every interactive target is at least 44x44. axe only checks 24x24, so
// the wordmark links, which were 35x33 and 31x48, get their own assertion.
test.describe('touch targets on a phone', () => {
  for (const lang of LANGS) {
    for (const [persona, path] of [
      ['coach', '/coach'],
      ['public', '/login'],
      ['public', '/register'],
    ] as const) {
      test(`the wordmark link is at least 44x44: ${persona} ${path} (${lang})`, async ({ browser }) => {
        const context = await openContext(browser, baseURL, states, persona, 'light', 390);
        try {
          const page = await context.newPage();
          await page.goto(`/${lang}${path}`);
          const link = page
            .locator('header')
            .first()
            .getByRole('link', { name: msg(lang, 'common', 'brand.name') });
          await expect(link).toBeVisible();
          const box = (await link.boundingBox())!;
          expect(box.width, 'width').toBeGreaterThanOrEqual(43.5);
          expect(box.height, 'height').toBeGreaterThanOrEqual(43.5);
        } finally {
          await context.close();
        }
      });
    }
  }
});
