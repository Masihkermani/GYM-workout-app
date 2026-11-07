/**
 * Import of a purchased demonstration pack (`npm run media:import`). Pure planning (file names -> exercises)
 * plus the writer that re-encodes through the same pipeline as a coach upload and creates LICENSED rows.
 * Nothing here knows about any particular vendor: the licence text is whatever the owner passes in.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Prisma, PrismaClient } from '@prisma/client';
import { MAX_FILE_BYTES, MAX_FRAMES } from './constants';
import { MediaError, probeImage, processImage, type Probe } from './process';
import { removeStored, storeProcessed } from './storage';

/** `<exerciseId>-<anything>.(gif|jpg|jpeg|png|webp)`; the id is the ExerciseDB number, with or without zero padding. */
const FILE_NAME = /^(\d{1,5})-.+\.(gif|jpe?g|png|webp)$/i;

export function parsePackFileName(name: string): { sourceId: string } | null {
  const m = FILE_NAME.exec(name);
  return m ? { sourceId: m[1].padStart(4, '0') } : null;
}

export interface PlannedFile {
  file: string;
  probe: Probe;
}
export interface PlannedMedia {
  exerciseId: string;
  sourceId: string;
  exerciseName: string;
  kind: 'FRAMES' | 'GIF' | 'IMAGE';
  files: string[];
}
export interface ImportPlan {
  media: PlannedMedia[];
  /** names that do not look like `<id>-<anything>.<ext>` */
  unnamed: string[];
  /** well-formed names whose id is not an exercise of ours */
  unknownExercise: string[];
  /** files that are not decodable images, or too big / too long, with the reason */
  rejected: { file: string; reason: string }[];
}

export interface ExerciseRef {
  id: string;
  sourceId: string;
  nameEn: string;
}

/**
 * Group the files of `dir` by exercise. Per exercise, in file-name order: every animated image becomes its own
 * GIF demonstration, the still images together become one flipbook (2-8) or a single image.
 */
export async function planImport(dir: string, exercises: readonly ExerciseRef[]): Promise<ImportPlan> {
  const bySource = new Map(exercises.map((e) => [e.sourceId, e]));
  const names = (await readdir(dir, { withFileTypes: true })).filter((d) => d.isFile()).map((d) => d.name).sort();
  const plan: ImportPlan = { media: [], unnamed: [], unknownExercise: [], rejected: [] };
  const groups = new Map<string, { still: string[]; animated: string[] }>();

  for (const name of names) {
    const parsed = parsePackFileName(name);
    if (!parsed) {
      plan.unnamed.push(name);
      continue;
    }
    if (!bySource.has(parsed.sourceId)) {
      plan.unknownExercise.push(name);
      continue;
    }
    try {
      const buf = await readFile(join(dir, name));
      if (buf.length > MAX_FILE_BYTES) throw new MediaError('tooLarge');
      const probe = await probeImage(buf);
      const g = groups.get(parsed.sourceId) ?? { still: [], animated: [] };
      (probe.animated ? g.animated : g.still).push(name);
      groups.set(parsed.sourceId, g);
    } catch (e) {
      plan.rejected.push({ file: name, reason: e instanceof MediaError ? e.code : 'unreadable' });
    }
  }

  for (const [sourceId, g] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const ex = bySource.get(sourceId)!;
    const base = { exerciseId: ex.id, sourceId, exerciseName: ex.nameEn };
    for (const file of g.animated) plan.media.push({ ...base, kind: 'GIF', files: [file] });
    if (g.still.length > MAX_FRAMES) {
      for (const file of g.still.slice(MAX_FRAMES)) plan.rejected.push({ file, reason: 'mediaTooMany' });
    }
    const still = g.still.slice(0, MAX_FRAMES);
    if (still.length > 0) plan.media.push({ ...base, kind: still.length > 1 ? 'FRAMES' : 'IMAGE', files: still });
  }
  return plan;
}

export interface ImportOptions {
  /** the vendor / pack name, stored as `author`, and what a re-run replaces */
  source: string;
  license: string;
  licenseUrl?: string | null;
  sourceUrl?: string | null;
  /** show these before the exercise's other demonstrations (default: after them) */
  primary?: boolean;
}

export interface ApplyResult {
  exercises: number;
  created: number;
  replaced: number;
}

/**
 * Write the plan. Per exercise, in one transaction: the LICENSED rows of the same `source` are replaced by the
 * new ones (so running the same pack twice does not duplicate), other rows are kept. Files of replaced rows are
 * deleted afterwards; files written for a transaction that failed are deleted at once.
 */
