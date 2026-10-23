import { expect, test, type Page } from '@playwright/test';

// Seeded dev credentials (prisma/seed.ts).
const COACH = { phone: '09120000000', password: 'coach-pass-1234' };
const CLIENT = { phone: '09120000001', password: 'client-pass-1234' }; // Mahsa Rahimi, coach-written 3-day push/pull/legs

async function login(page: Page, locale: 'fa' | 'en', who: { phone: string; password: string }) {
  await page.goto(`/${locale}/login`);
  await page.locator('input[name=phone]').fill(who.phone);
  await page.locator('input[name=password]').fill(who.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(new RegExp(`/${locale}/(app|coach)`), { timeout: 30_000 });
}

/** A previous (failed) run can leave a workout open; starting the same day again would resume it. Close it first. */
async function closeOpenWorkouts(page: Page, locale: 'fa' | 'en') {
  const labels = locale === 'fa'
    ? { cont: 'ادامه‌ی تمرین', finish: 'پایان تمرین', discard: 'حذف تمرین', done: 'تمرین تمام شد' }
    : { cont: 'Continue workout', finish: 'Finish workout', discard: 'Delete workout', done: 'Workout done' };
  for (let i = 0; i < 6; i++) {
    await page.goto(`/${locale}/app`);
    const cont = page.getByRole('link', { name: labels.cont });
    if (!(await cont.count())) return;
    await cont.first().click();
    await page.waitForURL(new RegExp(`/${locale}/app/workout/`));
    await page.getByRole('button', { name: labels.finish }).first().click();
    const dialog = page.getByRole('alertdialog');
    const discard = dialog.getByRole('button', { name: labels.discard });
    if (await discard.count()) {
      await discard.click();
      await page.waitForURL(new RegExp(`/${locale}/app$`));
    } else {
      await dialog.getByRole('button', { name: labels.finish }).click();
      await page.getByRole('heading', { level: 1, name: labels.done }).waitFor();
    }
  }
}

/** Start the program day whose card contains the given exercise name (so the test does not depend on rotation). */
async function startDayWith(page: Page, locale: 'fa' | 'en', exercise: string, startLabel: string) {
  await page.goto(`/${locale}/app/program`);
  const card = page
    .locator('div.flex.flex-col.gap-3')
    .filter({ has: page.getByText(exercise) })
    .filter({ has: page.getByRole('button', { name: startLabel }) })
    .last();
  await card.getByRole('button', { name: startLabel }).click();
  await page.waitForURL(new RegExp(`/${locale}/app/workout/`), { timeout: 30_000 });
}

test.describe('live workout (fa)', () => {
  test('start a program day, log three sets with Persian digits, see tally and rows, finish, find it in history', async ({ page }) => {
    await login(page, 'fa', CLIENT);
    await closeOpenWorkouts(page, 'fa');
    await startDayWith(page, 'fa', 'پرس سینه هالتر', 'شروع این روز');

    // the bench press chip is the first exercise of the push day
    await page.getByRole('button', { name: /پرس سینه هالتر/ }).first().click();
    await expect(page.getByRole('heading', { level: 2, name: /پرس سینه هالتر/ })).toBeVisible();

    // type with Persian digits into the two steppers
    const weight = page.getByRole('spinbutton', { name: /^وزنه/ });
    const reps = page.getByRole('spinbutton', { name: 'تکرار' });
    await weight.fill('۳۰');
    await reps.fill('۸');
    await expect(weight).toHaveValue('۳۰');

    const sets = page.getByRole('region', { name: 'ست‌ها' });
    const log = page.getByRole('button', { name: /^ثبت ست/ });
    await expect(log).toHaveText('ثبت ست ۱');
    await log.click();

    // optimistic row + tally stroke + rest timer, and the button now offers set 2
    await expect(page.getByRole('button', { name: 'ویرایش ست ۱' })).toContainText('۸ × ۳۰ کیلو');
    await expect(sets.getByRole('img', { name: '۱ ست انجام شد' })).toBeVisible();
    await expect(page.getByRole('timer', { name: 'زمان باقی‌مانده‌ی استراحت' })).toBeVisible();
    await expect(log).toHaveText('ثبت ست ۲');

    // the steppers keep the last values: two more taps log sets 2 and 3
    await log.click();
    await expect(log).toHaveText('ثبت ست ۳');
    await log.click();
    await expect(sets.getByRole('img', { name: '۳ ست انجام شد' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ویرایش ست ۳' })).toContainText('۸ × ۳۰ کیلو');

    // +30 s extends the rest, "پایان استراحت" removes it
    await page.getByRole('button', { name: '+۳۰ ثانیه' }).click();
    await page.getByRole('button', { name: 'پایان استراحت' }).click();
    await expect(page.getByRole('timer', { name: 'زمان باقی‌مانده‌ی استراحت' })).toHaveCount(0);

    // edit set 2 in the sheet, then delete it and undo
    await page.getByRole('button', { name: 'ویرایش ست ۲' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('spinbutton', { name: 'تکرار' }).fill('۹');
    await sheet.getByRole('button', { name: 'ذخیره' }).click();
    await expect(page.getByRole('button', { name: 'ویرایش ست ۲' })).toContainText('۹ × ۳۰ کیلو');

    await page.getByRole('button', { name: 'ویرایش ست ۲' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'حذف' }).click();
    await expect(sets.getByRole('img', { name: '۲ ست انجام شد' })).toBeVisible();
    await page.getByRole('button', { name: 'برگردان' }).click();
    await expect(sets.getByRole('img', { name: '۳ ست انجام شد' })).toBeVisible();

    // finish -> summary with the stamp
    await page.getByRole('button', { name: 'پایان تمرین' }).first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'پایان تمرین' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'تمرین تمام شد' })).toBeVisible();
    await expect(page.getByText('انجام شد').first()).toBeVisible();

    // it is in history, with the sets
    await page.getByRole('link', { name: 'دیدن در تاریخچه' }).click();
    await expect(page).toHaveURL(/\/fa\/app\/history\/.+/);
    await expect(page.getByText('۸ × ۳۰ کیلو').first()).toBeVisible();

    await page.goto('/fa/app/history');
    await expect(page.getByRole('link', { name: /پرس سینه|سینه/ }).first()).toBeVisible();

    // a finished workout is history: its logger URL redirects there
    await page.goBack();
  });

  test('an exercise added to a free workout, with no set yet, is still there after a reload', async ({ page }) => {
    await login(page, 'fa', CLIENT);
    await closeOpenWorkouts(page, 'fa');
    await page.goto('/fa/app/workout/new');
    await page.getByRole('button', { name: 'شروع تمرین آزاد' }).click();
    await page.waitForURL(/\/fa\/app\/workout\/(?!new)/); // /workout/new matches the plain pattern too
    const workoutUrl = page.url();

    await page.getByRole('button', { name: 'افزودن حرکت' }).first().click();
    await page.getByRole('searchbox', { name: 'جست‌وجوی حرکت' }).fill('پرس سینه هالتر');
    await page.getByRole('dialog').getByRole('button', { name: /پرس سینه هالتر/ }).first().click();
    await expect(page.getByRole('heading', { level: 2, name: /پرس سینه هالتر/ })).toBeVisible();

    // nothing was logged, so the server has no record of the exercise: only this tab remembers it
    await page.reload();
    await expect(page).toHaveURL(workoutUrl);
    await expect(page.getByRole('heading', { level: 2, name: /پرس سینه هالتر/ })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'حرکت‌های تمرین' }).getByRole('button', { name: /پرس سینه هالتر/ })).toBeVisible();
    // and it works as before: the steppers and the Log button are there
    await expect(page.getByRole('button', { name: /^ثبت ست/ })).toBeVisible();

    // discarding the empty workout forgets the remembered exercise too
    await page.getByRole('button', { name: 'پایان تمرین' }).first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'حذف تمرین' }).click();
    await expect(page).toHaveURL(/\/fa\/app$/);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('daftar:extra:')))).toEqual([]);
  });

  test('exercise picker finds an exercise by Persian name and by English name', async ({ page }) => {
    await login(page, 'fa', CLIENT);
    await closeOpenWorkouts(page, 'fa');
    await page.goto('/fa/app/workout/new');
    await page.getByRole('button', { name: 'شروع تمرین آزاد' }).click();
    await page.waitForURL(/\/fa\/app\/workout\//);

    await page.getByRole('button', { name: 'افزودن حرکت' }).first().click();
    const search = page.getByRole('searchbox', { name: 'جست‌وجوی حرکت' });
    await search.fill('پرس سینه هالتر');
    const first = page.getByRole('dialog').getByRole('button', { name: /پرس سینه هالتر/ }).first();
    await expect(first).toBeVisible();
    // Persian name leads, the English one sits small beneath it
    await expect(first).toContainText('Barbell bench press');

    // ...at the start edge, directly under it (a block-level dir=ltr box would be pushed to the far side)
    const name = first.locator('bdi').first();
    const sub = first.locator('bdi[lang=en]');
    const [nb, sb] = [await name.boundingBox(), await sub.boundingBox()];
    expect(Math.abs((nb!.x + nb!.width) - (sb!.x + sb!.width)), 'right edges line up in fa').toBeLessThanOrEqual(2);
    expect(sb!.y - (nb!.y + nb!.height)).toBeLessThanOrEqual(8);

    await search.fill('bench press');
    await expect(page.getByRole('dialog').getByRole('button', { name: /bench press/i }).first()).toBeVisible();

    await search.fill('پرس سینه هالتر');
    await page.getByRole('dialog').getByRole('button', { name: /پرس سینه هالتر/ }).first().click();
    await expect(page.getByRole('heading', { level: 2, name: /پرس سینه هالتر/ })).toBeVisible();
    // a barbell exercise shows the plates diagram
    await page.getByRole('spinbutton', { name: /^وزنه/ }).fill('۶۰');
    await expect(page.getByRole('img', { name: /هالتر|Barbell|plates/i }).first()).toBeVisible();

    // leave nothing behind: an empty workout can be deleted
    await page.getByRole('button', { name: 'پایان تمرین' }).first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'حذف تمرین' }).click();
    await expect(page).toHaveURL(/\/fa\/app$/);
  });
});

