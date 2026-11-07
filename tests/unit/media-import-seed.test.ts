/**
 * The licensed-pack importer (file mapping, dry run, refusal, apply) and the seed's media / Persian-steps import
 * (idempotency, stale removal, never touching a coach's data), against a real database. The database parts are
 * skipped when DATABASE_URL is not a reachable migrated PostgreSQL. Pictures are generated; nothing from any
 * third-party pack is used.
 */
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedExerciseMedia, seedExercises, seedStepsFa } from '../../prisma/seed-shared';
import { applyImport, parseCliArgs, parsePackFileName, planImport, refusal } from '@/lib/media/importer';
import { mediaDir } from '@/lib/media/storage';

const prisma = new PrismaClient();
let dbUp = false;
try {
  if (process.env.DATABASE_URL) {
    await prisma.$connect();
    await prisma.exercise.count();
    dbUp = true;
  }
} catch {
  dbUp = false;
}

const png = (w = 64, h = 48, c = '#c33') => sharp({ create: { width: w, height: h, channels: 3, background: c } }).png().toBuffer();
async function gif() {
  const raw = Buffer.concat(await Promise.all(['#f00', '#0f0'].map((c) => sharp({ create: { width: 30, height: 20, channels: 3, background: c } }).raw().toBuffer())));
  return sharp(raw, { raw: { width: 30, height: 40, channels: 3, pageHeight: 20 } }).gif({ delay: [100, 100], loop: 0 }).toBuffer();
}

describe('pack file names', () => {
  it('maps <exerciseId>-<anything>.<ext>, padding the id to the ExerciseDB form', () => {
    expect(parsePackFileName('0025-barbell-bench-press.gif')).toEqual({ sourceId: '0025' });
    expect(parsePackFileName('25-front.JPG')).toEqual({ sourceId: '0025' });
    expect(parsePackFileName('1713-a.webp')).toEqual({ sourceId: '1713' });
    for (const bad of ['bench.gif', '0025.gif', '0025-.gif', '0025-x.svg', '0025-x.gif.exe', '../0025-x.gif', '123456-x.png', 'x-0025-y.png']) {
      expect(parsePackFileName(bad), bad).toBeNull();
    }
  });
});

describe('command line', () => {
  it('refuses without the licence flag, a folder, a source and a licence text', () => {
    const base = ['--dir', '/x', '--source', 'Acme', '--license', 'Order 1'];
    expect(refusal(parseCliArgs(base))).toMatch(/--i-have-a-license/);
    expect(refusal(parseCliArgs([...base, '--i-have-a-license']))).toBeNull();
    expect(refusal(parseCliArgs(['--i-have-a-license', '--source', 'a', '--license', 'b']))).toMatch(/--dir/);
    expect(refusal(parseCliArgs(['--i-have-a-license', '--dir', '/x', '--license', 'b']))).toMatch(/--source/);
    expect(refusal(parseCliArgs(['--i-have-a-license', '--dir', '/x', '--source', 'a']))).toMatch(/--license/);
  });
  it('is a dry run unless --apply', () => {
    expect(parseCliArgs(['--i-have-a-license']).apply).toBe(false);
    expect(parseCliArgs(['--apply']).apply).toBe(true);
    expect(() => parseCliArgs(['--nope'])).toThrow();
  });
});

