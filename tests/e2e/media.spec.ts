import { PrismaClient } from '@prisma/client';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

/**
 * Exercise demonstrations end to end: the "how to" sheet from the logger and the picker (fa and en), the flipbook
 * animating and pausing, reduced motion showing every frame, the coach uploading a demonstration that the client then
 * sees, a text file renamed .png being refused, and the /media route refusing traversal.
 * Needs the seeded database (the bundled line art is seeded from data/exercise-media/open-media.json).
 */
const COACH = { phone: '09120000000', password: 'coach-pass-1234' };
const CLIENT = { phone: '09120000001', password: 'client-pass-1234' };

const prisma = new PrismaClient();
const UPLOAD_EXERCISE = 'Dumbbell lateral raise'; // a push-day exercise of the seeded client
let uploadId = '';
let before: { frames: string[]; id: string }[] = [];

test.describe.configure({ mode: 'serial', timeout: 120_000 });

async function login(page: Page, locale: 'fa' | 'en', who: { phone: string; password: string }) {
  await page.goto(`/${locale}/login`);
  await page.locator('input[name=phone]').fill(who.phone);
  await page.locator('input[name=password]').fill(who.password);
  await page.locator('button[type=submit]').click();
  await page.waitForURL(new RegExp(`/${locale}/(app|coach)`), { timeout: 30_000 });
}

async function frame(color: string, w = 600, h = 400) {
  return sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
}

/** An open workout of the seeded client on the push day, created through the UI like a client would. */
async function openLogger(page: Page, locale: 'fa' | 'en') {
  const L = locale === 'fa' ? { cont: 'ادامه‌ی تمرین', start: 'شروع این روز', finish: 'پایان تمرین', discard: 'حذف تمرین' } : { cont: 'Continue workout', start: 'Start this day', finish: 'Finish workout', discard: 'Delete workout' };
  await page.goto(`/${locale}/app`);
  const cont = page.getByRole('link', { name: L.cont });
  if (await cont.count()) {
    await cont.first().click();
    await page.waitForURL(new RegExp(`/${locale}/app/workout/`));
    return;
  }
  await page.goto(`/${locale}/app/program`);
  const bench = locale === 'fa' ? 'پرس سینه هالتر' : 'Barbell bench press';
  const card = page
    .locator('div.flex.flex-col.gap-3')
    .filter({ has: page.getByText(bench) })
    .filter({ has: page.getByRole('button', { name: L.start }) })
    .last();
  await card.getByRole('button', { name: L.start }).click();
  await page.waitForURL(new RegExp(`/${locale}/app/workout/`), { timeout: 30_000 });
}

async function discardWorkout(page: Page, locale: 'fa' | 'en') {
  const L = locale === 'fa' ? { finish: 'پایان تمرین', discard: 'حذف تمرین' } : { finish: 'Finish workout', discard: 'Delete workout' };
  await page.getByRole('button', { name: L.finish }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: L.discard }).click();
  await page.waitForURL(new RegExp(`/${locale}/app$`));
}

test.beforeAll(async () => {
  const ex = await prisma.exercise.findFirstOrThrow({ where: { nameEn: UPLOAD_EXERCISE }, select: { id: true } });
  uploadId = ex.id;
  before = await prisma.exerciseMedia.findMany({ where: { exerciseId: uploadId, source: 'COACH' }, select: { id: true, frames: true } });
});

test.afterAll(async () => {
  // remove what the upload test added (the files stay in MEDIA_DIR, which is a throw-away directory in tests)
  await prisma.exerciseMedia.deleteMany({ where: { exerciseId: uploadId, source: 'COACH', id: { notIn: before.map((b) => b.id) } } });
  await prisma.$disconnect();
});

