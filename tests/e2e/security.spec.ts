import { expect, test, type Page } from '@playwright/test';

/**
 * Hardening that is visible from the outside (docs: security review F3, F7, F9).
 * Seeded accounts: prisma/seed.ts. Client 5 is used read-only, so nothing here changes the database.
 */
const CLIENT = { phone: '09120000005', password: 'client-pass-1234' };
const COACH_PHONE_SPELLINGS = ['09120000000', '+989120000000', '989120000000', '۰۹۱۲۰۰۰۰۰۰۰', '0912 000 0000', '۰۹۱۲ ۰۰۰ ۰۰۰۰'];

async function login(page: Page, who: { phone: string; password: string }) {
  await page.goto('/fa/login');
  await page.locator('input[name=phone]').fill(who.phone);
  await page.locator('input[name=password]').fill(who.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/fa\/app/);
}

test('every page is served with the security headers', async ({ request }) => {
  for (const path of ['/fa', '/en/login', '/fa/register', '/fa/does-not-exist']) {
    const res = await request.get(path);
    const h = res.headers();
    const csp = h['content-security-policy'] ?? '';
    expect(csp, path).toContain("default-src 'self'");
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).toContain("object-src 'none'");
    expect(csp, path).toContain("base-uri 'self'");
    expect(csp, path).toContain("form-action 'self'");
    expect(csp, path).not.toMatch(/https?:/);
    expect(h['x-content-type-options'], path).toBe('nosniff');
    expect(h['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    expect(h['x-frame-options'], path).toBe('DENY');
    expect(h['permissions-policy'], path).toContain('camera=()');
    expect(h['x-powered-by'], path).toBeUndefined();
  }
});

test('the coach phone number is not in the booking page, not even in the page data', async ({ page }) => {
  await login(page, CLIENT);
  const html = await (await page.request.get('/fa/app/book')).text();
  for (const spelling of COACH_PHONE_SPELLINGS) expect(html).not.toContain(spelling);
  await page.goto('/fa/app/book');
  const rendered = await page.content();
  for (const spelling of COACH_PHONE_SPELLINGS) expect(rendered).not.toContain(spelling);
  await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
});

test('a weak password is refused at sign-up with its own message', async ({ page }) => {
  await page.goto('/en/register');
  await page.locator('input[name=name]').fill('Weak Password Tester');
  await page.locator('input[name=phone]').fill(`0914${String(Date.now()).slice(-7)}`);
  await page.locator('input[name=password]').fill('1234567890');
  await page.locator('button[type=submit]').click();
  await expect(page.getByText('That password is too easy to guess.')).toBeVisible();
  await expect(page).toHaveURL(/\/en\/register$/);
});

test('?page= garbage on history falls back to page 1 instead of an error', async ({ page }) => {
  await login(page, CLIENT);
  for (const q of ['abc', '-4', '99999999999999', '1e9', '0']) {
    const res = await page.goto(`/fa/app/history?page=${q}`);
    expect(res?.status(), q).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});
