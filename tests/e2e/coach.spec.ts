import { PrismaClient } from '@prisma/client';
import { expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Coach area end to end, in Persian (the default language), against a seeded database:
 * add a client with a Persian-digit phone, find them by Persian name, write a note, reset the
 * password, edit an exercise's Persian name, change a setting with Persian digits, and the client's
 * own /app/me. Everything the tests change is put back in afterAll.
 */
const COACH = { phone: '09120000000', password: 'coach-pass-1234' };
const SEEDED_CLIENT = { phone: '09120000001', password: 'client-pass-1234' };

const NEW_NAME = 'پریسا آزمون‌پور';
const NEW_PHONE = `0913${String(Date.now()).slice(-7)}`;
const CUSTOM_EN = 'E2E Zercher squat';
const CUSTOM_FA = 'اسکات زرچر آزمون';

const toPersian = (s: string) => s.replace(/[0-9]/g, (d) => String.fromCharCode(0x06f0 + Number(d)));

const prisma = new PrismaClient();
let originalCancelHours = 24;
let bench: { id: string; nameFa: string | null; stepsFa: string[]; stepsEn: string[]; archived: boolean } | null = null;

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.beforeAll(async () => {
  await cleanup();
  originalCancelHours = (await prisma.coachSettings.findUniqueOrThrow({ where: { id: 1 } })).cancelWindowHours;
  bench = await prisma.exercise.findFirst({ where: { nameEn: 'Barbell bench press' }, select: { id: true, nameFa: true, stepsFa: true, stepsEn: true, archived: true } });
});

test.afterAll(async () => {
  await cleanup();
  await prisma.coachSettings.update({ where: { id: 1 }, data: { cancelWindowHours: originalCancelHours } });
  if (bench) {
    await prisma.exercise.update({
      where: { id: bench.id },
      data: { nameFa: bench.nameFa, stepsFa: bench.stepsFa, stepsEn: bench.stepsEn, archived: bench.archived },
    });
  }
  await prisma.user.update({ where: { phone: '+989120000001' }, data: { locale: 'fa' } });
  await prisma.$disconnect();
});

async function cleanup() {
  await prisma.user.deleteMany({ where: { name: NEW_NAME } });
  await prisma.exercise.deleteMany({ where: { nameEn: CUSTOM_EN, isCustom: true } });
}

const SLOW = { timeout: 60_000 }; // the dev server compiles a page the first time it is opened

async function login(page: Page, locale: 'fa' | 'en', phone: string, password: string) {
  await page.goto(`/${locale}/login`);
  await page.locator('input[name=phone]').fill(phone);
  await page.locator('input[name=password]').fill(password);
  await page.locator('button[type=submit]').click();
}

/** Sign in and wait for the area to open. */
async function signIn(page: Page, locale: 'fa' | 'en', phone: string, password: string) {
  await login(page, locale, phone, password);
  await expect(page).toHaveURL(new RegExp(`/${locale}/(app|coach)$`), SLOW);
}

/** Can this phone + password log in? Uses a throwaway context so the coach stays signed in. */
/** Switches are a visually hidden checkbox inside a label: click the label, as a person would. */
async function flip(page: Page, name: string) {
  await page.locator('label', { has: page.getByRole('switch', { name, exact: true }) }).click();
}

async function canLogin(browser: Browser, phone: string, password: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page, 'fa', phone, password);
  // success navigates away from /login; failure shows the form-level alert
  const result = await Promise.race([
    page.waitForURL(/\/fa\/(app|coach)$/, { timeout: 60_000 }).then(() => true),
    page.locator('form [role=alert]').waitFor({ timeout: 60_000 }).then(() => false),
  ]).catch(() => false);
  await ctx.close();
  return result;
}

let tempPassword = '';
let clientId = '';

test('coach signs in with Persian digits and sees the dashboard', async ({ page }) => {
  await signIn(page, 'fa', toPersian(COACH.phone), COACH.password);
  await expect(page).toHaveURL(/\/fa\/coach$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/بخیر/);
  // three small numbers: sessions this week, active clients, pending requests
  for (const label of ['جلسه‌های این هفته', 'شاگردان فعال', 'درخواست در انتظار']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'امروز' })).toBeVisible();
});

