import { PrismaClient } from '@prisma/client';
import { expect as baseExpect, test, type Page } from '@playwright/test';
import { startOfWeekKey, utcToZoned } from '../../src/lib/time';

/**
 * Booking end-to-end. Needs the app running with the seed (README) and, for the tests that plant rows,
 * DATABASE_URL pointing at the SAME database the server uses (those tests skip themselves otherwise).
 *
 *   DATABASE_URL=... E2E_BASE_URL=http://localhost:3201 npx playwright test tests/e2e/booking.spec.ts
 *
 * Seeded accounts (prisma/seed.ts). Client 6 (Behnam Akbari) has no live bookings, so the flow below
 * never runs into the 3-booking cap; every booking the tests create carries the E2E note and is removed
 * (cancelled through the UI, then deleted) when the run ends.
 * Friday is the coach's day off, so slots are always picked from a later week rather than "today".
 */
// A dev server compiles routes and server actions on first use, so allow generous waits.
const expect = baseExpect.configure({ timeout: 30_000 });
test.beforeEach(async ({ page: _page }, testInfo) => {
  testInfo.setTimeout(120_000);
});

const COACH = { phone: '09120000000', password: 'coach-pass-1234' };
const CLIENT = { phone: '09120000006', password: 'client-pass-1234', name: 'Behnam Akbari' };
const OTHER_CLIENT_PHONE = '+989120000001';
const NOTE = 'e2e-booking-note';
const TZ = 'Asia/Tehran';
const QA = process.env.QA_SHOTS ? '.qa/booking' : null;