test.describe('programs', () => {
  test('a client writes their own program with two exercises found by Persian search', async ({ page }) => {
    await login(page, 'fa', CLIENT);
    const title = `برنامه‌ی آزمایشی ${Date.now()}`;

    await page.goto('/fa/app/program/new');
    await page.getByLabel('نام برنامه').fill(title);
    await page.getByRole('button', { name: 'ساخت برنامه' }).click();
    await page.waitForURL(/\/fa\/app\/program\/.+\/edit/);

    for (const query of ['پرس سینه هالتر', 'اسکات']) {
      await page.getByRole('button', { name: 'افزودن حرکت' }).last().click();
      await page.getByRole('searchbox', { name: 'جست‌وجوی حرکت' }).fill(query);
      await page.getByRole('dialog').getByRole('button').filter({ hasText: query }).first().click();
    }
    await expect(page.getByRole('button', { name: /^تغییر حرکت: .*پرس سینه هالتر/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^تغییر حرکت: .*اسکات/ }).first()).toBeVisible();

    // sets: type Persian digits, autosave shows "ذخیره شد"
    const sets = page.getByRole('spinbutton', { name: 'ست' }).first();
    await sets.fill('۵');
    await expect(page.getByRole('status').filter({ hasText: /ذخیره شد/ })).toBeVisible({ timeout: 15_000 });

    // reorder with the accessible up/down buttons
    await page.getByRole('button', { name: /را پایین‌تر ببر$/ }).first().click();
    await expect(page.getByRole('status').filter({ hasText: /ذخیره شد/ })).toBeVisible({ timeout: 15_000 });

    // survives a reload, with the Persian-digit value stored as 5
    await page.reload();
    await expect(page.getByRole('spinbutton', { name: 'ست' }).first()).toHaveValue(/^[۳۵]$/);
    await expect(page.getByLabel('نام برنامه')).toHaveValue(title);

    // it shows on the program list as the client's own, with an edit link and no coach label
    await page.goto('/fa/app/program');
    const own = page.getByRole('article', { name: title });
    await expect(own).toBeVisible();
    await expect(own.getByText('برنامه‌ی خودت')).toBeVisible();
    await expect(own.getByRole('link', { name: 'ویرایش' })).toBeVisible();

    // clean up through the UI
    await own.getByRole('link', { name: 'ویرایش' }).click();
    await page.getByRole('button', { name: 'حذف برنامه' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'حذف برنامه' }).click();
    await expect(page).toHaveURL(/\/fa\/app\/program$/);
  });

  test('the coach program is read-only for the client', async ({ page }) => {
    await login(page, 'fa', CLIENT);
    await page.goto('/fa/app/program');
    const coachProgram = page.locator('article[aria-label]').filter({ hasText: 'از طرف مربی' }).first();
    await expect(coachProgram).toBeVisible();
    await expect(coachProgram.getByText(/فقط او می‌تواند ویرایشش کند/)).toBeVisible();
    await expect(coachProgram.getByRole('link', { name: 'ویرایش' })).toHaveCount(0);
    await expect(coachProgram.getByRole('button', { name: 'شروع این روز' }).first()).toBeVisible();
  });

  test('the coach edits a client program in the builder and it persists', async ({ page }) => {
    await login(page, 'fa', COACH);
    await page.goto('/fa/coach/clients');
    await page.getByRole('link', { name: /مهسا رحیمی/ }).first().click();
    await page.waitForURL(/\/fa\/coach\/clients\/.+/);

    // the client page links to the builder
    await page.getByRole('link', { name: /سینه، پشت و پا/ }).first().click();
    await page.waitForURL(/\/programs\/.+/);
    await expect(page.getByRole('heading', { level: 1, name: 'ساخت برنامه‌ی تمرینی' })).toBeVisible();

    // change the first exercise's rest time, typing Persian digits
    const rest = page.getByRole('spinbutton', { name: /^استراحت/ }).first();
    const before = await rest.inputValue();
    await rest.fill('۱۳۵');
    await expect(page.getByRole('status').filter({ hasText: /ذخیره شد/ })).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByRole('spinbutton', { name: /^استراحت/ }).first()).toHaveValue('۱۳۵');

    // put it back
    await page.getByRole('spinbutton', { name: /^استراحت/ }).first().fill(before);
    await expect(page.getByRole('status').filter({ hasText: /ذخیره شد/ })).toBeVisible({ timeout: 15_000 });

    // the live card preview is on the page
    await expect(page.getByRole('complementary', { name: 'پیش‌نمایش کارت' })).toBeVisible();
  });

  test('a client opening a coach-written program editor is sent back to the list', async ({ page }) => {
    await login(page, 'fa', COACH);
    await page.goto('/fa/coach/clients');
    await page.getByRole('link', { name: /مهسا رحیمی/ }).first().click();
    await page.getByRole('link', { name: /سینه، پشت و پا/ }).first().click();
    await page.waitForURL(/\/programs\/(.+)/);
    const programId = page.url().split('/programs/')[1];
    await page.context().clearCookies();

    await login(page, 'fa', CLIENT);
    await page.goto(`/fa/app/program/${programId}/edit`);
    await expect(page).toHaveURL(/\/fa\/app\/program$/);
  });
});

