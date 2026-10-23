/**
 * Development seed (idempotent): `npm run db:seed`, or `npm run db:reset` for a clean slate.
 *
 * Creates the coach, 6 clients with realistic Persian names, availability, settings, the full
 * exercise library, one coach-written program per client, 6-10 weeks of progressive workout
 * history and bookings in every status (relative to "now", so the app always looks alive).
 *
 * Re-running keeps users/exercises/settings and rebuilds everything that depends on "now"
 * (availability, time off, programs, workouts, bookings) for the seeded clients only.
 * DEV ONLY: the passwords below are public. Change them anywhere real.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, PrismaClient, type BookingStatus, type Role, type User } from '@prisma/client';
import { hashPassword } from '../src/lib/password';
import { normalizePhone } from '../src/lib/phone';
import { addDaysToKey, startOfWeekKey, todayKey, utcToZoned, wallClockToUtc, weekdayOfKey } from '../src/lib/time';

const prisma = new PrismaClient();

const TZ = 'Asia/Tehran';
export const COACH_PASSWORD = 'coach-pass-1234';
export const CLIENT_PASSWORD = 'client-pass-1234';

// ----------------------------------------------------------------------------- deterministic RNG
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const randInt = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
/** Plate-friendly rounding: whole kilos below 20, 2.5 kg steps above. */
const roundKg = (kg: number) => (kg <= 0 ? 0 : kg < 20 ? Math.max(1, Math.round(kg)) : roundTo(kg, 2.5));

// -------------------------------------------------------------------------------------- templates
type Lang = 'fa' | 'en';
interface ItemSpec {
  ex: string; // dataset name (lower case)
  sets: number;
  min: number;
  max?: number;
  kg: number; // working weight at scale 1.0 (0 = bodyweight)
  rest?: number;
  note?: Partial<Record<Lang, string>>;
}
interface DaySpec {
  title: Record<Lang, string>;
  items: ItemSpec[];
}
interface Template {
  title: Record<Lang, string>;
  notes: Record<Lang, string>;
  /** Training weekdays as day offsets from the start of the (Saturday-first) week. */
  offsets: number[];
  days: DaySpec[];
}

const PPL: Template = {
  title: { fa: 'سینه، پشت و پا (۳ روز)', en: 'Push / Pull / Legs (3 days)' },
  notes: {
    fa: 'هر هفته اگر همه‌ی ست‌ها را به سقف تکرار رساندی، وزنه را کمی بالا ببر. بین ست‌ها استراحت را رعایت کن.',
    en: 'When you hit the top of the rep range on every set, add weight next week. Keep the rests honest.',
  },
  offsets: [0, 2, 4],
  days: [
    {
      title: { fa: 'روز اول — سینه و سرشانه', en: 'A — Push' },
      items: [
        { ex: 'barbell bench press', sets: 4, min: 6, max: 8, kg: 60, rest: 150 },
        { ex: 'dumbbell incline bench press', sets: 3, min: 8, max: 10, kg: 22, rest: 120 },
        { ex: 'dumbbell seated shoulder press', sets: 3, min: 8, max: 10, kg: 18, rest: 120 },
        { ex: 'dumbbell lateral raise', sets: 3, min: 12, max: 15, kg: 8, rest: 60 },
        { ex: 'cable pushdown', sets: 3, min: 10, max: 12, kg: 25, rest: 60 },
      ],
    },
    {
      title: { fa: 'روز دوم — پشت و جلوبازو', en: 'B — Pull' },
      items: [
        { ex: 'barbell bent over row', sets: 4, min: 6, max: 8, kg: 55, rest: 150 },
        { ex: 'cable pulldown', sets: 3, min: 8, max: 10, kg: 50, rest: 90 },
        { ex: 'cable seated row', sets: 3, min: 10, max: 12, kg: 45, rest: 90 },
        { ex: 'dumbbell rear lateral raise', sets: 3, min: 12, max: 15, kg: 6, rest: 60 },
        { ex: 'dumbbell biceps curl', sets: 3, min: 10, max: 12, kg: 12, rest: 60 },
      ],
    },
    {
      title: { fa: 'روز سوم — پا', en: 'C — Legs' },
      items: [
        { ex: 'barbell full squat', sets: 4, min: 5, max: 6, kg: 70, rest: 180 },
        { ex: 'barbell romanian deadlift', sets: 3, min: 8, max: 10, kg: 60, rest: 150 },
        { ex: 'sled 45° leg press', sets: 3, min: 10, max: 12, kg: 120, rest: 120 },
        { ex: 'lever lying leg curl', sets: 3, min: 10, max: 12, kg: 35, rest: 90 },
        { ex: 'barbell standing calf raise', sets: 4, min: 12, max: 15, kg: 40, rest: 60 },
      ],
    },
  ],
};