describe('planImport (no database, nothing written)', () => {
  it('groups files per exercise and reports what it ignores', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pack-'));
    try {
      await writeFile(join(dir, '0025-b-back.png'), await png());
      await writeFile(join(dir, '0025-a-front.png'), await png(64, 48, '#33c'));
      await writeFile(join(dir, '0042-demo.gif'), await gif());
      await writeFile(join(dir, '0031-single.png'), await png());
      await writeFile(join(dir, 'readme.txt'), 'hi');
      await writeFile(join(dir, '9999-unknown.png'), await png());
      await writeFile(join(dir, '0030-fake.png'), 'this is text, not a png at all, really');
      const refs = ['0025', '0042', '0031', '0030'].map((s) => ({ id: `ex${s}`, sourceId: s, nameEn: `Exercise ${s}` }));
      const plan = await planImport(dir, refs);
      expect(plan.media.map((m) => [m.sourceId, m.kind, m.files])).toEqual([
        ['0025', 'FRAMES', ['0025-a-front.png', '0025-b-back.png']],
        ['0031', 'IMAGE', ['0031-single.png']],
        ['0042', 'GIF', ['0042-demo.gif']],
      ]);
      expect(plan.unnamed).toEqual(['readme.txt']);
      expect(plan.unknownExercise).toEqual(['9999-unknown.png']);
      expect(plan.rejected).toEqual([{ file: '0030-fake.png', reason: 'type' }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!dbUp)('importer apply and seeds (database)', () => {
  const tag = Date.now().toString().slice(-7);
  const created: string[] = [];
  let store: string;
  const savedDir = process.env.MEDIA_DIR;

  const makeExercise = async (sourceId: string, stepsEn: string[] = ['one', 'two']) => {
    const e = await prisma.exercise.create({
      data: { sourceId, nameEn: `Media test ${sourceId}`, bodyPart: 'chest', equipment: 'barbell', target: 'pectorals', secondaryMuscles: [], stepsEn, stepsFa: [], isCustom: true },
    });
    created.push(e.id);
    return e;
  };

  beforeAll(async () => {
    store = await mkdtemp(join(tmpdir(), 'media-store-'));
    process.env.MEDIA_DIR = store;
    await seedExercises(prisma); // the library the bundled-media seed maps onto
  });

  afterAll(async () => {
    await prisma.exercise.deleteMany({ where: { id: { in: created } } });
    await rm(store, { recursive: true, force: true });
    if (savedDir === undefined) delete process.env.MEDIA_DIR;
    else process.env.MEDIA_DIR = savedDir;
    await seedExerciseMedia(prisma); // put the real bundled rows back (a test below removes "stale" ones)
    await prisma.$disconnect();
  });

  it('imports a pack: dry run writes nothing, apply re-encodes into MEDIA_DIR, a re-run replaces', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pack-'));
    try {
      const ex = await makeExercise(`8${tag}`.slice(0, 5));
      const sid = ex.sourceId as string;
      await writeFile(join(dir, `${sid}-1.png`), await png());
      await writeFile(join(dir, `${sid}-2.png`), await png(64, 48, '#33c'));
      const plan = await planImport(dir, [{ id: ex.id, sourceId: sid, nameEn: ex.nameEn }]);
      expect(plan.media).toHaveLength(1);
      // dry run = planning only: no rows, no files
      expect(await prisma.exerciseMedia.count({ where: { exerciseId: ex.id } })).toBe(0);
      expect(existsSync(store) ? await readdir(store) : []).toEqual([]);

      const opts = { source: 'Test pack', license: 'Order #123', licenseUrl: null, sourceUrl: null };
      const r1 = await applyImport(prisma, dir, plan, opts);
      expect(r1).toMatchObject({ exercises: 1, created: 1, replaced: 0 });
      const rows = await prisma.exerciseMedia.findMany({ where: { exerciseId: ex.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: 'FRAMES', source: 'LICENSED', author: 'Test pack', license: 'Order #123', recolorable: false, modified: true });
      expect(rows[0].frames).toHaveLength(2);
      const files1 = (await readdir(store)).sort();
      expect(files1).toHaveLength(4); // 2 frames + 2 thumbnails
      for (const key of rows[0].frames) expect(files1).toContain(key);

      const r2 = await applyImport(prisma, dir, plan, opts);
      expect(r2).toMatchObject({ created: 1, replaced: 1 });
      expect(await prisma.exerciseMedia.count({ where: { exerciseId: ex.id } })).toBe(1);
      const files2 = await readdir(store);
      expect(files2).toHaveLength(4); // the first run's files are gone
      expect(files2.some((f) => files1.includes(f))).toBe(false);
      expect(mediaDir()).toBe(store);
    } finally {
      await rm(dir, { recursive: true, force: true });
      await mkdir(store, { recursive: true });
    }
  });

  it('seeds bundled media idempotently, refreshes changes, removes stale rows, never touches coach rows', async () => {
    const ex = await makeExercise(`7${tag}`.slice(0, 5));
    const sid = ex.sourceId as string;
    await prisma.exerciseMedia.create({ data: { exerciseId: ex.id, kind: 'IMAGE', frames: ['a'.repeat(32) + '.webp'], source: 'COACH', order: 0 } });
    const dir = await mkdtemp(join(tmpdir(), 'open-media-'));
    try {
      const file = join(dir, 'open-media.json');
      const entry = (license: string) => ({
        exerciseSourceId: sid,
        source: 'everkinetic',
        frames: [`/exercise-media/everkinetic/${sid}/1.webp`, `/exercise-media/everkinetic/${sid}/2.webp`],
        author: 'Greg Priday (Everkinetic)',
        license,
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        sourceUrl: 'https://github.com/everkinetic/data',
        modified: true,
      });
      await writeFile(file, JSON.stringify([entry('CC BY-SA 4.0'), { exerciseSourceId: 'nope', frames: ['/x/1.webp'] }, { exerciseSourceId: sid, frames: [] }]));
      const opts = { file, checkFiles: false };
      const mine = () => prisma.exerciseMedia.findMany({ where: { exerciseId: ex.id, source: 'BUNDLED_OPEN' } });

      const first = await seedExerciseMedia(prisma, opts);
      expect(first).toMatchObject({ found: true, created: 1, skipped: 2 });
      const rows = await mine();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: 'FRAMES', recolorable: true, modified: true, license: 'CC BY-SA 4.0' });

      const again = await seedExerciseMedia(prisma, opts);
      expect(again).toMatchObject({ created: 0, updated: 0, removed: 0 });
      expect((await mine())[0].id).toBe(rows[0].id);

      await writeFile(file, JSON.stringify([entry('CC BY-SA 4.0 (changed)')]));
      expect(await seedExerciseMedia(prisma, opts)).toMatchObject({ created: 0, updated: 1 });
      expect((await mine())[0].license).toBe('CC BY-SA 4.0 (changed)');

      await writeFile(file, '[]');
      const removed = await seedExerciseMedia(prisma, opts);
      expect(removed.removed).toBeGreaterThanOrEqual(1);
      expect(await mine()).toHaveLength(0);
      expect(await prisma.exerciseMedia.count({ where: { exerciseId: ex.id, source: 'COACH' } })).toBe(1);

      // a missing or broken file changes nothing
      expect(await seedExerciseMedia(prisma, { file: join(dir, 'missing.json') })).toMatchObject({ found: false });
      await writeFile(file, '{ not json');
      expect(await seedExerciseMedia(prisma, opts)).toMatchObject({ found: false });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('fills Persian steps only where empty, and only when they match the English steps', async () => {
    const a = await makeExercise(`6${tag}`.slice(0, 5), ['one', 'two']);
    const b = await makeExercise(`5${tag}`.slice(0, 5), ['one', 'two']);
    const c = await makeExercise(`4${tag}`.slice(0, 5), ['one', 'two']);
    await prisma.exercise.update({ where: { id: b.id }, data: { stepsFa: ['ویرایش مربی', 'دوم'] } });
    const steps = {
      [a.sourceId as string]: ['یک', 'دو'],
      [b.sourceId as string]: ['یک', 'دو'],
      [c.sourceId as string]: ['فقط یک'], // wrong length
      '00000': ['x'], // unknown
    };
    const r = await seedStepsFa(prisma, steps);
    expect(r).toMatchObject({ found: true, filled: 1, skipped: 2 });
    expect((await prisma.exercise.findUniqueOrThrow({ where: { id: a.id } })).stepsFa).toEqual(['یک', 'دو']);
    expect((await prisma.exercise.findUniqueOrThrow({ where: { id: b.id } })).stepsFa).toEqual(['ویرایش مربی', 'دوم']);
    expect((await prisma.exercise.findUniqueOrThrow({ where: { id: c.id } })).stepsFa).toEqual([]);
    expect(await seedStepsFa(prisma, steps)).toMatchObject({ filled: 0 }); // idempotent
    expect(await seedStepsFa(prisma, null)).toMatchObject({ found: false });
  });
});
