import { expect, test, type Page } from '@playwright/test';

// Seeded dev credentials (prisma/seed.ts).
const CLIENT = { phone: '09120000001', password: 'client-pass-1234' };

const PERSIAN_DIGITS = /[۰-۹]/;
const LATIN_DIGITS = /[0-9]/;

test.describe('landing page', () => {
  test('fa: RTL, Persian digits, the coach name set huge, the three sections', async ({ page }) => {
    await page.goto('/fa');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    // the coach name is the h1 and is set big (the brief asks for "very large")
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toBeVisible();
    await expect(h1).not.toHaveText('');
    const size = await h1.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(44);

    // one sentence in the coach's voice (Persian register: «تو»)
    await expect(page.getByText('هر جا اعداد درجا زدند', { exact: false })).toBeVisible();

    // How it works: three ruled lines with real, Persian-digit numbers
    const steps = page.getByTestId('how-it-works').locator('> li');
    await expect(steps).toHaveCount(3);
    await expect(steps.nth(1)).toContainText(PERSIAN_DIGITS); // "تا ۲۴ ساعت پیش از جلسه"
    await expect(steps.nth(0).locator('h3')).toContainText('یک ساعت انتخاب کن');

    // hours come from the availability rows, formatted for the locale
    const hours = page.getByRole('table');
    await expect(hours).toBeVisible();
    await expect(hours).toContainText(PERSIAN_DIGITS);
    await expect(hours).not.toContainText(LATIN_DIGITS);
    await expect(hours).toContainText('۰۷:۰۰');
    await expect(hours).toContainText('تعطیل'); // Friday is off in the seed

    // the signature training card, rendered with sample data
    await expect(page.getByRole('article')).toBeVisible();
    // the footer carries the language switch
    await expect(page.getByRole('contentinfo').getByRole('link', { name: /English|تغییر زبان/ })).toBeVisible();
  });

  test('en: LTR, Latin digits, hours as a ledger', async ({ page }) => {
    await page.goto('/en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('I write the program, you log every set', { exact: false })).toBeVisible();
    await expect(page.getByTestId('how-it-works').locator('> li')).toHaveCount(3);

    const hours = page.getByRole('table');
    await expect(hours).toContainText('07:00–11:00');
    await expect(hours).toContainText('Closed');
    await expect(hours).not.toContainText(PERSIAN_DIGITS);
  });

  test('the footer language switch keeps the page and flips direction', async ({ page }) => {
    await page.goto('/fa');
    await page.getByRole('contentinfo').getByRole('link', { name: /English|تغییر زبان/ }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('metadata is per locale: title, description, og and hreflang', async ({ page }) => {
    await page.goto('/fa');
    await expect(page).toHaveTitle(/رزرو جلسه و ثبت تمرین/);
    await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /ساعت‌های آزاد این هفته/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /رزرو جلسه/);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'fa_IR');
    await expect(page.locator('link[rel=alternate][hreflang=en]')).toHaveCount(1);

    await page.goto('/en');
    await expect(page).toHaveTitle(/book a session, log every set/);
    await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'en_GB');
  });

  test('visitors see a login link, signed-in clients see "Open your log" instead', async ({ page }) => {
    await page.goto('/en');
    await expect(page.getByRole('banner').getByRole('link', { name: 'Log in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open your log' })).toHaveCount(0);

    await login(page, 'en', CLIENT.phone, CLIENT.password);
    await page.goto('/en');
    const door = page.getByRole('banner').getByRole('link', { name: 'Open your log' });
    await expect(door).toBeVisible();
    await expect(page.getByRole('link', { name: 'Log in' })).toHaveCount(0);
    await door.click();
    await expect(page).toHaveURL(/\/en\/app$/);
  });

  test('fits a 390px phone without sideways scrolling, in both languages', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const locale of ['fa', 'en']) {
      await page.goto(`/${locale}`);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${locale} has horizontal overflow`).toBeLessThanOrEqual(0);
    }
  });
});

async function login(page: Page, locale: 'fa' | 'en', phone: string, password: string) {
  await page.goto(`/${locale}/login`);
  await page.locator('input[name=phone]').fill(phone);
  await page.locator('input[name=password]').fill(password);
  await page.locator('button[type=submit]').click();
  // the dev server compiles /app the first time it is opened, which can take a while
  await expect(page).toHaveURL(new RegExp(`/${locale}/(app|coach)$`), { timeout: 60_000 });
}