test.describe('with a signed-in coach', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'fa', COACH.phone, COACH.password);
  });

  test('adds a client with a Persian-digit phone, generated password and a hand-over panel', async ({ page }) => {
    await page.goto('/fa/coach/clients');
    await page.getByRole('button', { name: 'افزودن شاگرد' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();

    // empty submit: field errors next to the fields
    await sheet.getByRole('button', { name: 'ساخت حساب' }).click();
    await expect(sheet.getByText('این فیلد الزامی است.').first()).toBeVisible();

    await sheet.getByLabel('نام و نام خانوادگی').fill(NEW_NAME);
    await sheet.getByLabel('شماره‌ی موبایل').fill(toPersian(NEW_PHONE));
    await sheet.getByRole('button', { name: 'ساخت رمز تصادفی' }).click();
    const password = sheet.getByLabel('رمز موقت');
    await expect(password).toHaveValue(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    tempPassword = await password.inputValue();

    await sheet.getByRole('button', { name: 'ساخت حساب' }).click();
    await expect(sheet.getByTestId('temp-password')).toHaveText(tempPassword);
    await expect(sheet).toContainText(toPersian(`${NEW_PHONE.slice(0, 4)} ${NEW_PHONE.slice(4, 7)} ${NEW_PHONE.slice(7)}`));

    // stored as E.164, role CLIENT, in the coach's language
    const row = await prisma.user.findUniqueOrThrow({ where: { phone: `+98${NEW_PHONE.slice(1)}` } });
    expect(row.role).toBe('CLIENT');
    expect(row.name).toBe(NEW_NAME);
    expect(row.locale).toBe('fa');
    clientId = row.id;

    // the same number again is refused
    await sheet.getByRole('button', { name: 'افزودن شاگرد دیگر' }).click();
    const again = page.getByRole('dialog');
    await again.getByLabel('نام و نام خانوادگی').fill('نام دیگر');
    await again.getByLabel('شماره‌ی موبایل').fill(NEW_PHONE);
    await again.getByLabel('رمز موقت').fill('some-password-1');
    await again.getByRole('button', { name: 'ساخت حساب' }).click();
    await expect(again.getByText('با این شماره قبلاً حساب ساخته شده است.')).toBeVisible();
    await expect(again.getByLabel('نام و نام خانوادگی')).toHaveValue('نام دیگر'); // typed values survive an error
  });

  test('the new client can log in with the temporary password', async ({ browser }) => {
    expect(await canLogin(browser, NEW_PHONE, tempPassword)).toBe(true);
    expect(await canLogin(browser, NEW_PHONE, 'definitely-wrong-1')).toBe(false);
  });

  test('finds the client by Persian name and by Persian-digit phone; filters and sorts', async ({ page }) => {
    await page.goto('/fa/coach/clients');
    const search = page.getByRole('searchbox', { name: 'جست‌وجوی شاگرد' });

    await search.fill('آزمون‌پور');
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByRole('link', { name: new RegExp(NEW_NAME) })).toBeVisible();
    await expect(page.getByRole('link', { name: /سارا کریمی/ })).toHaveCount(0);

    // ZWNJ-tolerant: typing the name without the half-space still matches
    await search.fill('آزمونپور');
    await expect(page.getByRole('link', { name: new RegExp(NEW_NAME) })).toBeVisible();

    // phone typed in Persian digits (national format)
    await search.fill(toPersian(NEW_PHONE.slice(0, 9)));
    await expect(page.getByRole('link', { name: new RegExp(NEW_NAME) })).toBeVisible();
    await expect(page.getByRole('link', { name: /سارا کریمی/ })).toHaveCount(0);

    await search.fill('هیچ‌کس');
    await expect(page.getByText('شاگردی پیدا نشد')).toBeVisible();

    // status filter and sortable columns
    await page.goto('/fa/coach/clients?status=inactive');
    await expect(page.getByRole('link', { name: /سارا کریمی/ })).toHaveCount(0);
    await page.goto('/fa/coach/clients?sort=name&dir=desc');
    await expect(page.getByRole('columnheader', { name: /نام/ }).first()).toHaveAttribute('aria-sort', 'descending');
  });

  test('writes a private note that autosaves and survives a reload', async ({ page }) => {
    await page.goto(`/fa/coach/clients/${clientId}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NEW_NAME);
    const notes = page.getByLabel('یادداشت‌های مربی');
    await notes.fill('زانوی راست حساس است؛ اسکات عمیق نه.');
    await expect(page.locator('#coach-notes-status')).toContainText('ذخیره شد');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: clientId } })).coachNotes).toContain('زانوی راست');

    await page.reload();
    await expect(page.getByLabel('یادداشت‌های مربی')).toHaveValue('زانوی راست حساس است؛ اسکات عمیق نه.');

    // the detail page links to the program builder (the training agent's route)
    await expect(page.getByRole('link', { name: 'برنامه‌ی جدید' }).first()).toHaveAttribute(
      'href',
      `/fa/coach/clients/${clientId}/programs/new`,
    );
  });

  test('resets the password: shown once, old one stops working, sessions end', async ({ page, browser }) => {
    await page.goto(`/fa/coach/clients/${clientId}`);
    await page.getByRole('button', { name: 'بازنشانی رمز' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'بازنشانی رمز' }).click();

    const shown = page.getByTestId('reset-password');
    await expect(shown).toHaveText(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    const fresh = (await shown.textContent())!.trim();
    expect(fresh).not.toBe(tempPassword);
    await page.getByRole('dialog').getByRole('button', { name: 'تمام' }).click();
    await expect(page.getByTestId('reset-password')).toHaveCount(0); // gone for good

    expect(await canLogin(browser, NEW_PHONE, tempPassword)).toBe(false);
    expect(await canLogin(browser, NEW_PHONE, fresh)).toBe(true);
    tempPassword = fresh;

    const row = await prisma.user.findUniqueOrThrow({ where: { id: clientId }, select: { passwordHash: true } });
    expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  test('deactivating a client asks first and blocks their login until reactivated', async ({ page, browser }) => {
    await page.goto(`/fa/coach/clients/${clientId}`);
    const toggle = page.getByRole('switch', { name: 'حساب فعال', exact: true });
    await expect(toggle).toBeChecked();
    await flip(page, 'حساب فعال');
    const confirm = page.getByRole('alertdialog');
    await confirm.getByRole('button', { name: 'غیرفعال‌سازی' }).click();
    await expect(page.getByRole('region', { name: 'اعلان‌ها' })).toContainText('غیرفعال شد');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: clientId } })).active).toBe(false);
    expect(await canLogin(browser, NEW_PHONE, tempPassword)).toBe(false);

    await flip(page, 'حساب فعال');
    await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: clientId } })).active).toBe(true);
    expect(await canLogin(browser, NEW_PHONE, tempPassword)).toBe(true);
  });

  test('an unknown client id is a 404, and a coach id is not a client', async ({ page }) => {
    const res = await page.goto('/fa/coach/clients/does-not-exist');
    expect(res?.status()).toBe(404);
    const coach = await prisma.user.findUniqueOrThrow({ where: { phone: '+989120000000' } });
    const res2 = await page.goto(`/fa/coach/clients/${coach.id}`);
    expect(res2?.status()).toBe(404);
  });

  test('edits an exercise\'s Persian name from a deep link, and the library finds it', async ({ page }) => {
    test.skip(!bench, 'seed exercise "Barbell bench press" not found');
    const renamed = 'پرس سینه با هالتر (آزمون)';
    await page.goto(`/fa/coach/exercises?edit=${bench!.id}`);
    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    // library exercises can be archived but never deleted from here
    await expect(sheet.getByRole('button', { name: 'حذف' })).toHaveCount(0);
    await sheet.getByLabel('نام فارسی').fill(renamed);
    await sheet.getByLabel('مراحل اجرا (فارسی)').fill('روی نیمکت دراز بکش.\n\nمیله را پایین بیاور و بالا بده.');
    await sheet.getByRole('button', { name: 'ذخیره' }).click();
    await expect(page.getByRole('region', { name: 'اعلان‌ها' })).toContainText('حرکت ذخیره شد.');
    await expect(page).not.toHaveURL(/edit=/);

    const saved = await prisma.exercise.findUniqueOrThrow({ where: { id: bench!.id } });
    expect(saved.nameFa).toBe(renamed);
    expect(saved.stepsFa).toEqual(['روی نیمکت دراز بکش.', 'میله را پایین بیاور و بالا بده.']); // one line per step, blanks dropped

    await page.getByRole('searchbox', { name: 'جست‌وجو' }).fill('هالتر (آزمون)');
    await expect(page.getByRole('link', { name: `ویرایش ${renamed}` })).toBeVisible();
  });

  test('searches the library with Persian digits and filters by body part', async ({ page }) => {
    await page.goto('/fa/coach/exercises');
    await page.getByRole('searchbox', { name: 'جست‌وجو' }).fill('۴۵'); // «45°» in English names
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByText(/^۱ تا \S+ از \S+$/)).toBeVisible();

    await page.goto('/fa/coach/exercises?bodyPart=neck');
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(3); // header + the two neck exercises
  });

  test('adds a custom exercise, archives it, then deletes it (unused custom only)', async ({ page }) => {
    await page.goto('/fa/coach/exercises');
    await page.getByRole('button', { name: 'حرکت سفارشی' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('button', { name: 'افزودن حرکت' }).click();
    await expect(sheet.getByText('این فیلد الزامی است.').first()).toBeVisible();

    await sheet.getByLabel('نام انگلیسی').fill(CUSTOM_EN);
    await sheet.getByLabel('نام فارسی').fill(CUSTOM_FA);
    await sheet.getByLabel('ناحیه‌ی بدن').selectOption({ label: 'ران' });
    await sheet.getByLabel('وسیله').selectOption({ label: 'هالتر' });
    await sheet.getByLabel('عضله‌ی هدف').selectOption({ label: 'چهارسر ران' });
    await sheet.getByRole('button', { name: 'افزودن حرکت' }).click();
    await expect(page.getByRole('region', { name: 'اعلان‌ها' })).toContainText('حرکت اضافه شد.');

    const made = await prisma.exercise.findFirstOrThrow({ where: { nameEn: CUSTOM_EN } });
    expect(made.isCustom).toBe(true);
    expect(made.archived).toBe(false);

    // archive it from the editor: it leaves the default list and shows under "archived"
    await page.goto(`/fa/coach/exercises?edit=${made.id}`);
    await flip(page, 'بایگانی‌شده');
    await page.getByRole('dialog').getByRole('button', { name: 'ذخیره' }).click();
    await expect(page.getByRole('region', { name: 'اعلان‌ها' })).toContainText('حرکت ذخیره شد.');
    await page.goto(`/fa/coach/exercises?q=${encodeURIComponent(CUSTOM_FA)}`);
    await expect(page.getByText('حرکتی پیدا نشد')).toBeVisible();
    await page.goto(`/fa/coach/exercises?q=${encodeURIComponent(CUSTOM_FA)}&show=archived&custom=1`);
    await expect(page.getByRole('link', { name: `ویرایش ${CUSTOM_FA}` })).toBeVisible();

    // unused + custom: it can really be deleted
    await page.getByRole('link', { name: `ویرایش ${CUSTOM_FA}` }).click();
    const editor = page.getByRole('dialog');
    await editor.getByRole('button', { name: 'حذف' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'حذف حرکت' }).click();
    await expect(page.getByRole('region', { name: 'اعلان‌ها' })).toContainText('حرکت حذف شد.');
    expect(await prisma.exercise.count({ where: { nameEn: CUSTOM_EN } })).toBe(0);
  });

  test('changes cancelWindowHours with Persian digits; the landing page reflects it', async ({ page }) => {
    await page.goto('/fa/coach/settings');
    const hours = page.getByRole('spinbutton', { name: 'مهلت لغو' });
    await expect(hours).toBeVisible();
    await hours.fill('۴۸');
    await expect(hours).toHaveAttribute('aria-valuenow', '48');
    await page.getByRole('button', { name: 'ذخیره‌ی تنظیمات' }).click();
    await expect(page.getByRole('region', { name: 'اعلان‌ها' })).toContainText('تنظیمات ذخیره شد.');
    expect((await prisma.coachSettings.findUniqueOrThrow({ where: { id: 1 } })).cancelWindowHours).toBe(48);

    await page.reload();
    await expect(page.getByRole('spinbutton', { name: 'مهلت لغو' })).toHaveValue('۴۸');

    await page.goto('/fa');
    await expect(page.getByText('تا ۴۸ ساعت پیش از جلسه')).toBeVisible();
  });

  test('settings validate on the server and show the error next to the field', async ({ page }) => {
    await page.goto('/fa/coach/settings');
    const zone = page.getByLabel('منطقه‌ی زمانی');
    await zone.fill('Mars/Phobos');
    await page.getByRole('button', { name: 'ذخیره‌ی تنظیمات' }).click();
    await expect(page.getByText('منطقه‌ی زمانی معتبر نیست؛ مثل Asia/Tehran.')).toBeVisible();
    await expect(zone).toHaveAttribute('aria-invalid', 'true');
    await expect(zone).toBeFocused();
    expect((await prisma.coachSettings.findUniqueOrThrow({ where: { id: 1 } })).timezone).toBe('Asia/Tehran');
  });
});

test.describe('the client profile (/app/me)', () => {
  test('switches the language, saves it to the account and opens the page in that language', async ({ page }) => {
    await signIn(page, 'fa', SEEDED_CLIENT.phone, SEEDED_CLIENT.password);
    await page.goto('/fa/app/me');
    await expect(page.getByRole('radio', { name: 'فارسی' })).toBeChecked();
    await page.getByRole('radio', { name: 'English' }).click();
    await expect(page).toHaveURL(/\/en\/app\/me$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('radio', { name: 'English' })).toBeChecked();
    expect((await prisma.user.findUniqueOrThrow({ where: { phone: '+989120000001' } })).locale).toBe('en');

    await page.getByRole('radio', { name: 'فارسی' }).click();
    await expect(page).toHaveURL(/\/fa\/app\/me$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('edits name and goal, with errors beside the field', async ({ page }) => {
    await signIn(page, 'en', SEEDED_CLIENT.phone, SEEDED_CLIENT.password);
    await page.goto('/en/app/me');
    const before = await prisma.user.findUniqueOrThrow({ where: { phone: '+989120000001' } });
    try {
      await page.getByLabel('Full name').fill('');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText('This field is required.')).toBeVisible();

      await page.getByLabel('Full name').fill('Mahsa  Rahimi E2E');
      await page.getByLabel('Your goal').fill('Squat 60 kg by December.');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('Profile saved.');
      const after = await prisma.user.findUniqueOrThrow({ where: { phone: '+989120000001' } });
      expect(after.name).toBe('Mahsa Rahimi E2E'); // whitespace tidied
      expect(after.goal).toBe('Squat 60 kg by December.');
    } finally {
      await prisma.user.update({ where: { id: before.id }, data: { name: before.name, goal: before.goal } });
    }
  });

  test('changes the password: wrong current is refused, other devices are signed out', async ({ page, browser }) => {
    test.skip(!tempPassword, 'needs the client created earlier in this file');
    await signIn(page, 'fa', NEW_PHONE, tempPassword);

    // a second device that will be signed out
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await signIn(otherPage, 'fa', NEW_PHONE, tempPassword);

    await page.goto('/fa/app/me');
    const form = page.locator('form').filter({ has: page.getByLabel('رمز فعلی') });
    await form.getByLabel('رمز فعلی').fill('not-the-password');
    await form.getByLabel('رمز تازه', { exact: true }).fill('brand-new-pass-77');
    await form.getByLabel('تکرار رمز تازه').fill('brand-new-pass-77');
    await form.getByRole('button', { name: 'تغییر رمز' }).click();
    await expect(page.getByText('رمز عبور فعلی درست نیست.')).toBeVisible();

    await form.getByLabel('رمز فعلی').fill(tempPassword);
    await form.getByLabel('تکرار رمز تازه').fill('different-one-88');
    await form.getByRole('button', { name: 'تغییر رمز' }).click();
    await expect(page.getByText('تکرار رمز با رمز تازه یکی نیست.')).toBeVisible();

    await form.getByLabel('تکرار رمز تازه').fill('brand-new-pass-77');
    await form.getByRole('button', { name: 'تغییر رمز' }).click();
    await expect(page.getByText('رمزت عوض شد.')).toBeVisible();

    await otherPage.goto('/fa/app/me');
    await expect(otherPage).toHaveURL(/\/fa\/login/); // the other session was ended
    await other.close();
    await page.goto('/fa/app/me');
    await expect(page).toHaveURL(/\/fa\/app\/me$/); // this one stays
    expect(await canLogin(browser, NEW_PHONE, 'brand-new-pass-77')).toBe(true);
    expect(await canLogin(browser, NEW_PHONE, tempPassword)).toBe(false);
  });
});
