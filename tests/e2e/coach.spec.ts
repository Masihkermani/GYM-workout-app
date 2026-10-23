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
  // three small numbers: sessions in the next 7 days, active clients, pending requests
  for (const label of ['جلسه‌های ۷ روز آینده', 'شاگردان فعال', 'درخواست در انتظار']) {
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

    // the detail page links to the program builder, once (the header's button; the panel has no second one)
    const newProgram = page.getByRole('link', { name: 'برنامه‌ی جدید' });
    await expect(newProgram).toHaveCount(1);
    await expect(newProgram).toHaveAttribute('href', `/fa/coach/clients/${clientId}/programs/new`);
    await expect(page.getByRole('link', { name: 'برنامه‌ی تازه' })).toHaveCount(0);
  });

  test("edits the client's name and phone: a taken number is refused on the field, a new one is stored as E.164", async ({ page }) => {
    const renamed = 'پریسا آزمون‌پور (ویرایش‌شده)';
    const newPhone = `0914${String(Date.now()).slice(-7)}`;
    try {
      await page.goto(`/fa/coach/clients/${clientId}`);
      await page.getByRole('button', { name: 'ویرایش مشخصات' }).click();
      const sheet = page.getByRole('dialog');
      await expect(sheet.getByLabel('نام و نام خانوادگی')).toHaveValue(NEW_NAME);
      await expect(sheet.getByLabel('شماره‌ی موبایل')).toHaveValue(toPersian(`${NEW_PHONE.slice(0, 4)} ${NEW_PHONE.slice(4, 7)} ${NEW_PHONE.slice(7)}`));

      // a number another client owns (typed with Persian digits): the error sits on the phone field
      await sheet.getByLabel('نام و نام خانوادگی').fill(renamed);
      await sheet.getByLabel('شماره‌ی موبایل').fill(toPersian(SEEDED_CLIENT.phone));
      await sheet.getByRole('button', { name: 'ذخیره' }).click();
      const phone = sheet.getByLabel('شماره‌ی موبایل');
      await expect(sheet.getByText('با این شماره قبلاً حساب ساخته شده است.')).toBeVisible();
      await expect(phone).toHaveAttribute('aria-invalid', 'true');
      await expect(phone).toBeFocused();
      await expect(sheet.getByLabel('نام و نام خانوادگی')).toHaveValue(renamed); // what was typed stays
      expect((await prisma.user.findUniqueOrThrow({ where: { id: clientId } })).name).toBe(NEW_NAME);

      // an invalid number is its own message
      await phone.fill('۱۲۳');
      await sheet.getByRole('button', { name: 'ذخیره' }).click();
      await expect(sheet.getByText(/شماره‌ی موبایل معتبر نیست/)).toBeVisible();

      // a free number saves, closes the sheet and the page shows the new name
      await phone.fill(toPersian(newPhone));
      await sheet.getByRole('button', { name: 'ذخیره' }).click();
      await expect(page.getByRole('region', { name: 'اعلان‌ها' })).toContainText('مشخصات ذخیره شد.');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(renamed);
      const row = await prisma.user.findUniqueOrThrow({ where: { id: clientId } });
      expect(row.phone).toBe(`+98${newPhone.slice(1)}`);
      expect(row.name).toBe(renamed);
      expect(row.role).toBe('CLIENT');
      await expect(page.getByRole('link', { name: toPersian(`${newPhone.slice(0, 4)} ${newPhone.slice(4, 7)} ${newPhone.slice(7)}`) })).toBeVisible();
    } finally {
      // later tests (and cleanup) find this client by its original name and phone
      await prisma.user.update({ where: { id: clientId }, data: { name: NEW_NAME, phone: `+98${NEW_PHONE.slice(1)}` } });
    }
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
    // a deactivated client can't be run a session for: the page offers no "Start session"
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NEW_NAME);
    await expect(page.getByRole('button', { name: 'شروع جلسه' })).toHaveCount(0);

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

// ------------------------------------------------------------------------------------------------
// Dashboard: the next 7 days, and a bodyweight set that says what it is
// ------------------------------------------------------------------------------------------------

test.describe('the dashboard', () => {
  const FEED_CLIENT = '+989120000006';
  let feedWorkoutId: string | null = null;

  test.afterAll(async () => {
    if (feedWorkoutId) await prisma.workoutLog.deleteMany({ where: { id: feedWorkoutId } });
  });

  test('occupancy is a rolling "next 7 days" that starts today, in both languages', async ({ page }) => {
    await signIn(page, 'fa', COACH.phone, COACH.password);
    const week = page.getByTestId('week-occupancy');
    await expect(page.getByRole('heading', { name: '۷ روز آینده' })).toBeVisible();
    await expect(week.getByRole('list', { name: '۷ روز آینده' }).getByRole('listitem')).toHaveCount(7);
    // today is the first column, not whatever day the calendar week happens to start on
    await expect(week.getByRole('listitem').first()).toHaveAttribute('aria-current', 'date');
    await expect(week.getByRole('listitem').nth(1)).not.toHaveAttribute('aria-current', 'date');
    // numbers, not colour alone: every day names its booked and open hours
    for (const li of await week.getByRole('listitem').all()) {
      await expect(li).toHaveAttribute('aria-label', /ساعت رزرو.*ساعت آزاد/);
    }
    // the window has open hours in it even on a Friday (the coach's day off): it is not seven days of zeros
    await expect(week.getByText(/ساعت رزرو شده، (?!۰ ساعت)\S+ ساعت هنوز آزاد/)).toBeVisible();
    // the small figure up top uses the same window and says so
    await expect(page.getByText('جلسه‌های ۷ روز آینده', { exact: true })).toBeVisible();
    await expect(page.getByText('جلسه‌های این هفته')).toHaveCount(0);

    await page.goto('/en/coach');
    await expect(page.getByRole('heading', { name: 'Next 7 days' })).toBeVisible();
    await expect(page.getByTestId('week-occupancy').getByRole('listitem').first()).toHaveAttribute('aria-current', 'date');
    await expect(page.getByText('Sessions, next 7 days', { exact: true })).toBeVisible();
  });

  test('a bodyweight set reads «۶ تکرار» / "6 reps", never a bare number', async ({ page }) => {
    const client = await prisma.user.findUniqueOrThrow({ where: { phone: FEED_CLIENT } });
    const pullUp = await prisma.exercise.findFirstOrThrow({ where: { equipment: 'body weight', archived: false }, select: { id: true, nameFa: true } });
    const w = await prisma.workoutLog.create({
      data: {
        clientId: client.id,
        finishedAt: new Date(),
        sets: { create: [{ exerciseId: pullUp.id, setIndex: 1, reps: 6, weightKg: 0 }] },
      },
    });
    feedWorkoutId = w.id;

    await signIn(page, 'fa', COACH.phone, COACH.password);
    const feed = page.getByRole('list', { name: 'آخرین ثبت‌ها' });
    const row = feed.getByRole('listitem').first();
    await expect(row).toContainText(client.name);
    await expect(row).toContainText('۶ تکرار');
    // no row of the feed is just a digit
    for (const li of await feed.getByRole('listitem').all()) {
      const figure = li.locator('.num').first();
      await expect(figure).not.toHaveText(/^[۰-۹]+$/);
    }

    await page.goto('/en/coach');
    await expect(page.getByRole('list', { name: 'Latest logged sets' }).getByRole('listitem').first()).toContainText('6 reps');
  });
});

// ------------------------------------------------------------------------------------------------
// The client page at phone widths
// ------------------------------------------------------------------------------------------------

test.describe('the client page on a phone', () => {
  for (const width of [360, 390]) {
    test(`fa and en do not scroll sideways at ${width}px`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await ctx.newPage();
      await signIn(page, 'fa', COACH.phone, COACH.password);
      const clients = await prisma.user.findMany({
        where: { phone: { in: ['+989120000001', '+989120000002', '+989120000004'] } },
        select: { id: true },
      });
      expect(clients.length).toBeGreaterThan(0);
      for (const { id } of clients) {
        for (const locale of ['fa', 'en']) {
          await page.goto(`/${locale}/coach/clients/${id}`);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await expect(page.getByRole('region', { name: /تمرین|Training/ })).toBeVisible(SLOW);
          const m = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
          expect(m.scroll, `/${locale}/coach/clients/${id} at ${width}px`).toBeLessThanOrEqual(m.inner);
        }
      }
      await ctx.close();
    });
  }
});

