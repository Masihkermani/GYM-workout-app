import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';

// Seeded dev credentials (prisma/seed.ts).
const COACH = { phone: '09120000000', password: 'coach-pass-1234' };
const CLIENT = { phone: '09120000001', password: 'client-pass-1234' };

async function login(page: Page, locale: 'fa' | 'en', phone: string, password: string, next?: string) {
  await page.goto(`/${locale}/login${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  await page.locator('input[name=phone]').fill(phone);
  await page.locator('input[name=password]').fill(password);
  await page.locator('button[type=submit]').click();
}

test('coach logs in with Persian digits and lands on /coach', async ({ page }) => {
  await login(page, 'fa', '۰۹۱۲۰۰۰۰۰۰۰', COACH.password);
  await expect(page).toHaveURL(/\/fa\/coach$/);
  await expect(page.getByRole('navigation').first()).toBeVisible();
});

test('coach honours ?next= inside /coach', async ({ page }) => {
  await login(page, 'en', COACH.phone, COACH.password, '/fa/coach/clients');
  await expect(page).toHaveURL(/\/en\/coach\/clients$/);
});

test('?next= to an external site is ignored', async ({ page }) => {
  await login(page, 'en', CLIENT.phone, CLIENT.password, 'https://evil.example/app');
  await expect(page).toHaveURL(/\/en\/app$/);
});

test('a client lands on /app and is bounced from /coach', async ({ page }) => {
  await login(page, 'en', CLIENT.phone, CLIENT.password);
  await expect(page).toHaveURL(/\/en\/app$/);
  await page.goto('/en/coach');
  await expect(page).toHaveURL(/\/en\/app$/);
});

test('logout clears the session', async ({ page }) => {
  await login(page, 'en', CLIENT.phone, CLIENT.password);
  await expect(page).toHaveURL(/\/en\/app$/);
  await page.getByRole('button', { name: 'Log out' }).first().click();
  await expect(page).toHaveURL(/\/en\/login$/);
  await page.goto('/en/app');
  await expect(page).toHaveURL(/\/en\/login\?next=/);
});

test('field-level errors in both languages', async ({ page }) => {
  await page.goto('/en/login');
  await page.locator('button[type=submit]').click();
  await expect(page.getByText('This field is required.').first()).toBeVisible();
  await expect(page.locator('input[name=phone]')).toHaveAttribute('aria-invalid', 'true');

  await page.goto('/fa/login');
  await page.locator('input[name=phone]').fill('123');
  await page.locator('input[name=password]').fill('x');
  await page.locator('button[type=submit]').click();
  await expect(page.getByText('یک شماره‌ی موبایل معتبر وارد کن', { exact: false })).toBeVisible();
});

test('wrong password shows one generic error, then the phone is rate limited after 5 failures', async ({ page }) => {
  // an unregistered number: the limiter is keyed by phone, so no real account is locked
  const phone = `0912${String(Date.now()).slice(-7)}`;
  for (let i = 0; i < 5; i++) {
    await login(page, 'en', phone, `wrong-password-${i}`);
    await expect(page.locator('form [role=alert]')).toBeVisible();
  }
  await expect(page.locator('form [role=alert]')).toContainText('Too many failed attempts');
});

test.afterAll(async () => {
  // remove the accounts the register test created so repeated runs leave the dev database clean
  const prisma = new PrismaClient();
  await prisma.user.deleteMany({ where: { name: 'E2E Tester' } });
  await prisma.$disconnect();
});

test('register creates a client account and signs in', async ({ page }) => {
  const phone = `0913${String(Date.now()).slice(-7)}`;
  await page.goto('/en/register');
  await page.locator('input[name=name]').fill('E2E Tester');
  await page.locator('input[name=phone]').fill(phone);
  await page.locator('input[name=password]').fill('short');
  await page.locator('button[type=submit]').click();
  await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
  await page.locator('input[name=password]').fill('long-enough-password');
  await page.locator('button[type=submit]').click();
  await expect(page).toHaveURL(/\/en\/app$/);

  // the same number again is refused
  await page.getByRole('button', { name: 'Log out' }).first().click();
  await page.goto('/en/register');
  await page.locator('input[name=name]').fill('E2E Tester');
  await page.locator('input[name=phone]').fill(phone);
  await page.locator('input[name=password]').fill('long-enough-password');
  await page.locator('button[type=submit]').click();
  await expect(page.getByText('An account with this number already exists')).toBeVisible();
});
