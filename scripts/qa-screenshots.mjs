#!/usr/bin/env node
/**
 * Visual QA: screenshots of key pages in both themes and two widths.
 *   BASE_URL=http://localhost:3100 node scripts/qa-screenshots.mjs [outDir]
 * Uses the preinstalled Chromium (never run `playwright install`). Logs in as the seeded coach
 * (dev credentials from the README) for pages behind auth.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const base = process.env.BASE_URL ?? 'http://localhost:3100';
const out = process.argv[2] ?? '.qa/phase1';
const executablePath = process.env.PW_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
mkdirSync(out, { recursive: true });

const widths = [
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 900 },
];
const themes = ['light', 'dark'];

const pages = [
  { name: 'fa-login', path: '/fa/login' },
  { name: 'en-login', path: '/en/login' },
  { name: 'fa-register', path: '/fa/register' },
  { name: 'fa-styleguide', path: '/fa/styleguide', fullPage: true },
  { name: 'en-styleguide', path: '/en/styleguide', fullPage: true },
  { name: 'fa-coach', path: '/fa/coach', auth: true },
  { name: 'fa-app', path: '/fa/app', auth: true },
];

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });

async function login(context) {
  const page = await context.newPage();
  await page.goto(`${base}/fa/login`);
  await page.fill('input[name=phone]', '۰۹۱۲۰۰۰۰۰۰۰');
  await page.fill('input[name=password]', 'coach-pass-1234');
  await Promise.all([page.waitForURL(/\/fa\/coach/), page.click('button[type=submit]')]);
  await page.close();
}

/** Open the sheet, the dialog and a toast on the styleguide and capture each (light scope on top). */
async function overlays(page, theme, width) {
  const scope = page.locator(`.theme-scope[data-theme=${theme}]`);
  await scope.getByRole('button', { name: 'باز کردن برگه' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `fa-styleguide-sheet-${theme}-${width}.png`) });
  await page.keyboard.press('Escape');
  await scope.getByRole('button', { name: 'باز کردن گفتگو' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `fa-styleguide-dialog-${theme}-${width}.png`) });
  await page.keyboard.press('Escape');
  await scope.getByRole('button', { name: 'نمایش اعلان', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(out, `fa-styleguide-toast-${theme}-${width}.png`) });
}

for (const w of widths) {
  for (const theme of themes) {
    const context = await browser.newContext({
      viewport: { width: w.width, height: w.height },
      colorScheme: theme,
      reducedMotion: 'reduce',
    });
    await context.addCookies([{ name: 'theme', value: theme, url: base }]);
    let loggedIn = false;
    for (const p of pages) {
      if (p.auth && !loggedIn) {
        await login(context);
        loggedIn = true;
      }
      const page = await context.newPage();
      const res = await page.goto(base + p.path, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const file = join(out, `${p.name}-${theme}-${w.name}.png`);
      await page.screenshot({ path: file, fullPage: Boolean(p.fullPage) });
      console.log(`${res?.status()} ${p.path} -> ${file}`);
      if (p.name === 'fa-styleguide') await overlays(page, theme, w.name);
      await page.close();
    }
    await context.close();
  }
}
await browser.close();
