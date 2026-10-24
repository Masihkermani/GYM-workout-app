/**
 * Final visual QA: a screenshot of every route of the route map (docs/ARCHITECTURE.md) and of the
 * open key sheets, in fa and en, light and dark, at 390 and 1280 px, signed in as the right role.
 *
 *   DATABASE_URL=... BASE_URL=http://localhost:3100 npx tsx scripts/qa-final.ts [outDir]
 *   (or: npm run qa:final)
 *
 * Run it against a production server (`next build && next start -p 3100`) on a freshly seeded
 * database. Files are named <route>-<lang>-<theme>-<width>.png in outDir (default .qa/final), plus a
 * REPORT.txt with the HTTP status, console errors and horizontal overflow of every page.
 * Uses the preinstalled Chromium (never run `playwright install`). Plants and removes the same two
 * fixtures as tests/e2e/a11y.spec.ts (see tests/e2e/support/qa.ts).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { chromium, type Page } from '@playwright/test';
import {
  createFixture,
  LANGS,
  openContext,
  ROUTES,
  settle,
  SHEETS,
  signInStates,
  THEMES,
  WIDTHS,
  type Persona,
} from '../tests/e2e/support/qa';

const base = process.env.BASE_URL ?? 'http://localhost:3100';
const out = process.argv[2] ?? '.qa/final';
const executablePath = process.env.PW_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
mkdirSync(out, { recursive: true });

const report: string[] = [];
let shots = 0;

/** Console errors, failed same-origin requests and page errors seen while `fn` runs. */
async function watch(page: Page, fn: () => Promise<void>): Promise<string[]> {
  const problems: string[] = [];
  const onConsole = (m: { type(): string; text(): string }) => {
    if (m.type() === 'error') problems.push(`console.error: ${m.text().slice(0, 200)}`);
  };
  const onPageError = (e: Error) => problems.push(`pageerror: ${e.message.slice(0, 200)}`);
  const onResponse = (r: { status(): number; url(): string }) => {
    if (r.status() >= 400 && r.url().startsWith(base)) problems.push(`${r.status()} ${r.url().slice(base.length)}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  try {
    await fn();
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  }
  return problems;
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function main() {
  const prisma = new PrismaClient();
  const fixture = await createFixture(prisma);
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  try {
    const states = await signInStates(browser, base);
    for (const lang of LANGS) {
      for (const theme of THEMES) {
        for (const width of WIDTHS) {
          const contexts = new Map<Persona, Awaited<ReturnType<typeof openContext>>>();
          const contextFor = async (persona: Persona) => {
            let c = contexts.get(persona);
            if (!c) {
              c = await openContext(browser, base, states, persona, theme, width);
              contexts.set(persona, c);
            }
            return c;
          };

          for (const route of ROUTES) {
            const page = await (await contextFor(route.persona)).newPage();
            const file = `${route.slug}-${lang}-${theme}-${width}.png`;
            const url = `/${lang}${route.path(fixture.ids)}`;
            let status = 0;
            const problems = await watch(page, async () => {
              status = (await page.goto(url))?.status() ?? 0;
              await settle(page);
              await page.screenshot({ path: join(out, file), fullPage: true });
            });
            const wide = await overflow(page);
            shots += 1;
            const expected = route.status ?? 200;
            const flags = [
              status !== expected ? `STATUS ${status} (expected ${expected})` : '',
              wide > 0 ? `OVERFLOW ${wide}px` : '',
              ...problems.filter(
                (p) => !(expected === 404 && p.startsWith('404 ')) && !/Failed to load resource.*404/.test(p),
              ),
            ].filter(Boolean);
            report.push(
              `${flags.length ? 'FLAG' : 'ok  '} ${file}  ${url}${flags.length ? '  ' + flags.join(' | ') : ''}`,
            );
            await page.close();
          }

          for (const sheet of SHEETS) {
            const page = await (await contextFor(sheet.persona)).newPage();
            const file = `${sheet.slug}-${lang}-${theme}-${width}.png`;
            const problems = await watch(page, async () => {
              await sheet.open(page, lang, fixture.ids);
              await settle(page);
              await page.screenshot({ path: join(out, file) });
            });
            shots += 1;
            report.push(
              `${problems.length ? 'FLAG' : 'ok  '} ${file}${problems.length ? '  ' + problems.join(' | ') : ''}`,
            );
            await page.close();
          }

          await Promise.all([...contexts.values()].map((c) => c.close()));
          console.log(`${lang} ${theme} ${width}: done (${shots} screenshots so far)`);
        }
      }
    }
  } finally {
    await browser.close();
    await fixture.cleanup();
    await prisma.$disconnect();
  }

  writeFileSync(join(out, 'REPORT.txt'), report.join('\n') + '\n');
  const flagged = report.filter((l) => l.startsWith('FLAG'));
  console.log(`${shots} screenshots in ${out}; ${flagged.length} flagged`);
  for (const l of flagged) console.log(l);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
