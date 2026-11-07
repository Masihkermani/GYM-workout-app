/**
 * `npm run media:import -- --dir <folder> --source <name> --license "<text>" --i-have-a-license [--apply]`
 * See USAGE in src/lib/media/importer.ts. Dry run unless --apply.
 */
import { PrismaClient } from '@prisma/client';
import { applyImport, parseCliArgs, planImport, refusal, USAGE } from '../../src/lib/media/importer';
import { mediaDir } from '../../src/lib/media/storage';

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  const why = refusal(args);
  if (why) {
    console.error(`${why}\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  const prisma = new PrismaClient();
  try {
    const exercises = (await prisma.exercise.findMany({ where: { sourceId: { not: null } }, select: { id: true, sourceId: true, nameEn: true } })).map(
      (e) => ({ id: e.id, sourceId: e.sourceId as string, nameEn: e.nameEn }),
    );
    const plan = await planImport(args.dir as string, exercises);
    console.log(`${args.apply ? 'Importing' : 'Dry run'}: ${plan.media.length} demonstrations for ${new Set(plan.media.map((m) => m.exerciseId)).size} exercises`);
    for (const m of plan.media.slice(0, 40)) console.log(`  ${m.sourceId} ${m.exerciseName}: ${m.kind} (${m.files.join(', ')})`);
    if (plan.media.length > 40) console.log(`  ... and ${plan.media.length - 40} more`);
    if (plan.unnamed.length) console.log(`  ${plan.unnamed.length} files not named <exerciseId>-<anything>.<ext> (ignored)`);
    if (plan.unknownExercise.length) console.log(`  ${plan.unknownExercise.length} files for exercise ids we do not have (ignored)`);
    for (const r of plan.rejected) console.log(`  rejected ${r.file}: ${r.reason}`);
    if (!args.apply) {
      console.log('Nothing written. Add --apply to import.');
      return;
    }
    const r = await applyImport(prisma, args.dir as string, plan, {
      source: (args.source as string).trim(),
      license: (args.license as string).trim(),
      licenseUrl: args.licenseUrl ?? null,
      sourceUrl: args.sourceUrl ?? null,
      primary: args.primary,
    });
    console.log(`Done: ${r.created} demonstrations created for ${r.exercises} exercises (${r.replaced} earlier ones of the same source replaced). Files are in ${mediaDir()}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
