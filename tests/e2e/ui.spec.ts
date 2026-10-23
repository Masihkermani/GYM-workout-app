import { expect, test } from '@playwright/test';

// These drive /[locale]/styleguide, which only exists outside production builds.
test.beforeEach(async ({ page }) => {
  const res = await page.goto('/fa/styleguide');
  test.skip(res?.status() === 404, 'styleguide is dev-only');
});

test('NumberInput accepts Persian digits and a Persian decimal separator', async ({ page }) => {
  const field = page.locator('.theme-scope[data-theme=light]').getByRole('spinbutton').nth(2); // the "md" weight field
  await field.fill('۳۰٫۵');
  await expect(field).toHaveValue('۳۰٫۵');
  await expect(field).toHaveAttribute('aria-valuenow', '30.5');
  await field.fill('۲,۵');
  await expect(field).toHaveAttribute('aria-valuenow', '2.5');
  await field.fill('abc'); // letters are rejected: the previous value stays
  await expect(field).toHaveValue('۲٫۵');
});

test('NumberInput steppers move by the step and respect min', async ({ page }) => {
  const scope = page.locator('.theme-scope[data-theme=light]');
  const weight = scope.getByRole('spinbutton').first(); // xl weight, step 2.5, starts at 62.5
  await expect(weight).toHaveAttribute('aria-valuenow', '62.5');
  const group = weight.locator('xpath=ancestor::div[@dir="ltr"][1]');
  await group.getByRole('button', { name: 'افزایش' }).click();
  await expect(weight).toHaveAttribute('aria-valuenow', '65');
  await group.getByRole('button', { name: 'کاهش' }).click();
  await group.getByRole('button', { name: 'کاهش' }).click();
  await expect(weight).toHaveAttribute('aria-valuenow', '60');
  await weight.press('ArrowUp');
  await expect(weight).toHaveAttribute('aria-valuenow', '62.5');
});

test('Sheet traps focus, closes with Escape and returns focus', async ({ page }) => {
  const opener = page.locator('.theme-scope[data-theme=light]').getByRole('button', { name: 'باز کردن برگه' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'تأیید رزرو' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('Dialog (alertdialog) closes from its action', async ({ page }) => {
  await page.locator('.theme-scope[data-theme=light]').getByRole('button', { name: 'باز کردن گفتگو' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'نگه دار' }).click();
  await expect(dialog).toBeHidden();
});

test('Tabs follow the visual direction: in RTL ArrowLeft moves to the next tab', async ({ page }) => {
  const tabs = page.locator('.theme-scope[data-theme=light]').getByRole('tab');
  await tabs.first().focus();
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');
});

for (const locale of ['fa', 'en']) {
  test(`no horizontal overflow at 390px (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const path of [`/${locale}`, `/${locale}/login`, `/${locale}/register`, `/${locale}/styleguide`]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
    }
  });
}
