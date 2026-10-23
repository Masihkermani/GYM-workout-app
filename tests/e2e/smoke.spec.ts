import { expect, test } from '@playwright/test';

test('/ redirects to the default Persian locale', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/fa$/);
});

test('fa is RTL, en is LTR', async ({ page }) => {
  await page.goto('/fa/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.goto('/en/login');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('language switch keeps the page and the ?next= query', async ({ page }) => {
  await page.goto('/fa/login?next=%2Ffa%2Fapp%2Fbook');
  await page.getByRole('link', { name: /English|تغییر زبان/ }).click();
  await expect(page).toHaveURL(/\/en\/login\?next=/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('anonymous visitors are sent to login with ?next=', async ({ page }) => {
  await page.goto('/fa/app/book');
  await expect(page).toHaveURL(/\/fa\/login\?next=%2Ffa%2Fapp%2Fbook/);
  await page.goto('/en/coach');
  await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Fcoach/);
});

test('unknown paths render the localized 404', async ({ page }) => {
  const res = await page.goto('/fa/no/such/page');
  expect(res?.status()).toBe(404);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('theme cookie selects the theme', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'theme', value: 'dark', url: baseURL! }]);
  await page.goto('/en/login');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