const UPPER_LOWER: Template = {
  title: { fa: 'بالاتنه و پایین‌تنه (۴ روز)', en: 'Upper / Lower (4 days)' },
  notes: {
    fa: 'دو روز قدرتی و دو روز حجمی. روزهای قدرتی را با تمرکز و استراحت کامل انجام بده.',
    en: 'Two strength days, two volume days. Take full rests on the strength days.',
  },
  offsets: [0, 1, 3, 4],
  days: [
    {
      title: { fa: 'روز اول — بالاتنه (قدرتی)', en: 'A — Upper (strength)' },
      items: [
        { ex: 'barbell bench press', sets: 4, min: 5, max: 6, kg: 65, rest: 180 },
        { ex: 'barbell bent over row', sets: 4, min: 6, max: 8, kg: 55, rest: 150 },
        { ex: 'dumbbell seated shoulder press', sets: 3, min: 8, max: 10, kg: 18, rest: 120 },
        { ex: 'cable pulldown', sets: 3, min: 8, max: 10, kg: 50, rest: 90 },
        { ex: 'barbell curl', sets: 2, min: 8, max: 10, kg: 25, rest: 60 },
      ],
    },
    {
      title: { fa: 'روز دوم — پایین‌تنه (قدرتی)', en: 'B — Lower (strength)' },
      items: [
        { ex: 'barbell full squat', sets: 4, min: 5, max: 6, kg: 75, rest: 180 },
        { ex: 'barbell romanian deadlift', sets: 3, min: 8, kg: 65, rest: 150 },
        { ex: 'lever leg extension', sets: 3, min: 10, max: 12, kg: 40, rest: 90 },
        { ex: 'lever seated leg curl', sets: 3, min: 10, max: 12, kg: 35, rest: 90 },
        { ex: 'barbell standing calf raise', sets: 4, min: 12, max: 15, kg: 45, rest: 60 },
      ],
    },
    {
      title: { fa: 'روز سوم — بالاتنه (حجمی)', en: 'C — Upper (volume)' },
      items: [
        { ex: 'dumbbell incline bench press', sets: 4, min: 8, max: 12, kg: 22, rest: 90 },
        { ex: 'cable seated row', sets: 4, min: 10, max: 12, kg: 45, rest: 90 },
        { ex: 'cable standing fly', sets: 3, min: 12, max: 15, kg: 12, rest: 60 },
        { ex: 'dumbbell lateral raise', sets: 4, min: 12, max: 15, kg: 8, rest: 60 },
        { ex: 'cable triceps pushdown (v-bar)', sets: 3, min: 10, max: 12, kg: 27, rest: 60 },
        { ex: 'dumbbell hammer curl', sets: 3, min: 10, max: 12, kg: 12, rest: 60 },
      ],
    },
    {
      title: { fa: 'روز چهارم — پایین‌تنه (حجمی)', en: 'D — Lower (volume)' },
      items: [
        { ex: 'barbell front squat', sets: 3, min: 8, kg: 50, rest: 150 },
        { ex: 'dumbbell lunge', sets: 3, min: 10, max: 12, kg: 16, rest: 90 },
        { ex: 'sled 45° leg press', sets: 4, min: 12, kg: 110, rest: 120 },
        { ex: 'hanging leg raise', sets: 3, min: 10, max: 15, kg: 0, rest: 60 },
        { ex: 'lever seated calf raise', sets: 4, min: 15, kg: 35, rest: 60 },
      ],
    },
  ],
};

const FULL_BODY: Template = {
  title: { fa: 'کل بدن (۲ روز)', en: 'Full body (2 days)' },
  notes: {
    fa: 'شروع آرام: تمرکز روی فرم درست. اگر حرکتی درد داشت، همان‌جا قطعش کن و به من خبر بده.',
    en: 'An easy start: focus on clean form. If something hurts, stop and tell me.',
  },
  offsets: [1, 4],
  days: [
    {
      title: { fa: 'روز اول — کل بدن ۱', en: 'A — Full body 1' },
      items: [
        { ex: 'dumbbell goblet squat', sets: 3, min: 10, max: 12, kg: 16, rest: 90 },
        { ex: 'dumbbell bench press', sets: 3, min: 10, kg: 14, rest: 90 },
        { ex: 'lever seated row', sets: 3, min: 10, max: 12, kg: 30, rest: 90 },
        { ex: 'dumbbell romanian deadlift', sets: 3, min: 10, kg: 16, rest: 90 },
        { ex: 'push-up', sets: 3, min: 8, max: 12, kg: 0, rest: 60 },
      ],
    },
    {
      title: { fa: 'روز دوم — کل بدن ۲', en: 'B — Full body 2' },
      items: [
        { ex: 'dumbbell step-up', sets: 3, min: 10, kg: 10, rest: 90 },
        { ex: 'lever chest press', sets: 3, min: 10, max: 12, kg: 30, rest: 90 },
        { ex: 'cable pulldown', sets: 3, min: 10, max: 12, kg: 35, rest: 90 },
        { ex: 'dumbbell lateral raise', sets: 2, min: 12, max: 15, kg: 5, rest: 60 },
        { ex: 'hanging leg raise', sets: 3, min: 8, max: 12, kg: 0, rest: 60 },
      ],
    },
  ],
};