async function login(page: Page, locale: 'fa' | 'en', who: { phone: string; password: string }) {
  await page.goto(`/${locale}/login`);
  await page.locator('input[name=phone]').fill(who.phone);
  await page.locator('input[name=password]').fill(who.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(/\/(app|coach)(\/|$)/);
}

/** The Saturday-first week (fa) a slot start falls in, as ?week=YYYY-MM-DD. */
const weekOf = (startMs: number) => startOfWeekKey(utcToZoned(new Date(startMs), TZ).dateKey, 'fa');

let prisma: PrismaClient | null = null;
async function db(): Promise<PrismaClient | null> {
  if (!process.env.DATABASE_URL) return null;
  if (!prisma) prisma = new PrismaClient();
  try {
    await prisma.user.count();
    return prisma;
  } catch {
    return null;
  }
}

async function cleanup() {
  const client = await db();
  if (!client) return;
  await client.booking.deleteMany({ where: { OR: [{ clientNote: { startsWith: 'e2e-' } }] } });
  await client.timeOff.deleteMany({ where: { reason: { startsWith: 'e2e-' } } });
  // the one window the availability test adds on a Friday (Friday is off in the seed)
  await client.availabilityRule.deleteMany({ where: { weekday: 5, startMinute: 630, endMinute: 750 } });
}

test.beforeAll(cleanup);
test.afterAll(async () => {
  await cleanup();
  await prisma?.$disconnect();
});

// -------------------------------------------------------------------------------------------------
// the whole booking life cycle
// -------------------------------------------------------------------------------------------------

test.describe.serial('book -> confirm -> cancel', () => {
  let startMs = 0;

  test('a client books an open slot in fa and sees it pending', async ({ page }) => {
    await login(page, 'fa', CLIENT);
    await page.goto('/fa/app/book');
    await expect(page).toHaveTitle(/رزرو جلسه/);

    const grid = page.getByRole('grid', { name: 'جدول هفتگی' });
    await expect(grid).toBeVisible();

    // the second bookable week: at least a week away, so notice and the cancel window cannot interfere
    await page.getByRole('button', { name: 'هفته‌ی بعد' }).click();
    const open = grid.locator('button[data-tone=open]');
    await expect(open.first()).toBeVisible();
    const cell = open.last();
    startMs = Number(await cell.getAttribute('data-start'));
    expect(startMs).toBeGreaterThan(Date.now());
    await expect(cell).toHaveAccessibleName(/آزاد\. برای رزرو بزن/);

    await cell.click();
    const sheet = page.getByRole('dialog', { name: 'تأیید رزرو' });
    await expect(sheet).toBeVisible();
    // the cancel policy line is built from the settings (24 h in the seed)
    await expect(sheet).toContainText('۲۴ ساعت قبل از جلسه می‌توانی رایگان لغو کنی');
    await sheet.getByLabel('یادداشت برای مربی').fill(NOTE);
    await sheet.getByRole('button', { name: 'رزرو این ساعت' }).click();

    // the stamp lands: requireApproval is on in the seed, so the words are "request sent"
    const done = page.getByRole('dialog', { name: 'درخواست ثبت شد' });
    await expect(done).toBeVisible();
    const stamp = done.getByRole('status').getByText('درخواست ثبت شد');
    await expect(stamp).toBeVisible();
    await expect(stamp).toHaveClass(/stamp-land/);
    if (QA) await page.screenshot({ path: `${QA}/sheet-stamp-fa-light-1280.png` });

    await done.getByRole('button', { name: 'تمام' }).click();
    await expect(done).toBeHidden();
    // the grid updated without a reload: the slot is now the client's own pending session
    const mine = grid.locator(`button[data-start="${startMs}"]`);
    await expect(mine).toHaveAttribute('data-tone', 'pending');
    await expect(mine).toHaveAccessibleName(/جلسه‌ی تو؛ منتظر تأیید من/);
    await expect(page.getByText('۳ از ۳ جلسه‌ی پیش‌رو')).toBeHidden(); // 1 of 3, not 3 of 3
  });

  test('the coach confirms it on the schedule', async ({ page }) => {
    test.skip(!startMs, 'the booking step did not run');
    await login(page, 'fa', COACH);
    await page.goto(`/fa/coach/schedule?week=${weekOf(startMs)}`);
    const cell = page.locator(`[role=grid] button[data-start="${startMs}"]`);
    await expect(cell).toHaveAttribute('data-tone', 'pending');
    await expect(cell).toContainText(CLIENT.name); // the coach sees names (clients never do)

    // coach wording: states are about the booking, never "your session"
    const legend = page.getByRole('list', { name: 'راهنما' });
    for (const word of ['آزاد', 'در انتظار تأیید', 'تأیید شده', 'انجام شد', 'غیبت', 'مرخصی']) {
      await expect(legend).toContainText(word);
    }
    await expect(legend).not.toContainText('جلسه‌ی تو');
    await expect(cell).toHaveAccessibleName(/در انتظار تأیید/);

    await cell.click();
    const sheet = page.getByRole('dialog', { name: CLIENT.name });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(NOTE);
    await expect(sheet).toContainText('در انتظار تأیید'); // the stamp
    await sheet.getByRole('button', { name: 'تأیید', exact: true }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText('تأیید شد.')).toBeVisible();
    await expect(cell).toHaveAttribute('data-tone', 'confirmed');
    if (QA) await page.screenshot({ path: `${QA}/coach-confirmed-fa-light-1280.png` });
  });

  test('the client sees it confirmed and cancels it outside the window', async ({ page }) => {
    test.skip(!startMs, 'the booking step did not run');
    await login(page, 'fa', CLIENT);
    await page.goto('/fa/app/bookings');

    const card = page.getByRole('listitem').filter({ hasText: NOTE });
    await expect(card).toHaveCount(1);
    await expect(card.getByText('تأیید شد')).toBeVisible();
    // far outside the 24 h window: Cancel is offered, the "call me" fallback is not
    await expect(card.getByTestId('cancel-late')).toHaveCount(0);
    if (QA) await page.screenshot({ path: `${QA}/bookings-fa-light-1280.png` });

    await card.getByRole('button', { name: 'لغو جلسه' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'این جلسه لغو شود؟' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'لغو جلسه' }).click();
    await expect(page.getByText('جلسه لغو شد.')).toBeVisible();

    // it moves to the past list with a cancelled stamp, and the slot is bookable again
    const past = page.getByRole('listitem').filter({ hasText: NOTE });
    await expect(past.getByText('لغو شد')).toBeVisible();
    await expect(past.getByRole('button', { name: 'لغو جلسه' })).toHaveCount(0);
    await page.goto('/fa/app/book');
    await page.getByRole('button', { name: 'هفته‌ی بعد' }).click();
    await expect(page.locator(`[role=grid] button[data-start="${startMs}"]`)).toHaveAttribute('data-tone', 'open');
  });
});

// -------------------------------------------------------------------------------------------------
// rules the UI must enforce, with rows planted straight into the database
// -------------------------------------------------------------------------------------------------

test('inside the cancel window the Cancel button is replaced by the coach contact', async ({ page }) => {
  const client = await db();
  test.skip(!client, 'needs DATABASE_URL pointing at the server database');
  const user = await client!.user.findUniqueOrThrow({ where: { phone: '+989120000006' } });
  // 3 h from now, on the hour: well inside the 24 h window
  const startsAt = new Date(Math.ceil((Date.now() + 3 * 3_600_000) / 3_600_000) * 3_600_000);
  await client!.booking.create({
    data: {
      clientId: user.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      status: 'CONFIRMED',
      clientNote: 'e2e-cancel-window',
    },
  });

  await login(page, 'fa', CLIENT);
  await page.goto('/fa/app/bookings');
  const card = page.getByRole('listitem').filter({ hasText: 'e2e-cancel-window' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'لغو جلسه' })).toHaveCount(0);
  const late = card.getByTestId('cancel-late');
  await expect(late).toContainText('آنلاین لغو نمی‌شود');
  const tel = late.getByRole('link');
  await expect(tel).toHaveAttribute('href', 'tel:+989120000000');
  await expect(tel).toHaveAttribute('dir', 'ltr');
  // a CONFIRMED session inside the window has no withdraw button either
  await expect(card.getByRole('button', { name: 'پس گرفتن درخواست' })).toHaveCount(0);
  if (QA) await page.screenshot({ path: `${QA}/bookings-late-fa-light-1280.png` });
  await client!.booking.deleteMany({ where: { clientNote: 'e2e-cancel-window' } });
});