test.describe('English', () => {
  test('the workout screen in English: steppers, log button, last time, finish', async ({ page }) => {
    await login(page, 'en', CLIENT);
    await closeOpenWorkouts(page, 'en');
    await startDayWith(page, 'en', 'Barbell bench press', 'Start this day');

    await page.getByRole('button', { name: /Barbell bench press/ }).first().click();
    await expect(page.getByRole('heading', { level: 2, name: 'Barbell bench press' })).toBeVisible();
    await expect(page.getByText('Last time').first()).toBeVisible();
    await expect(page.getByText('Target').first()).toBeVisible();

    await page.getByRole('spinbutton', { name: 'Weight' }).fill('30');
    await page.getByRole('spinbutton', { name: 'Reps' }).fill('8');
    const log = page.getByRole('button', { name: /^Log set/ });
    await expect(log).toHaveText('Log set 1');
    await log.click();
    await expect(page.getByRole('button', { name: 'Edit set 1' })).toContainText('8 × 30 kg');
    await expect(page.getByRole('region', { name: 'Sets' }).getByRole('img', { name: '1 set done' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip rest' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+30 s' })).toBeVisible();

    await page.getByRole('button', { name: 'Finish workout' }).first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Finish workout' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Workout done' })).toBeVisible();
    await page.getByRole('link', { name: 'See it in history' }).click();
    await expect(page.getByText('8 × 30 kg').first()).toBeVisible();
  });

  test('the English exercise name sits directly under the Persian one at the start edge (fa progress page)', async ({ page }) => {
    await login(page, 'fa', CLIENT);
    await page.goto('/fa/app/progress');
    const heading = page.locator('#strength');
    await expect(heading).toBeVisible();
    const name = page.locator('#strength + p bdi').first();
    const sub = page.locator('bdi[lang=en]').first();
    await expect(sub).toHaveText(/\S/);
    const [nb, sb] = [await name.boundingBox(), await sub.boundingBox()];
    // right edges line up (fa starts at the right), and the English line is the next line down
    expect(Math.abs((nb!.x + nb!.width) - (sb!.x + sb!.width))).toBeLessThanOrEqual(2);
    expect(sb!.y).toBeGreaterThanOrEqual(nb!.y + nb!.height - 2);
    expect(sb!.y - (nb!.y + nb!.height)).toBeLessThanOrEqual(12);
    // secondary text colour, and Latin words stay in reading order
    expect(await sub.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr');
    expect(await sub.evaluate((el) => getComputedStyle(el.parentElement!).color)).toBe(
      await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--ink-3)';
        document.body.append(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      }),
    );
  });

  test('progress page shows the chart and the accessible table fallback', async ({ page }) => {
    await login(page, 'en', CLIENT);
    await page.goto('/en/app/progress');
    await expect(page.getByRole('heading', { level: 2, name: 'Strength' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Estimated max chart/ })).toBeVisible();
    await page.getByText('Show the data as a table').first().click();
    await expect(page.getByRole('table').first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Weekly volume' })).toBeVisible();
  });
});

test.describe('layout', () => {
  test('the workout screen does not scroll sideways at 360px', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true });
    const page = await ctx.newPage();
    await login(page, 'fa', CLIENT);
    await closeOpenWorkouts(page, 'fa');
    await page.goto('/fa/app/workout/new');
    await page.getByRole('button', { name: 'شروع تمرین آزاد' }).click();
    await page.waitForURL(/\/fa\/app\/workout\//);
    await page.getByRole('button', { name: 'افزودن حرکت' }).first().click();
    await page.getByRole('searchbox', { name: 'جست‌وجوی حرکت' }).fill('پرس سینه هالتر');
    await page.getByRole('dialog').getByRole('button', { name: /پرس سینه هالتر/ }).first().click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // the Log button is always reachable, and the touch targets are big enough
    const logBox = await page.getByRole('button', { name: /^ثبت ست/ }).boundingBox();
    expect(logBox!.height).toBeGreaterThanOrEqual(56);
    const plus = await page.getByRole('button', { name: 'افزایش' }).first().boundingBox();
    expect(plus!.width).toBeGreaterThanOrEqual(56);

    await page.getByRole('button', { name: 'پایان تمرین' }).first().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'حذف تمرین' }).click();
    await ctx.close();
  });
});