const STRENGTH: Template = {
  title: { fa: 'قدرتی (۳ روز)', en: 'Strength (3 days)' },
  notes: {
    fa: 'سه حرکت اصلی با ست‌های سنگین. هفته‌ی چهارم سبک‌تر برو.',
    en: 'The big three with heavy sets. Go lighter in week four.',
  },
  offsets: [0, 2, 4],
  days: [
    {
      title: { fa: 'روز اول — اسکوات و پرس سینه', en: 'A — Squat + Bench' },
      items: [
        { ex: 'barbell full squat', sets: 5, min: 5, kg: 80, rest: 210 },
        { ex: 'barbell bench press', sets: 5, min: 5, kg: 65, rest: 180 },
        { ex: 'barbell bent over row', sets: 4, min: 6, kg: 55, rest: 120 },
      ],
    },
    {
      title: { fa: 'روز دوم — ددلیفت و پرس سرشانه', en: 'B — Deadlift + Press' },
      items: [
        { ex: 'barbell deadlift', sets: 3, min: 5, kg: 100, rest: 240 },
        { ex: 'barbell seated overhead press', sets: 4, min: 6, kg: 40, rest: 150 },
        { ex: 'pull-up', sets: 4, min: 6, max: 8, kg: 0, rest: 120 },
      ],
    },
    {
      title: { fa: 'روز سوم — حجمی', en: 'C — Volume' },
      items: [
        { ex: 'barbell front squat', sets: 3, min: 6, kg: 60, rest: 150 },
        { ex: 'barbell incline bench press', sets: 4, min: 8, kg: 50, rest: 120 },
        { ex: 'barbell romanian deadlift', sets: 3, min: 8, kg: 70, rest: 150 },
      ],
    },
  ],
};

// ------------------------------------------------------------------------------------ the people
interface ClientSpec {
  name: string;
  locale: Lang;
  phone: string;
  goal: string;
  coachNotes: string;
  template: Template;
  scale: number;
  weeks: number;
  /** Preferred booking slot: JS weekday (0 = Sunday) and wall-clock hour in Tehran. */
  slot: { weekday: number; hour: number };
  /** Time of day workouts without a booking start (minutes from midnight). */
  trainAt: number;
  /** No workouts in the last N days (to feed the coach's "inactive 7+ days" list). */
  quietDays?: number;
}

const CLIENTS: ClientSpec[] = [
  {
    name: 'مهسا رحیمی',
    locale: 'fa',
    phone: '09120000001',
    goal: 'تا آخر تابستان بتوانم ۵۰ کیلو اسکوات بزنم.',
    coachNotes: 'زانوی چپ حساس است؛ حرکت‌های پرشی نه. فرم اسکوات را هر جلسه چک کن.',
    template: PPL,
    scale: 0.7,
    weeks: 8,
    slot: { weekday: 6, hour: 17 },
    trainAt: 18 * 60,
  },
  {
    name: 'علی‌رضا نوری',
    locale: 'fa',
    phone: '09120000002',
    goal: 'حجم عضلات بالاتنه را بیشتر کنم.',
    coachNotes: 'انگیزه‌ی خیلی بالا دارد؛ مراقب تمرین بیش‌ازحد باشد و روز استراحت را جدی بگیرد.',
    template: UPPER_LOWER,
    scale: 1.0,
    weeks: 10,
    slot: { weekday: 1, hour: 18 },
    trainAt: 19 * 60,
  },
  {
    name: 'سارا کریمی',
    locale: 'fa',
    phone: '09120000003',
    goal: 'آمادگی عمومی بهتر و کمردرد کمتر.',
    coachNotes: 'کمردرد خفیف. ددلیفت سنگین نه؛ روی تقویت مرکز بدن کار کنیم.',
    template: FULL_BODY,
    scale: 0.6,
    weeks: 6,
    slot: { weekday: 0, hour: 8 },
    trainAt: 8 * 60 + 30,
  },
  {
    name: 'Amirhossein Farhadi',
    locale: 'en',
    phone: '09120000004',
    goal: 'Hit a 140 kg deadlift for the first time.',
    coachNotes: 'Competes in powerlifting meets. Peak for the June meet; keep volume lower from May.',
    template: STRENGTH,
    scale: 1.15,
    weeks: 9,
    slot: { weekday: 2, hour: 19 },
    trainAt: 19 * 60 + 30,
  },
  {
    name: 'نیلوفر صادقی',
    locale: 'fa',
    phone: '09120000005',
    goal: 'هفته‌ای سه روز منظم تمرین کنم.',
    coachNotes: 'صبح‌ها را ترجیح می‌دهد. اگر دو هفته غیبت کرد، پیام بده.',
    template: PPL,
    scale: 0.55,
    weeks: 7,
    slot: { weekday: 3, hour: 9 },
    trainAt: 9 * 60,
  },
  {
    name: 'Behnam Akbari',
    locale: 'en',
    phone: '09120000006',
    goal: 'Lose 8 kg and keep it off.',
    coachNotes: 'Missed the last two weeks. Send a check-in message before the next session.',
    template: FULL_BODY,
    scale: 0.9,
    weeks: 8,
    slot: { weekday: 4, hour: 8 },
    trainAt: 17 * 60,
    quietDays: 10,
  },
];