test('a PENDING request can be withdrawn even inside the cancel window', async ({ page }) => {
  const client = await db();
  test.skip(!client, 'needs DATABASE_URL pointing at the server database');
  const user = await client!.user.findUniqueOrThrow({ where: { phone: '+989120000006' } });
  // 5 h from now, on the hour: inside the 24 h window, where a CONFIRMED booking could no longer be cancelled
  const startsAt = new Date(Math.ceil((Date.now() + 5 * 3_600_000) / 3_600_000) * 3_600_000);
  const row = await client!.booking.create({
    data: {
      clientId: user.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      status: 'PENDING',
      clientNote: 'e2e-withdraw',
    },
  });

  await login(page, 'fa', CLIENT);
  await page.goto('/fa/app/bookings');
  const card = page.getByRole('listitem').filter({ hasText: 'e2e-withdraw' });
  await expect(card).toBeVisible();
  // no "call the coach" fallback and no "cancel session": the coach has not committed to it yet
  await expect(card.getByTestId('cancel-late')).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'لغو جلسه' })).toHaveCount(0);
  const withdraw = card.getByRole('button', { name: 'پس گرفتن درخواست' });
  await expect(withdraw).toBeVisible();
  if (QA) await page.screenshot({ path: `${QA}/bookings-pending-withdraw-fa-light-1280.png` });

  await withdraw.click();
  const dialog = page.getByRole('alertdialog', { name: 'این درخواست پس گرفته شود؟' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'پس گرفتن درخواست' }).click();
  await expect(page.getByText('درخواست پس گرفته شد.')).toBeVisible();
  await expect(card.getByText('لغو شد')).toBeVisible(); // now in the past list, stamped cancelled
  await expect(card.getByRole('button')).toHaveCount(0);

  const after = await client!.booking.findUniqueOrThrow({ where: { id: row.id } });
  expect(after.status).toBe('CANCELLED');
  expect(after.cancelledByCoach).toBe(false);
  await client!.booking.deleteMany({ where: { clientNote: 'e2e-withdraw' } });
});

