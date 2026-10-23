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

test('a Sheet that mounts already open stays open in dev (React Strict Mode double effect)', async ({ page }) => {
  const scope = page.locator('.theme-scope[data-theme=light]');
  const opener = scope.getByRole('button', { name: 'برگه‌ی از پیش باز' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'تأیید رزرو' });
  await expect(dialog).toBeVisible();
  // the stale native `close` event from Strict Mode's effect cleanup arrives a task later: it must not close the sheet
  await page.waitForTimeout(600);
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el: HTMLDialogElement) => el.open)).toBe(true);

  // normal closing still works and hands focus back: Escape ...
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  // ... the close button ...
  await opener.click();
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(300);
  await dialog.getByRole('button', { name: 'بستن' }).click();
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  // ... and a click on the backdrop (the panel sits at the left in RTL, so click near the right edge)
  await opener.click();
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(300);
  await page.mouse.click(page.viewportSize()!.width - 5, 5);
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('a toast shows above an open Sheet, stays announced, and goes back to the page after', async ({ page }) => {
  const scope = page.locator('.theme-scope[data-theme=light]');
  await scope.getByRole('button', { name: 'باز کردن برگه', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'تأیید رزرو' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'نمایش اعلان' }).click();

  const region = page.getByRole('region', { name: 'اعلان‌ها' });
  await expect(region).toHaveCount(1); // the page's own region is aria-hidden while a modal is open
  await expect(region).toContainText('ذخیره شد. ۳ ست مانده.');
  await expect(region).toHaveAttribute('aria-live', 'polite');
  // it lives inside the dialog (in the accessibility tree) ...
  expect(await region.evaluate((el) => !!el.closest('dialog'))).toBe(true);
  // ... and is really on top: whatever is under the toast's centre is the toast itself, not the dialog or backdrop
  const toast = region.locator('.toast-in').first();
  const box = await toast.boundingBox();
  expect(box).not.toBeNull();
  const onTop = await page.evaluate(
    ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.toast-in'),
    { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
  );
  expect(onTop).toBe(true);
  // it can be dismissed from the keyboard-reachable button inside the modal
  await toast.getByRole('button', { name: 'بستن پیام' }).click();
  await expect(region).not.toContainText('ذخیره شد. ۳ ست مانده.');

  // closing the sheet moves the region back to the page: a toast fired now is still announced
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await scope.getByRole('button', { name: 'نمایش اعلان', exact: true }).click();
  const pageRegion = page.getByRole('region', { name: 'اعلان‌ها' });
  await expect(pageRegion).toContainText('ذخیره شد. ۳ ست مانده.');
  expect(await pageRegion.evaluate((el) => !!el.closest('dialog'))).toBe(false);
});

test('units are Persian in fa: no Latin "kg" next to a number or in a field label', async ({ page }) => {
  const scope = page.locator('.theme-scope[data-theme=light]');
  const weight = scope.getByRole('spinbutton').first();
  const group = weight.locator('xpath=ancestor::div[@dir="ltr"][1]');
  await expect(group).toContainText('کیلو');
  await expect(scope.getByText('وزنه (کیلو)').first()).toBeVisible();
  await expect(scope).not.toContainText(/\bkg\b/i);
});

test('SectionLabel: no middle dot beside Persian digits (an index gets a hairline divider instead)', async ({ page }) => {
  const scope = page.locator('.theme-scope[data-theme=light]');
  const labels = scope.getByRole('heading', { name: /نوبت در صف/ });
  await expect(labels).toHaveCount(2);
  for (const text of await labels.allTextContents()) expect(text).not.toContain('\u00b7');
  await expect(labels.first()).toContainText('۲');
  await expect(labels.last()).toContainText('۱۰');
  await expect(scope).not.toContainText('\u00b7'); // the date line uses the Persian comma in fa too
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