// ------------------------------------------------------------------------------------- utilities
const fixMojibake = (s: string) => s.replace(/в°/g, '°'); // "в°" -> "°" (UTF-8 read as cp1251 in the source data)
const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

interface RawExercise {
  id: string;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  steps: string[];
}

async function seedExercises(): Promise<Map<string, string>> {
  const root = join(__dirname, '..', 'data', 'exercises');
  const raw = JSON.parse(readFileSync(join(root, 'exercises.en.json'), 'utf8')) as RawExercise[];
  const faPath = join(root, 'exercises.fa.json');
  const fa: Record<string, string> = existsSync(faPath) ? JSON.parse(readFileSync(faPath, 'utf8')) : {};

  const rows = raw.map((e) => ({
    sourceId: e.id,
    nameEn: capitalise(fixMojibake(e.name)),
    nameFa: fa[e.id] ?? null,
    bodyPart: e.bodyPart,
    equipment: e.equipment,
    target: e.target,
    secondaryMuscles: e.secondaryMuscles,
    stepsEn: e.steps,
    stepsFa: [] as string[],
  }));

  // insert what is missing (never overwrites coach edits on re-run) ...
  await prisma.exercise.createMany({ data: rows, skipDuplicates: true });

  // ... and fill Persian names that are still empty, in one statement
  const withFa = rows.filter((r) => r.nameFa);
  for (let i = 0; i < withFa.length; i += 500) {
    const chunk = withFa.slice(i, i + 500);
    await prisma.$executeRaw`
      UPDATE "Exercise" AS e SET "nameFa" = v.name
      FROM (VALUES ${Prisma.join(chunk.map((r) => Prisma.sql`(${r.sourceId}, ${r.nameFa})`))}) AS v(id, name)
      WHERE e."sourceId" = v.id AND e."nameFa" IS NULL`;
  }

  const all = await prisma.exercise.findMany({ select: { id: true, sourceId: true, nameEn: true } });
  const byName = new Map<string, string>();
  for (const e of all) byName.set(e.nameEn.toLowerCase(), e.id);
  console.log(`  exercises: ${all.length} (${withFa.length} with Persian names${withFa.length === 0 ? ': exercises.fa.json not found or empty' : ''})`);
  return byName;
}

function exerciseId(byName: Map<string, string>, datasetName: string): string {
  const id = byName.get(fixMojibake(datasetName).toLowerCase());
  if (!id) throw new Error(`seed: exercise "${datasetName}" not found in the library`);
  return id;
}

// slots ---------------------------------------------------------------------------------------
const WINDOWS: Record<number, [number, number][]> = {
  // JS weekday -> [startMinute, endMinute][]; Friday (5) is off
  6: [[420, 660], [960, 1260]],
  0: [[420, 660], [960, 1260]],
  1: [[420, 660], [960, 1260]],
  2: [[420, 660], [960, 1260]],
  3: [[420, 660], [960, 1260]],
  4: [[480, 720]],
};
const SLOT_MINUTES = 60;

function slotMinutesFor(weekday: number): number[] {
  const out: number[] = [];
  for (const [start, end] of WINDOWS[weekday] ?? []) {
    for (let m = start; m + SLOT_MINUTES <= end; m += SLOT_MINUTES) out.push(m);
  }
  return out;
}