test('losing the race shows "just taken" inline and nothing is double booked', async ({ page }) => {
  const client = await db();
  test.skip(!client, 'needs DATABASE_URL pointing at the server database');
  await login(page, 'fa', CLIENT);
  await page.goto('/fa/app/book');
  await page.getByRole('button', { name: 'هفته‌ی بعد' }).click();
  const cell = page.locator('[role=grid] button[data-tone=open]').last();
  const start = Number(await cell.getAttribute('data-start'));
  await cell.click();
  const sheet = page.getByRole('dialog', { name: 'تأیید رزرو' });
  await expect(sheet).toBeVisible();

  // someone else books the very same slot while the sheet is open
  const other = await client!.user.findUniqueOrThrow({ where: { phone: OTHER_CLIENT_PHONE } });
  await client!.booking.create({
    data: {
      clientId: other.id,
      startsAt: new Date(start),
      endsAt: new Date(start + 3_600_000),
      status: 'PENDING',
      clientNote: 'e2e-race',
    },
  });

  await sheet.getByRole('button', { name: 'رزرو این ساعت' }).click();
  await expect(sheet.getByRole('alert')).toContainText('همین حالا رزرو شد');
  await expect(sheet.getByRole('button', { name: 'رزرو این ساعت' })).toBeDisabled();
  if (QA) await page.screenshot({ path: `${QA}/sheet-taken-fa-light-1280.png` });
  await sheet.getByRole('button', { name: 'ساعت دیگری انتخاب کن' }).click();
  // the grid refreshed: that slot is taken now
  await expect(page.locator(`[role=grid] button[data-start="${start}"]`)).toHaveAttribute('data-tone', 'taken');
  expect(await client!.booking.count({ where: { startsAt: new Date(start), status: { in: ['PENDING', 'CONFIRMED'] } } })).toBe(1);
  await client!.booking.deleteMany({ where: { clientNote: 'e2e-race' } }); // so it does not count toward client 1's cap below
});

test('a client cannot hold more than 3 upcoming sessions', async ({ page }) => {
  const client = await db();
  test.skip(!client, 'needs DATABASE_URL pointing at the server database');
  await cleanup();
  // client 1 already has 2 confirmed sessions in the seed: plant a third
  const user = await client!.user.findUniqueOrThrow({ where: { phone: '+989120000001' } });
  const live = await client!.booking.count({
    where: { clientId: user.id, status: { in: ['PENDING', 'CONFIRMED'] }, startsAt: { gt: new Date() } },
  });
  test.skip(live !== 2, `seed drifted: expected 2 live bookings for client 1, found ${live}`);
  const startsAt = new Date(Date.now() + 40 * 24 * 3_600_000);
  startsAt.setUTCMinutes(0, 0, 0);
  await client!.booking.create({
    data: {
      clientId: user.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      status: 'CONFIRMED',
      clientNote: 'e2e-cap',
    },
  });
  await login(page, 'fa', { phone: '09120000001', password: CLIENT.password });
  await page.goto('/fa/app/book');
  await expect(page.getByText('۳ از ۳ جلسه‌ی پیش‌رو')).toBeVisible();
  await page.getByRole('button', { name: 'هفته‌ی بعد' }).click();
  await page.locator('[role=grid] button[data-tone=open]').last().click();
  const sheet = page.getByRole('dialog', { name: 'تأیید رزرو' });
  await expect(sheet).toContainText('سه جلسه‌ی پیش‌رو داری');
  await expect(sheet.getByRole('button', { name: 'رزرو این ساعت' })).toBeDisabled();
});