export async function applyImport(
  prisma: PrismaClient,
  dir: string,
  plan: ImportPlan,
  opts: ImportOptions,
): Promise<ApplyResult> {
  const byExercise = new Map<string, PlannedMedia[]>();
  for (const m of plan.media) byExercise.set(m.exerciseId, [...(byExercise.get(m.exerciseId) ?? []), m]);
  const result: ApplyResult = { exercises: 0, created: 0, replaced: 0 };

  for (const [exerciseId, items] of byExercise) {
    const written: string[] = [];
    try {
      const rows: Prisma.ExerciseMediaCreateManyInput[] = [];
      for (const item of items) {
        const keys: string[] = [];
        for (const file of item.files) {
          const p = await processImage(await readFile(join(dir, file)));
          const key = await storeProcessed(p);
          keys.push(key);
          written.push(key);
        }
        rows.push({
          exerciseId,
          kind: item.kind,
          frames: keys,
          source: 'LICENSED',
          author: opts.source,
          license: opts.license,
          licenseUrl: opts.licenseUrl ?? null,
          sourceUrl: opts.sourceUrl ?? null,
          modified: true, // re-encoded: resized, converted to WebP, metadata removed
          recolorable: false,
        });
      }
      const old = await prisma.$transaction(async (tx) => {
        const previous = await tx.exerciseMedia.findMany({ where: { exerciseId, source: 'LICENSED', author: opts.source } });
        await tx.exerciseMedia.deleteMany({ where: { id: { in: previous.map((r) => r.id) } } });
        const rest = await tx.exerciseMedia.aggregate({ where: { exerciseId }, _min: { order: true }, _max: { order: true } });
        const start = opts.primary ? (rest._min.order ?? 0) - rows.length : (rest._max.order ?? -1) + 1;
        await tx.exerciseMedia.createMany({ data: rows.map((r, i) => ({ ...r, order: start + i })) });
        return previous;
      });
      for (const r of old) await removeStored(r.frames);
      result.exercises += 1;
      result.created += rows.length;
      result.replaced += old.length;
    } catch (e) {
      await removeStored(written).catch(() => undefined);
      throw e;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------------- command line

export interface CliArgs {
  dir?: string;
  source?: string;
  license?: string;
  licenseUrl?: string;
  sourceUrl?: string;
  apply: boolean;
  primary: boolean;
  confirmed: boolean;
  help: boolean;
}

export const USAGE = `Usage: npm run media:import -- --dir <folder> --source <name> --license "<licence text or id>" --i-have-a-license [--apply]

Imports a purchased demonstration pack. Files must be named <exerciseId>-<anything>.(gif|jpg|png|webp), where
<exerciseId> is the ExerciseDB number our exercises keep in Exercise.sourceId (25 and 0025 both mean exercise 0025).

  --dir <folder>          the unpacked pack
  --source <name>         who the pictures are from (stored as the author; a re-run with the same name replaces its rows)
  --license "<text>"      the licence text or licence/order id you hold (stored with every picture)
  --license-url <url>     optional, linked from the credit line
  --source-url <url>      optional, linked from the credit line
  --i-have-a-license      required: you confirm you hold a licence that covers this use
  --apply                 write; without it nothing is changed (dry run: only the plan is printed)
  --primary               show the imported pictures before the exercise's other demonstrations`;

export function parseCliArgs(argv: readonly string[]): CliArgs {
  const out: CliArgs = { apply: false, primary: false, confirmed: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--dir') out.dir = next();
    else if (a === '--source') out.source = next();
    else if (a === '--license') out.license = next();
    else if (a === '--license-url') out.licenseUrl = next();
    else if (a === '--source-url') out.sourceUrl = next();
    else if (a === '--apply') out.apply = true;
    else if (a === '--primary') out.primary = true;
    else if (a === '--i-have-a-license') out.confirmed = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return out;
}

/** Why a run must not start, or null. Checked before any file is read. */
export function refusal(args: CliArgs): string | null {
  if (!args.confirmed) return 'Refusing to run without --i-have-a-license: import only pictures you hold a licence for.';
  if (!args.dir) return 'Missing --dir <folder>.';
  if (!args.source?.trim()) return 'Missing --source <name>.';
  if (!args.license?.trim()) return 'Missing --license "<licence text or id>".';
  return null;
}