// ------------------------------------------------------------------------------------------ main
async function main() {
  console.log('Seeding Daftar (dev data)…');
  const now = new Date();
  const today = todayKey(TZ, now);

  // settings --------------------------------------------------------------------------------
  const settingsData = {
    coachName: 'Coach Arash Kamali',
    coachNameFa: 'مربی آرش کمالی',
    bioEn:
      "I've coached strength for ten years, mostly with people who are just starting out or coming back " +
      'from an injury: good movement first, heavier weight after. Sessions are one-to-one in my small ' +
      'studio in Saadat Abad, so only one person trains with me at a time.',
    bioFa:
      'ده سال است مربی قدرتی‌ام. بیشتر با کسانی کار می‌کنم که تازه شروع کرده‌اند یا بعد از آسیب‌دیدگی به ' +
      'تمرین برمی‌گردند؛ اول حرکت درست، بعد وزنه‌ی بیشتر. جلسه‌ها در استودیوی کوچکی در سعادت‌آباد است ' +
      'و هر ساعت فقط یک نفر پیش من تمرین می‌کند.',
    locationEn: 'Private training studio, Saadat Abad, Tehran. Ground floor, entrance from the side street.',
    locationFa: 'استودیوی خصوصی تمرین، سعادت‌آباد، تهران. طبقه‌ی همکف، ورودی از کوچه.',
    timezone: TZ,
    slotMinutes: SLOT_MINUTES,
    bufferMinutes: 0,
    horizonDays: 21,
    minNoticeHours: 12,
    cancelWindowHours: 24,
    requireApproval: true,
    allowSignup: true,
    barKg: 20,
  };
  await prisma.coachSettings.upsert({ where: { id: 1 }, update: settingsData, create: { id: 1, ...settingsData } });

  // people ----------------------------------------------------------------------------------
  const phone = (p: string) => {
    const n = normalizePhone(p);
    if (!n) throw new Error(`seed: bad phone ${p}`);
    return n;
  };
  const upsertUser = async (data: {
    phone: string;
    name: string;
    role: Role;
    locale: Lang;
    password: string;
    goal?: string;
    coachNotes?: string;
  }) => {
    const passwordHash = await hashPassword(data.password);
    const common = {
      name: data.name,
      role: data.role,
      locale: data.locale,
      active: true,
      goal: data.goal ?? null,
      coachNotes: data.coachNotes ?? null,
    };
    return prisma.user.upsert({
      where: { phone: phone(data.phone) },
      update: { ...common, passwordHash },
      create: { phone: phone(data.phone), passwordHash, ...common },
    });
  };

  const coach = await upsertUser({
    phone: '09120000000',
    name: 'آرش کمالی',
    role: 'COACH',
    locale: 'fa',
    password: COACH_PASSWORD,
  });
  const clients: User[] = [];
  for (const spec of CLIENTS) {
    clients.push(
      await upsertUser({
        phone: spec.phone,
        name: spec.name,
        role: 'CLIENT',
        locale: spec.locale,
        password: CLIENT_PASSWORD,
        goal: spec.goal,
        coachNotes: spec.coachNotes,
      }),
    );
  }
  console.log(`  users: 1 coach, ${clients.length} clients`);

  // availability + time off (rebuilt) -------------------------------------------------------
  await prisma.availabilityRule.deleteMany();
  await prisma.availabilityRule.createMany({
    data: Object.entries(WINDOWS).flatMap(([weekday, windows]) =>
      windows.map(([startMinute, endMinute]) => ({ weekday: Number(weekday), startMinute, endMinute })),
    ),
  });
  await prisma.timeOff.deleteMany();
  let offKey = addDaysToKey(today, 13);
  if (weekdayOfKey(offKey) === 5) offKey = addDaysToKey(offKey, 1);
  await prisma.timeOff.create({
    data: {
      startsAt: wallClockToUtc(offKey, 7 * 60, TZ),
      endsAt: wallClockToUtc(offKey, 21 * 60, TZ),
      reason: 'Coaching seminar',
    },
  });

  // exercise library ------------------------------------------------------------------------
  const exerciseByName = await seedExercises();

  // wipe what depends on "now" for the seeded clients ---------------------------------------
  const clientIds = clients.map((c) => c.id);
  await prisma.workoutLog.deleteMany({ where: { clientId: { in: clientIds } } }); // cascades SetLog
  await prisma.booking.deleteMany({ where: { clientId: { in: clientIds } } });
  await prisma.program.deleteMany({ where: { clientId: { in: clientIds } } }); // cascades days + items

  // programs --------------------------------------------------------------------------------
  const programs: { id: string; days: { id: string; title: string; items: { exerciseId: string; sets: number; min: number; max: number | null; kg: number }[] }[] }[] = [];
  for (let i = 0; i < CLIENTS.length; i++) {
    const spec = CLIENTS[i];
    const lang = spec.locale;
    const created = await prisma.program.create({
      data: {
        clientId: clients[i].id,
        authorId: coach.id,
        title: spec.template.title[lang],
        notes: spec.template.notes[lang],
        active: true,
        days: {
          create: spec.template.days.map((day, d) => ({
            order: d + 1,
            title: day.title[lang],
            items: {
              create: day.items.map((item, k) => ({
                exerciseId: exerciseId(exerciseByName, item.ex),
                order: k + 1,
                targetSets: item.sets,
                targetRepsMin: item.min,
                targetRepsMax: item.max ?? null,
                targetWeightKg: item.kg > 0 ? roundKg(item.kg * spec.scale) : null,
                restSeconds: item.rest ?? null,
                note: item.note?.[lang] ?? null,
              })),
            },
          })),
        },
      },
      include: { days: { orderBy: { order: 'asc' }, include: { items: { orderBy: { order: 'asc' } } } } },
    });
    programs.push({
      id: created.id,
      days: created.days.map((d) => ({
        id: d.id,
        title: d.title,
        items: d.items.map((it) => ({
          exerciseId: it.exerciseId,
          sets: it.targetSets,
          min: it.targetRepsMin,
          max: it.targetRepsMax,
          kg: it.targetWeightKg ? Number(it.targetWeightKg) : 0,
        })),
      })),
    });
  }

  // one self-written program (a client may edit their own, never the coach's)
  const selfClient = clients[2];
  await prisma.program.create({
    data: {
      clientId: selfClient.id,
      authorId: selfClient.id,
      title: 'برنامه‌ی خودم برای خانه',
      notes: 'وقتی باشگاه نمی‌روم.',
      active: false,
      days: {
        create: [
          {
            order: 1,
            title: 'روز خانه',
            items: {
              create: [
                { exerciseId: exerciseId(exerciseByName, 'push-up'), order: 1, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 },
                { exerciseId: exerciseId(exerciseByName, 'dumbbell goblet squat'), order: 2, targetSets: 3, targetRepsMin: 12, targetWeightKg: 12 },
                { exerciseId: exerciseId(exerciseByName, 'hanging leg raise'), order: 3, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 },
              ],
            },
          },
        ],
      },
    },
  });
  console.log(`  programs: ${programs.length} coach-written + 1 self-written`);

  // bookings --------------------------------------------------------------------------------
  const used = new Set<number>();
  const at = (dateKey: string, minute: number) => wallClockToUtc(dateKey, minute, TZ);
  const weekStart = startOfWeekKey(today, 'fa');

  interface PlannedBooking {
    client: number;
    week: number; // weeks relative to the current Saturday-first week (-1 = last week)
    status: BookingStatus;
    byCoach?: boolean;
    minute?: number;
    weekdayShift?: number;
    clientNote?: string;
    coachNote?: string;
  }
  const plan: PlannedBooking[] = [
    // Mahsa: weekly regular, two coming up
    { client: 0, week: -4, status: 'COMPLETED' },
    { client: 0, week: -3, status: 'COMPLETED', coachNote: 'فرم اسکوات بهتر شد؛ عمق را حفظ کن.' },
    { client: 0, week: -2, status: 'COMPLETED' },
    { client: 0, week: -1, status: 'COMPLETED', coachNote: 'وزنه‌ی اسکوات را از هفته‌ی بعد ۲٫۵ کیلو ببریم بالا.' },
    { client: 0, week: 1, status: 'CONFIRMED', clientNote: 'می‌خواهم امروز روی اسکوات بیشتر کار کنیم.' },
    { client: 0, week: 2, status: 'CONFIRMED' },
    // Alireza: one cancelled by him, two pending requests
    { client: 1, week: -4, status: 'COMPLETED' },
    { client: 1, week: -3, status: 'CANCELLED' },
    { client: 1, week: -2, status: 'COMPLETED' },
    { client: 1, week: -1, status: 'COMPLETED' },
    { client: 1, week: 1, status: 'PENDING', clientNote: 'اگر ممکن است ساعت را کمی دیرتر بگذاریم.' },
    { client: 1, week: 2, status: 'PENDING' },
    // Sara: a no-show, coach cancelled one
    { client: 2, week: -3, status: 'COMPLETED' },
    { client: 2, week: -2, status: 'COMPLETED' },
    { client: 2, week: -1, status: 'NO_SHOW', coachNote: 'خبر نداد؛ پیام دادم.' },
    { client: 2, week: 1, status: 'CONFIRMED' },
    { client: 2, week: 2, status: 'CANCELLED', byCoach: true, minute: 10 * 60 },
    // Amirhossein (English): consistent, one extra confirmed
    { client: 3, week: -3, status: 'COMPLETED' },
    { client: 3, week: -2, status: 'COMPLETED', coachNote: 'Deadlift 5 x 3 moved well. Keep the hips down on the pull.' },
    { client: 3, week: -1, status: 'COMPLETED' },
    { client: 3, week: 1, status: 'CONFIRMED' },
    { client: 3, week: 1, status: 'PENDING', weekdayShift: 2, minute: 10 * 60 + 0 },
    // Niloufar: coach cancelled one, one pending
    { client: 4, week: -3, status: 'COMPLETED' },
    { client: 4, week: -2, status: 'CANCELLED', byCoach: true },
    { client: 4, week: -1, status: 'COMPLETED' },
    { client: 4, week: 1, status: 'PENDING' },
    // Behnam (English, drifting away): old completed, then no-show and a cancellation
    { client: 5, week: -4, status: 'COMPLETED' },
    { client: 5, week: -3, status: 'COMPLETED' },
    { client: 5, week: -2, status: 'NO_SHOW' },
    { client: 5, week: -1, status: 'CANCELLED' },
  ];

  const bookingRows: {
    id: string;
    client: number;
    dateKey: string;
    startsAt: Date;
    endsAt: Date;
    status: BookingStatus;
  }[] = [];

  const makeBooking = async (client: number, dateKey: string, minute: number, p: Omit<PlannedBooking, 'client' | 'week'>) => {
    const startsAt = at(dateKey, minute);
    if (used.has(startsAt.getTime())) return;
    used.add(startsAt.getTime());
    const endsAt = new Date(startsAt.getTime() + SLOT_MINUTES * 60_000);
    const created = new Date(startsAt.getTime() - 3 * 24 * 3600_000);
    const cancelled = p.status === 'CANCELLED';
    const row = await prisma.booking.create({
      data: {
        clientId: clients[client].id,
        startsAt,
        endsAt,
        status: p.status,
        clientNote: p.clientNote ?? null,
        coachNote: p.coachNote ?? null,
        cancelledAt: cancelled ? new Date(startsAt.getTime() - (p.byCoach ? 20 : 30) * 3600_000) : null,
        cancelledByCoach: cancelled ? Boolean(p.byCoach) : false,
        createdAt: created < now ? created : now,
      },
    });
    bookingRows.push({ id: row.id, client, dateKey, startsAt, endsAt, status: p.status });
  };

  for (const p of plan) {
    const spec = CLIENTS[p.client];
    const weekday = (spec.slot.weekday + (p.weekdayShift ?? 0)) % 7;
    const offset = (weekday - 6 + 7) % 7; // days after Saturday
    const dateKey = addDaysToKey(weekStart, offset + p.week * 7);
    await makeBooking(p.client, dateKey, p.minute ?? spec.slot.hour * 60, p);
  }

  // today's agenda: the next free slot today is confirmed, the one after is a pending request
  const todaySlots = slotMinutesFor(weekdayOfKey(today)).filter(
    (m) => at(today, m).getTime() > now.getTime() + 60 * 60_000 && !used.has(at(today, m).getTime()),
  );
  if (todaySlots[0] != null) await makeBooking(0, today, todaySlots[0], { status: 'CONFIRMED', clientNote: 'امروز زودتر می‌رسم.' });
  if (todaySlots[1] != null) await makeBooking(4, today, todaySlots[1], { status: 'PENDING' });

  const countBy = (s: BookingStatus) => bookingRows.filter((b) => b.status === s).length;
  console.log(
    `  bookings: ${bookingRows.length} (` +
      (['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as BookingStatus[]).map((s) => `${countBy(s)} ${s}`).join(', ') +
      ')',
  );

  // workout history -------------------------------------------------------------------------
  let workoutCount = 0;
  let setCount = 0;

  for (let ci = 0; ci < CLIENTS.length; ci++) {
    const spec = CLIENTS[ci];
    const program = programs[ci];
    const rng = mulberry32(1000 + ci * 7919);
    const dayCount = program.days.length;

    interface Session {
      dateKey: string;
      startMinute: number;
      weeksAgo: number;
      bookingId?: string;
      endsAt?: Date;
    }
    const sessions: Session[] = [];

    // coach-led sessions: every COMPLETED booking becomes a logged workout
    const completed = bookingRows.filter((b) => b.client === ci && b.status === 'COMPLETED');
    const bookedDates = new Set(completed.map((b) => b.dateKey));
    for (const b of completed) {
      const z = utcToZoned(b.startsAt, TZ);
      const weeksAgo = Math.max(0, Math.floor((new Date(weekStart).getTime() - new Date(startOfWeekKey(b.dateKey, 'fa')).getTime()) / (7 * 86400_000)));
      sessions.push({ dateKey: b.dateKey, startMinute: z.minuteOfDay, weeksAgo, bookingId: b.id, endsAt: b.endsAt });
    }

    // self-led sessions on the program's training weekdays
    for (let w = spec.weeks - 1; w >= 0; w--) {
      for (const offset of spec.template.offsets) {
        const dateKey = addDaysToKey(weekStart, offset - w * 7);
        if (dateKey >= today) continue; // today's workout is left to be started in the app
        if (bookedDates.has(dateKey)) continue;
        if (spec.quietDays && dateKey > addDaysToKey(today, -spec.quietDays)) continue;
        if (rng() < 0.12) continue; // life happens
        sessions.push({ dateKey, startMinute: spec.trainAt + randInt(rng, -30, 45), weeksAgo: w });
      }
    }
    sessions.sort((a, b) => (a.dateKey === b.dateKey ? a.startMinute - b.startMinute : a.dateKey < b.dateKey ? -1 : 1));

    // rotate through the program days in order, so history reads like a real block
    let dayIndex = 0;
    for (const session of sessions) {
      const day = program.days[dayIndex % dayCount];
      dayIndex += 1;

      const startedAt = wallClockToUtc(session.dateKey, session.startMinute, TZ);
      const durationMin = randInt(rng, 48, 78);
      const finishedAt = session.endsAt && session.endsAt > startedAt ? session.endsAt : new Date(startedAt.getTime() + durationMin * 60_000);

      const sets: Prisma.SetLogCreateWithoutWorkoutInput[] = [];
      let clock = startedAt.getTime() + 4 * 60_000;
      day.items.forEach((item, itemIndex) => {
        let setIndex = 0;
        const inc = item.kg >= 40 ? 2.5 : item.kg >= 10 ? 2 : 1;
        // progressive overload: about one increment every two weeks, ending at the program's target
        const weight = item.kg > 0 ? Math.max(roundKg(item.kg * 0.5), roundKg(item.kg - inc * Math.floor(session.weeksAgo / 2))) : 0;
        const topReps = item.max ?? item.min;

        if (itemIndex === 0 && weight >= 40) {
          // two warm-up sets before the first heavy lift
          for (const [fraction, reps] of [[0.5, 8], [0.7, 5]] as const) {
            setIndex += 1;
            sets.push({
              exercise: { connect: { id: item.exerciseId } },
              setIndex,
              reps,
              weightKg: roundKg(weight * fraction),
              isWarmup: true,
              createdAt: new Date(clock),
            });
            clock += 90_000;
          }
        }

        for (let s = 1; s <= item.sets; s++) {
          setIndex += 1;
          let reps = Math.min(topReps, item.min + (session.weeksAgo % 2 === 1 ? 1 : 0) + (item.max ? randInt(rng, 0, 1) : 0));
          if (s >= 3 && rng() < 0.6) reps -= 1; // fatigue
          if (s === item.sets && rng() < 0.2) reps -= 1;
          reps = Math.max(1, reps);
          const rpeBase = 6.5 + (s / item.sets) * 2.2 + (rng() - 0.5);
          const rpe = rng() < 0.25 ? null : Math.min(10, Math.max(6, roundTo(rpeBase, 0.5)));
          sets.push({
            exercise: { connect: { id: item.exerciseId } },
            setIndex,
            reps,
            weightKg: weight,
            rpe,
            isWarmup: false,
            createdAt: new Date(clock),
          });
          clock += (item.sets > 0 ? 100 : 60) * 1000 + randInt(rng, 20, 70) * 1000;
        }
        clock += 120_000;
      });

      await prisma.workoutLog.create({
        data: {
          clientId: clients[ci].id,
          programDayId: day.id,
          bookingId: session.bookingId ?? null,
          startedAt,
          finishedAt: finishedAt.getTime() < now.getTime() ? finishedAt : new Date(now.getTime() - 60_000),
          note: rng() < 0.12 ? (spec.locale === 'fa' ? 'امروز خسته بودم ولی کامل انجام شد.' : 'Tired today but got it all done.') : null,
          sets: { create: sets },
        },
      });
      workoutCount += 1;
      setCount += sets.length;
    }
  }
  console.log(`  workouts: ${workoutCount} (${setCount} sets) over 6-10 weeks per client`);

  console.log('Done.');
  console.log(`  coach  : 09120000000 / ${COACH_PASSWORD}`);
  console.log(`  clients: 09120000001 … 09120000006 / ${CLIENT_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