// -------------------------------------------------------------------------------------------------
// the timetable itself
// -------------------------------------------------------------------------------------------------

test('fa: Saturday is the rightmost column, Friday is the shaded weekend, every slot is a labelled button', async ({
  page,
}) => {
  await login(page, 'fa', CLIENT);
  await page.goto('/fa/app/book');
  const grid = page.getByRole('grid', { name: 'جدول هفتگی' });
  const sat = grid.getByRole('columnheader', { name: /شنبه/ }).first();
  const fri = grid.getByRole('columnheader', { name: /جمعه/ });
  const satBox = (await sat.boundingBox())!;
  const friBox = (await fri.boundingBox())!;
  expect(satBox.x).toBeGreaterThan(friBox.x); // RTL: Saturday on the right, Friday on the left
  await expect(fri).toContainText('تعطیل');
  expect(page.url()).toContain('/fa/');
  expect(await page.locator('html').getAttribute('dir')).toBe('rtl');

  const buttons = grid.getByRole('button');
  const n = await buttons.count();
  expect(n).toBeGreaterThan(10);
  for (const i of [0, Math.floor(n / 2), n - 1]) {
    const name = (await buttons.nth(i).getAttribute('aria-label')) ?? '';
    expect(name.length).toBeGreaterThan(15); // day, time and state, not just a word
  }
  // touch targets >= 44px
  const box = (await grid.locator('button[data-tone=open]').first().boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  if (QA) await page.screenshot({ path: `${QA}/book-fa-light-1280.png` });
});

test('arrow keys move between slots, mirrored in RTL', async ({ page }) => {
  await login(page, 'fa', CLIENT);
  await page.goto('/fa/app/book');
  await page.getByRole('button', { name: 'هفته‌ی بعد' }).click();
  const open = page.locator('[role=grid] button[data-tone=open]');
  const first = open.first();
  await first.focus();
  const x0 = (await first.boundingBox())!.x;
  const s0 = Number(await first.getAttribute('data-start'));
  await page.keyboard.press('ArrowLeft'); // visually left = the next day in RTL
  const moved = page.locator('[role=grid] button:focus');
  expect(Number(await moved.getAttribute('data-start'))).toBeGreaterThan(s0);
  expect((await moved.boundingBox())!.x).toBeLessThan(x0);
  await page.keyboard.press('ArrowRight');
  expect(Number(await page.locator('[role=grid] button:focus').getAttribute('data-start'))).toBe(s0);
  await page.keyboard.press('ArrowDown');
  expect(Number(await page.locator('[role=grid] button:focus').getAttribute('data-start'))).toBeGreaterThan(s0);
});

test('en: Monday-first week, English copy and the policy line', async ({ page }) => {
  await login(page, 'en', { phone: '09120000004', password: CLIENT.password });
  await page.goto('/en/app/book');
  await expect(page).toHaveTitle(/Book a session/);
  await expect(page.getByRole('heading', { name: 'Book a session', level: 1 })).toBeVisible();
  const heads = page.getByRole('grid').getByRole('columnheader');
  await expect(heads.nth(1)).toContainText('Mon');
  await expect(heads.nth(7)).toContainText('Sun');
  expect(await page.locator('html').getAttribute('dir')).toBe('ltr');
  await expect(page.getByRole('grid').getByText('Weekend')).toHaveCount(0); // no highlighted weekend in en

  await page.getByRole('button', { name: 'Next week' }).click();
  const cell = page.locator('[role=grid] button[data-tone=open]').last();
  await expect(cell).toHaveAccessibleName(/Open\. Press to book\./);
  await cell.click();
  const sheet = page.getByRole('dialog', { name: 'Confirm booking' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('Cancel for free up to 24 hours before the session');
  await expect(sheet.getByRole('button', { name: 'Book this slot' })).toBeEnabled();
  if (QA) await page.screenshot({ path: `${QA}/sheet-en-light-1280.png` });
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  if (QA) await page.screenshot({ path: `${QA}/book-en-light-1280.png` });
});

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('day strip + slot list, a slot opens the sheet', async ({ page }) => {
    await login(page, 'fa', CLIENT);
    await page.goto('/fa/app/book');
    await expect(page.getByRole('grid')).toBeHidden(); // the week grid is the desktop layout
    const days = page.getByRole('group', { name: 'روزهای هفته' }).getByRole('button');
    await expect(days).toHaveCount(7);
    // no horizontal page scroll
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const day = days.nth(1);
    await day.click();
    await expect(day).toHaveAttribute('aria-pressed', 'true');
    const slot = page.getByRole('list', { name: 'جدول هفتگی' }).getByRole('button').first();
    await expect(slot).toBeVisible();
    expect((await slot.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    if (QA) await page.screenshot({ path: `${QA}/book-fa-light-390.png` });
    const openSlot = page.locator('ul[aria-label="جدول هفتگی"] button[data-tone=open]').first();
    if (await openSlot.count()) {
      await openSlot.click();
      await expect(page.getByRole('dialog', { name: 'تأیید رزرو' })).toBeVisible();
      if (QA) await page.screenshot({ path: `${QA}/sheet-fa-light-390.png` });
    }
  });
});

test('no console errors on the booking pages', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await login(page, 'fa', CLIENT);
  await page.goto('/fa/app/book');
  await page.getByRole('grid').waitFor();
  await page.goto('/fa/app/bookings');
  await page.getByRole('heading', { name: 'جلسه‌های من' }).waitFor();
  await page.context().clearCookies();
  await login(page, 'fa', COACH);
  await page.goto('/fa/coach/schedule');
  await page.getByRole('grid').waitFor();
  expect(errors).toEqual([]);
});

// -------------------------------------------------------------------------------------------------
// coach: schedule tools
// -------------------------------------------------------------------------------------------------

test.describe.serial('coach schedule tools', () => {
  test('availability editor: Persian digits, validation, add and remove a window', async ({ page }) => {
    await login(page, 'fa', COACH);
    await page.goto('/fa/coach/schedule');
    await page.getByRole('tab', { name: 'ساعت کاری' }).click();

    // Friday has no window in the seed: add 10:30 to 12:30 typed with Persian digits
    const friday = page.getByRole('region', { name: 'جمعه' });
    await expect(friday).toContainText('تعطیل');
    await friday.getByLabel(/شروع بازه/).fill('۱۰:۳۰');
    await friday.getByLabel(/پایان بازه/).fill('۱۲:۳۰');
    await friday.getByRole('button', { name: /افزودن بازه/ }).click();
    await expect(page.getByText('ساعت کاری ذخیره شد.')).toBeVisible();
    await expect(friday.getByLabel(/شروع بازه‌ی ۱/)).toHaveValue('۱۰:۳۰');
    await expect(friday).toContainText('۲ جلسه');
    if (QA) await page.screenshot({ path: `${QA}/availability-fa-light-1280.png`, fullPage: true });

    // end before start, and an overlap, are refused with a message next to the field
    const saturday = page.getByRole('region', { name: 'شنبه' });
    const addRow = saturday.getByRole('listitem').last();
    await addRow.getByLabel(/شروع بازه/).fill('۰۹:۰۰');
    await addRow.getByLabel(/پایان بازه/).fill('۰۸:۰۰');
    await addRow.getByRole('button', { name: /افزودن بازه/ }).click();
    await expect(addRow.getByRole('alert')).toContainText('پایان باید بعد از شروع باشد');
    await addRow.getByLabel(/پایان بازه/).fill('۱۰:۰۰');
    await addRow.getByRole('button', { name: /افزودن بازه/ }).click();
    await expect(addRow.getByRole('alert')).toContainText('هم‌پوشانی');

    // remove the Friday window again
    await friday.getByRole('button', { name: /حذف بازه/ }).click();
    await expect(page.getByText('بازه حذف شد.')).toBeVisible();
    await expect(friday).toContainText('تعطیل');
  });

  test('time off: add (date range + reason) and remove', async ({ page }) => {
    await login(page, 'fa', COACH);
    await page.goto('/fa/coach/schedule');
    await page.getByRole('tab', { name: 'مرخصی' }).click();
    await page.getByLabel('دلیل').fill('e2e-timeoff');
    await page.getByRole('button', { name: 'ثبت مرخصی' }).click();
    await expect(page.getByText('مرخصی ثبت شد.')).toBeVisible();
    const row = page.getByRole('listitem').filter({ hasText: 'e2e-timeoff' });
    await expect(row).toBeVisible();
    if (QA) await page.screenshot({ path: `${QA}/timeoff-fa-light-1280.png`, fullPage: true });
    await row.getByRole('button', { name: /حذف مرخصی/ }).click();
    await expect(page.getByText('مرخصی حذف شد.')).toBeVisible();
    await expect(row).toHaveCount(0);
  });

  test('book for a client, then move and cancel it', async ({ page }) => {
    await login(page, 'fa', COACH);
    await page.goto('/fa/coach/schedule');
    await page.getByRole('button', { name: 'رزرو برای شاگرد' }).click();
    const sheet = page.getByRole('dialog', { name: 'رزرو برای شاگرد' });
    await sheet.getByLabel('شاگرد').selectOption({ label: CLIENT.name });
    const slotSelect = sheet.getByLabel('ساعت');
    await slotSelect.selectOption({ index: 1 });
    const startMs = Number(await slotSelect.inputValue());
    await sheet.getByLabel('یادداشت برای مربی').fill('e2e-coach-booking');
    await sheet.getByRole('button', { name: 'ثبت جلسه' }).click();
    await expect(page.getByText(`برای ${CLIENT.name} ثبت شد.`)).toBeVisible();

    await page.goto(`/fa/coach/schedule?week=${weekOf(startMs)}`);
    const cell = page.locator(`[role=grid] button[data-start="${startMs}"]`);
    await expect(cell).toHaveAttribute('data-tone', 'confirmed'); // coach bookings need no approval
    await cell.click();
    const detail = page.getByRole('dialog', { name: CLIENT.name });

    // move it to the next open slot
    const target = detail.getByLabel('انتقال به');
    await target.selectOption({ index: 1 });
    const movedMs = Number(await target.inputValue());
    await detail.getByRole('button', { name: 'جابه‌جایی', exact: true }).click();
    await expect(page.getByText('جلسه جابه‌جا شد.')).toBeVisible();
    await page.goto(`/fa/coach/schedule?week=${weekOf(movedMs)}`);
    const moved = page.locator(`[role=grid] button[data-start="${movedMs}"]`);
    await expect(moved).toHaveAttribute('data-tone', 'confirmed');
    await expect(moved).toContainText(CLIENT.name);

    // cancel it (asks first)
    await moved.click();
    await page.getByRole('dialog', { name: CLIENT.name }).getByRole('button', { name: 'لغو جلسه' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'این جلسه لغو شود؟' });
    await confirm.getByRole('button', { name: 'لغو جلسه' }).click();
    await expect(page.getByText('لغو شد.')).toBeVisible();
    await expect(moved).toHaveAttribute('data-tone', 'open');
    if (QA) await page.screenshot({ path: `${QA}/coach-schedule-fa-light-1280.png` });
  });
});

test.describe('coach schedule on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('week view collapses to day strip + list', async ({ page }) => {
    await login(page, 'fa', COACH);
    await page.goto('/fa/coach/schedule?week=2026-10-24');
    await expect(page.getByRole('grid')).toBeHidden();
    await expect(page.getByRole('group', { name: 'روزهای هفته' }).getByRole('button')).toHaveCount(7);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (QA) await page.screenshot({ path: `${QA}/coach-schedule-fa-light-390.png`, fullPage: true });
  });
});