for (const locale of ['fa', 'en'] as const) {
  test.describe(`how-to sheet (${locale})`, () => {
    const T =
      locale === 'fa'
        ? { start: 'حالت شروع', pause: 'توقف نمایش حرکت', play: 'پخش نمایش حرکت', steps: 'مراحل اجرا', credit: /تصویر: اورکینتیک/, note: 'راهنما فعلاً به انگلیسی است', add: 'افزودن حرکت', title: 'انتخاب حرکت|افزودن حرکت' }
        : { start: 'start position', pause: 'Pause the demonstration', play: 'Play the demonstration', steps: 'Steps', credit: /Illustration: Everkinetic/, note: '', add: 'Add exercise', title: 'Add exercise' };

    test('opens from the live logger: demo animates, pauses, credit and steps are shown', async ({ page }) => {
      await login(page, locale, CLIENT);
      await openLogger(page, locale);
      // the current exercise has a demonstration thumbnail next to its name; the sheet opens from it
      const opener = page.getByTestId('exercise-info-button').first();
      await expect(opener.getByTestId('exercise-thumb')).toHaveAttribute('data-has-media', 'true');
      // the steppers stay on the first screen at 390 px
      await page.setViewportSize({ width: 390, height: 844 });
      const logBox = await page.getByRole('spinbutton').first().boundingBox();
      expect(logBox && logBox.y + logBox.height).toBeLessThan(844);
      await opener.click();

      const sheet = page.getByRole('dialog').last();
      await expect(sheet.getByTestId('exercise-demo')).toBeVisible();
      await expect(sheet.getByTestId('exercise-steps')).toBeVisible();
      await expect(sheet.getByTestId('media-credit')).toContainText(T.credit);
      await expect(sheet.getByRole('link', { name: /CC BY-SA 4/ })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by-sa/4.0/');
      await expect(sheet.getByTestId('exercise-steps')).toHaveAttribute('lang', locale === 'fa' ? 'fa' : 'en'); // bench press has Persian steps
      await expect(sheet.getByRole('heading', { name: T.steps })).toBeVisible();

      // it flips between the two frames, and the button pauses it
      const stage = sheet.locator('.demo-stage');
      await expect(stage).toHaveAttribute('data-frame', '0');
      await expect(stage).toHaveAttribute('data-frame', '1', { timeout: 4000 });
      await sheet.getByRole('button', { name: T.pause }).click();
      await expect(stage).toHaveAttribute('data-playing', 'false');
      const held = await stage.getAttribute('data-frame');
      await page.waitForTimeout(2600);
      expect(await stage.getAttribute('data-frame')).toBe(held);
      await sheet.getByRole('button', { name: T.play }).click();
      await expect(stage).toHaveAttribute('data-playing', 'true');
      await expect.poll(async () => stage.getAttribute('data-frame'), { timeout: 4000 }).not.toBe(held);

      // the control is at least 44 px
      const box = await sheet.getByTestId('demo-toggle').boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
      await discardWorkout(page, locale);
    });

    test('exercise without Persian steps: English steps, with the note in fa', async ({ page }) => {
      const ex = await prisma.exercise.findFirstOrThrow({
        where: { stepsFa: { isEmpty: true }, stepsEn: { isEmpty: false }, nameFa: { not: null }, archived: false, isCustom: false },
        select: { nameEn: true, nameFa: true },
      });
      await login(page, locale, CLIENT);
      await openLogger(page, locale);
      await page.getByRole('button', { name: T.add }).first().click();
      const picker = page.getByRole('dialog').last();
      const query = locale === 'fa' ? (ex.nameFa as string) : ex.nameEn;
      await picker.getByRole('searchbox').fill(query);
      await picker.locator('li').filter({ hasText: query }).getByTestId('exercise-info-button').first().click();
      const sheet = page.getByRole('dialog').last();
      const steps = sheet.getByTestId('exercise-steps');
      await expect(steps).toHaveAttribute('lang', 'en');
      if (locale === 'fa') await expect(sheet.getByTestId('steps-english-note')).toHaveText(T.note);
      else await expect(sheet.getByTestId('steps-english-note')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await discardWorkout(page, locale);
    });

    test('opens from the exercise picker row', async ({ page }) => {
      await login(page, locale, CLIENT);
      await openLogger(page, locale);
      await page.getByRole('button', { name: T.add }).first().click();
      const picker = page.getByRole('dialog').last();
      await picker.getByRole('searchbox').fill('barbell full squat');
      const row = picker.locator('li').filter({ hasText: locale === 'fa' ? /اسکات/ : /Barbell full squat/i }).first();
      await expect(row.getByTestId('exercise-thumb')).toBeVisible();
      await row.getByTestId('exercise-info-button').click();
      const sheet = page.getByRole('dialog').last();
      await expect(sheet.getByTestId('exercise-demo')).toBeVisible();
      await expect(sheet.getByTestId('exercise-steps')).toBeVisible();
      await page.keyboard.press('Escape');
      // the picker is still open underneath
      await expect(picker.getByRole('searchbox')).toBeVisible();
      await page.keyboard.press('Escape');
      await discardWorkout(page, locale);
    });
  });
}

test('reduced motion shows every frame, still and side by side', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await login(page, 'en', CLIENT);
  await openLogger(page, 'en');
  await page.getByTestId('exercise-info-button').first().click();
  const sheet = page.getByRole('dialog').last();
  const frames = sheet.locator('.demo-frame');
  await expect(frames).toHaveCount(2);
  await expect(sheet.getByTestId('demo-toggle')).toHaveCount(0);
  const [a, b] = await Promise.all([frames.nth(0).boundingBox(), frames.nth(1).boundingBox()]);
  expect(a && b && Math.abs(a.y - b.y) < 2 && Math.abs(a.x - b.x) > a.width / 2).toBe(true); // side by side
  for (const i of [0, 1]) await expect(frames.nth(i)).toHaveCSS('opacity', '1');
  await expect(sheet.locator('.demo-stage')).toHaveAttribute('data-frame', '0');
  await page.waitForTimeout(2500);
  await expect(sheet.locator('.demo-stage')).toHaveAttribute('data-frame', '0'); // nothing moves
  await page.keyboard.press('Escape');
  await discardWorkout(page, 'en');
  await context.close();
});

test('coach uploads two frames, the client sees them; junk renamed .png is refused', async ({ browser }) => {
  const coachCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const coach = await coachCtx.newPage();
  await login(coach, 'en', COACH);
  await coach.goto(`/en/coach/exercises?edit=${uploadId}`);
  const sheet = coach.getByRole('dialog').first();
  const manager = sheet.getByTestId('media-manager');
  await expect(manager).toBeVisible();
  await expect(manager.getByTestId('media-row')).toHaveCount(1); // the bundled drawing

  // a text file called .png is refused
  await manager.getByTestId('media-file-input').setInputFiles({ name: 'cat.png', mimeType: 'image/png', buffer: Buffer.from('this is plain text, not an image at all') });
  await manager.getByTestId('media-upload').click();
  await expect(manager.getByRole('alert')).toContainText('Only JPG, PNG, WebP and GIF images are accepted.');
  await expect(manager.getByTestId('media-row')).toHaveCount(1);

  // two real frames
  await manager.getByTestId('media-file-input').setInputFiles([
    { name: 'start.png', mimeType: 'image/png', buffer: await frame('#2b7a42') },
    { name: 'end.png', mimeType: 'image/png', buffer: await frame('#1d4c9f') },
  ]);
  await manager.getByTestId('media-upload').click();
  await expect(manager.getByTestId('media-row')).toHaveCount(2);
  await expect(manager.getByTestId('media-row').first().getByText('Shown first')).toBeVisible();

  const rows = await prisma.exerciseMedia.findMany({ where: { exerciseId: uploadId, source: 'COACH' }, orderBy: { createdAt: 'desc' } });
  expect(rows[0]).toMatchObject({ kind: 'FRAMES', recolorable: false });
  expect(rows[0].frames).toHaveLength(2);
  expect(rows[0].frames.every((f) => /^[a-f0-9]{32}\.webp$/.test(f))).toBe(true);

  // served with the right type and a long cache
  const res = await coach.request.get(`/media/${rows[0].frames[0]}`);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('image/webp');
  expect(res.headers()['cache-control']).toBe('public, max-age=31536000, immutable');

  // the client sees the new demonstration first, as plain pictures (no credit for the coach's own)
  const clientCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const client = await clientCtx.newPage();
  await login(client, 'en', CLIENT);
  await client.goto('/en/app/program');
  await client.getByRole('button', { name: `How to do ${UPLOAD_EXERCISE}` }).first().click();
  const info = client.getByRole('dialog').last();
  await expect(info.getByTestId('exercise-demo')).toBeVisible();
  await expect(info.getByTestId('media-credit')).toHaveCount(0);
  await expect(info.locator('.demo-frame img')).toHaveCount(2);
  await expect(info.locator('.demo-frame img').first()).toHaveAttribute('src', `/media/${rows[0].frames[0]}`);
  await expect(info.getByRole('group', { name: 'Demonstrations' })).toBeVisible();
  await clientCtx.close();

  // the coach makes the drawing the first one again, then deletes the upload
  await manager.getByTestId('media-row').nth(1).getByRole('button', { name: 'Show this one first' }).click();
  await expect.poll(async () => (await prisma.exerciseMedia.findFirstOrThrow({ where: { exerciseId: uploadId }, orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] })).source).toBe('BUNDLED_OPEN');
  await manager.getByTestId('media-row').nth(1).getByRole('button', { name: 'Delete this demonstration' }).click();
  await coach.getByRole('alertdialog').getByRole('button', { name: 'Delete demonstration' }).click();
  await expect(manager.getByTestId('media-row')).toHaveCount(1);
  await coachCtx.close();
});

test('dot segments are normalised away before the route (never a file read)', async ({ request }) => {
  const res = await request.get('/media/%2e%2e/%2e%2e/etc/passwd', { maxRedirects: 0 });
  expect([307, 308, 404]).toContain(res.status());
  expect(await res.text()).not.toContain('root:');
});

test('the media route refuses anything but a valid key', async ({ request }) => {
  const hex = 'a'.repeat(32);
  for (const path of [
    '/media/..%2f..%2fetc%2fpasswd',
    `/media/${hex}.png`,
    `/media/${hex}.webp/extra`,
    `/media/x/${hex}.webp`,
    `/media/${hex}`,
    '/media',
    `/media/${hex}.webp`, // valid shape, no such file
  ]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(404);
  }
});