// ------------------------------------------------------------------------------------------------
// The coach runs the session: start it for a client, log it, finish it
// ------------------------------------------------------------------------------------------------

test.describe('the coach runs the session', () => {
  const CLIENT_PHONE = '+989120000003';
  let target: { id: string; name: string };
  let bookingId = '';
  const workoutIds = new Set<string>();

  test.beforeAll(async () => {
    target = await prisma.user.findUniqueOrThrow({ where: { phone: CLIENT_PHONE }, select: { id: true, name: true } });
    // an earlier failed run could have left one open: starting would then offer "continue" instead
    await prisma.workoutLog.deleteMany({ where: { clientId: target.id, finishedAt: null } });
  });

  test.afterAll(async () => {
    await prisma.workoutLog.deleteMany({ where: { OR: [{ id: { in: [...workoutIds] } }, { bookingId: bookingId || '-' }] } });
    if (bookingId) await prisma.booking.deleteMany({ where: { id: bookingId } });
  });

  test("starts a session from the client's page, logs a set under the client, finishes, and the booking is completed", async ({ page }) => {
    // a confirmed session that began an hour ago: the workout started from the page links to it
    const startsAt = new Date(Date.now() - 3_600_000);
    bookingId = (
      await prisma.booking.create({
        data: { clientId: target.id, startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), status: 'CONFIRMED' },
      })
    ).id;

    await signIn(page, 'fa', COACH.phone, COACH.password);
    await page.goto(`/fa/coach/clients/${target.id}`);

    // "Start session" is the page's one red action; "New program" is the quiet one
    const start = page.getByRole('button', { name: 'شروع جلسه' });
    const redBg = await start.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(redBg).toBe(await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.backgroundColor = 'var(--plate-red)';
      document.body.append(probe);
      const c = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return c;
    }));
    await start.click();

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: `شروع جلسه با ${target.name}` })).toBeVisible(SLOW);
    const options = sheet.getByRole('radio');
    await expect(options.last()).toBeVisible();
    await expect(options.last()).not.toBeChecked(); // "free workout" is last; the next program day is preselected
    expect(await sheet.getByRole('radio', { checked: true }).count()).toBe(1);
    await expect(sheet.getByText('نوبت این روز')).toBeVisible();
    await sheet.getByRole('button', { name: 'شروع', exact: true }).click();

    await page.waitForURL(new RegExp(`/fa/coach/clients/${target.id}/workouts/.+`), SLOW);
    const workoutId = page.url().split('/workouts/')[1];
    workoutIds.add(workoutId);

    // the header names the client, in the coach shell (no client tab bar)
    await expect(page.getByTestId('logging-for')).toContainText(target.name);
    await expect(page.getByRole('link', { name: 'برگشت به شاگرد' })).toBeVisible();
    await expect(page.locator('[data-tabbar]')).toHaveCount(0);
    const row = await prisma.workoutLog.findUniqueOrThrow({ where: { id: workoutId } });
    expect(row.clientId).toBe(target.id);
    expect(row.bookingId).toBe(bookingId);
    expect(row.programDayId).not.toBeNull();

    // log a set with Persian digits
    await page.getByRole('spinbutton', { name: /^وزنه/ }).fill('۳۰');
    await page.getByRole('spinbutton', { name: 'تکرار' }).fill('۸');
    await page.getByRole('button', { name: /^ثبت ست/ }).click();
    await expect(page.getByRole('button', { name: 'ویرایش ست ۱' })).toContainText('۸ × ۳۰ کیلو');
    await expect.poll(async () => prisma.setLog.count({ where: { workoutId } })).toBe(1);
    const set = await prisma.setLog.findFirstOrThrow({ where: { workoutId } });
    expect(set.reps).toBe(8);
    expect(Number(set.weightKg)).toBe(30);

    // leaving and coming back: the sheet offers to continue the open one instead of starting a second
    await page.getByRole('link', { name: 'برگشت به شاگرد' }).click();
    await page.waitForURL(new RegExp(`/fa/coach/clients/${target.id}$`));
    await page.getByRole('button', { name: 'شروع جلسه' }).click();
    await expect(page.getByRole('dialog').getByText('یک تمرین باز است')).toBeVisible(SLOW);
    await page.getByRole('dialog').getByRole('button', { name: 'ادامه‌ی تمرین' }).click();
    await page.waitForURL(new RegExp(`/workouts/${workoutId}$`), SLOW);
    expect(await prisma.workoutLog.count({ where: { clientId: target.id, finishedAt: null } })).toBe(1);

    // finish: the summary, and the way on goes back to the client, not to the client's own history
    await page.getByRole('button', { name: 'پایان تمرین' }).first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'پایان تمرین' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'تمرین تمام شد' })).toBeVisible();
    await expect(page.getByText(`تمرین در دفتر ${target.name} ثبت شد.`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'دیدن در تاریخچه' })).toHaveCount(0);

    await expect.poll(async () => (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('COMPLETED');
    expect((await prisma.workoutLog.findUniqueOrThrow({ where: { id: workoutId } })).finishedAt).not.toBeNull();

    await page.getByRole('link', { name: `برگشت به ${target.name}` }).click();
    await page.waitForURL(new RegExp(`/fa/coach/clients/${target.id}$`));
    await expect(page.getByRole('region', { name: 'تمرین' }).getByText('۱ ست').first()).toBeVisible();

    // a finished workout is history: its logger URL goes back to the client page
    await page.goto(`/fa/coach/clients/${target.id}/workouts/${workoutId}`);
    await expect(page).toHaveURL(new RegExp(`/fa/coach/clients/${target.id}$`));
  });

  test('a workout opened under the wrong client is a 404, and a client cannot open the coach route', async ({ page, browser }) => {
    const workout = await prisma.workoutLog.create({ data: { clientId: target.id } });
    workoutIds.add(workout.id);
    const other = await prisma.user.findUniqueOrThrow({ where: { phone: '+989120000004' }, select: { id: true } });

    await signIn(page, 'fa', COACH.phone, COACH.password);
    const wrong = await page.goto(`/fa/coach/clients/${other.id}/workouts/${workout.id}`);
    expect(wrong?.status()).toBe(404);
    const missing = await page.goto(`/fa/coach/clients/${target.id}/workouts/does-not-exist`);
    expect(missing?.status()).toBe(404);

    const ctx = await browser.newContext();
    const clientPage = await ctx.newPage();
    await signIn(clientPage, 'fa', SEEDED_CLIENT.phone, SEEDED_CLIENT.password);
    await clientPage.goto(`/fa/coach/clients/${target.id}/workouts/${workout.id}`);
    await expect(clientPage).toHaveURL(/\/fa\/app$/); // bounced by the role gate; the page itself also calls requireCoach()
    await ctx.close();
  });

  test('on a phone the dock sits at the very bottom (the coach shell has no tab bar) and nothing scrolls sideways', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await ctx.newPage();
    await signIn(page, 'fa', COACH.phone, COACH.password);
    await page.goto(`/fa/coach/clients/${target.id}`);
    await page.getByRole('button', { name: 'شروع جلسه' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('radio').last()).toBeVisible(SLOW);
    await sheet.getByRole('radio').last().check(); // free workout
    await sheet.getByRole('button', { name: 'شروع', exact: true }).click();
    await page.waitForURL(new RegExp(`/workouts/.+`), SLOW);
    workoutIds.add(page.url().split('/workouts/')[1]);

    await page.getByRole('button', { name: 'افزودن حرکت' }).first().click();
    await page.getByRole('searchbox', { name: 'جست‌وجوی حرکت' }).fill('پرس سینه هالتر');
    await page.getByRole('dialog').getByRole('button', { name: /پرس سینه هالتر/ }).first().click();

    const box = await page.getByRole('button', { name: /^ثبت ست/ }).boundingBox();
    const viewportHeight = page.viewportSize()!.height;
    expect(box!.height).toBeGreaterThanOrEqual(56);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewportHeight);
    expect(viewportHeight - (box!.y + box!.height), 'no 3.5rem tab-bar gap under the Log button').toBeLessThanOrEqual(24);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // an empty workout is deleted from the finish dialog, and that returns to the client page
    await page.getByRole('button', { name: 'پایان تمرین' }).first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'حذف تمرین' }).click();
    await expect(page).toHaveURL(new RegExp(`/fa/coach/clients/${target.id}$`));
    await ctx.close();
  });
});
