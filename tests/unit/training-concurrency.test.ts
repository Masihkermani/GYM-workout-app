/**
 * Set numbering, the 100-set cap and the free-workout cap under concurrent requests, against a real
 * database (security review F8, F10). Skipped when DATABASE_URL is not a reachable migrated PostgreSQL.
 * The session is mocked; Prisma, the advisory locks and the transactions are real.
 */
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    role: "COACH" | "CLIENT";
    name: string;
    phone: string;
    locale: string;
  },
}));

vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (!session.user) throw new Error("no session");
    return session.user;
  },
  requireCoach: async () => {
    if (!session.user || session.user.role !== "COACH")
      throw new Error("not coach");
    return session.user;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const prisma = new PrismaClient();
const PREFIX = `+98991${Date.now().toString().slice(-6)}`;

let dbUp = false;
try {
  if (process.env.DATABASE_URL) {
    await prisma.$connect();
    await prisma.user.count();
    dbUp = true;
  }
} catch {
  dbUp = false;
}

type Actions = typeof import("@/server/training");
let actions: Actions;
let exerciseId: string;
let customExerciseId: string | null = null;
const ids = { client: "", other: "" };

const asClient = (id: string) => {
  session.user = {
    id,
    role: "CLIENT",
    name: "T",
    phone: `${PREFIX}x`,
    locale: "fa",
  };
};
const newWorkout = async (clientId = ids.client) =>
  (await prisma.workoutLog.create({ data: { clientId } })).id;
const log = (workoutId: string, reps = 5) =>
  actions.logSetAction({ workoutId, exerciseId, reps, weightKg: 40 });
const indexes = async (workoutId: string) =>
  (
    await prisma.setLog.findMany({
      where: { workoutId, exerciseId },
      select: { setIndex: true },
      orderBy: { setIndex: "asc" },
    })
  ).map((s) => s.setIndex);
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe.skipIf(!dbUp)("training concurrency (database)", () => {
  beforeAll(async () => {
    actions = await import("@/server/training");
    const mk = (n: string) =>
      prisma.user.create({
        data: {
          phone: `${PREFIX}${n}`,
          name: `C ${n}`,
          passwordHash: "x",
          role: "CLIENT",
        },
      });
    const [a, b] = await Promise.all([mk("1"), mk("2")]);
    ids.client = a.id;
    ids.other = b.id;
    const existing = await prisma.exercise.findFirst({
      where: { archived: false },
      select: { id: true },
    });
    if (existing) exerciseId = existing.id;
    else {
      const custom = await prisma.exercise.create({
        data: {
          nameEn: "Concurrency lift",
          bodyPart: "chest",
          equipment: "barbell",
          target: "pectorals",
          isCustom: true,
        },
      });
      exerciseId = custom.id;
      customExerciseId = custom.id;
    }
    asClient(ids.client);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { phone: { startsWith: PREFIX } } });
    if (customExerciseId)
      await prisma.exercise
        .delete({ where: { id: customExerciseId } })
        .catch(() => undefined);
    await prisma.$disconnect();
  });

  describe("concurrent set logging", () => {
    it("20 simultaneous taps get 20 distinct, consecutive set numbers (F8)", async () => {
      const workoutId = await newWorkout();
      const results = await Promise.all(
        Array.from({ length: 20 }, () => log(workoutId)),
      );
      expect(results.every((r) => r.ok)).toBe(true);
      expect(await indexes(workoutId)).toEqual(range(20));
      const returned = results
        .flatMap((r) => (r.ok ? [r.set.setIndex] : []))
        .sort((x, y) => x - y);
      expect(returned).toEqual(range(20));
    });

    it("respects the 100-set cap when many requests arrive at once (F8)", async () => {
      const workoutId = await newWorkout();
      await prisma.setLog.createMany({
        data: range(94).map((setIndex) => ({
          workoutId,
          exerciseId,
          setIndex,
          reps: 5,
          weightKg: 40,
        })),
      });
      const results = await Promise.all(
        Array.from({ length: 20 }, () => log(workoutId)),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(6);
      expect(results.filter((r) => !r.ok && r.error === "limit")).toHaveLength(
        14,
      );
      expect(await indexes(workoutId)).toEqual(range(100));
    });

    it("log, restore and delete racing each other never leave a gap or a duplicate (F8)", async () => {
      const workoutId = await newWorkout();
      const seed = await Promise.all(range(6).map(() => log(workoutId)));
      expect(seed.every((r) => r.ok)).toBe(true);
      const doomed = await prisma.setLog.findFirstOrThrow({
        where: { workoutId, setIndex: 3 },
        select: { id: true },
      });

      const results = await Promise.all([
        log(workoutId),
        log(workoutId),
        actions.restoreSetAction({
          workoutId,
          exerciseId,
          setIndex: 2,
          reps: 8,
          weightKg: 60,
        }),
        actions.deleteSetAction({ setId: doomed.id }),
        log(workoutId),
        actions.restoreSetAction({
          workoutId,
          exerciseId,
          setIndex: 1,
          reps: 9,
          weightKg: 70,
        }),
      ]);
      expect(results.every((r) => r.ok)).toBe(true);
      // 6 + 3 logged + 2 restored - 1 deleted
      expect(await indexes(workoutId)).toEqual(range(10));
    });

    it("sets of different workouts do not wait for each other", async () => {
      const [w1, w2] = await Promise.all([newWorkout(), newWorkout()]);
      const results = await Promise.all([
        ...range(5).map(() => log(w1)),
        ...range(5).map(() => log(w2)),
      ]);
      expect(results.every((r) => r.ok)).toBe(true);
      expect(await indexes(w1)).toEqual(range(5));
      expect(await indexes(w2)).toEqual(range(5));
    });
  });

  describe("free workouts per day", () => {
    it("a client can start 10 free workouts a day, not an 11th, even in a burst (F10)", async () => {
      asClient(ids.other);
      const results = await Promise.all(
        Array.from({ length: 16 }, () => actions.startWorkoutAction({})),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(10);
      expect(
        results.filter((r) => !r.ok && r.error === "dailyLimit"),
      ).toHaveLength(6);
      expect(
        await prisma.workoutLog.count({ where: { clientId: ids.other } }),
      ).toBe(10);
    });

    it("is per client, and older workouts roll out of the window", async () => {
      asClient(ids.client);
      await prisma.workoutLog.deleteMany({ where: { clientId: ids.client } });
      expect((await actions.startWorkoutAction({})).ok).toBe(true); // the other client's 10 do not count
      await prisma.workoutLog.updateMany({
        where: { clientId: ids.other },
        data: { startedAt: new Date(Date.now() - 25 * 3_600_000) },
      });
      asClient(ids.other);
      expect((await actions.startWorkoutAction({})).ok).toBe(true);
    });

    it("does not limit program-day workouts (they resume instead)", async () => {
      asClient(ids.client);
      const program = await prisma.program.create({
        data: {
          clientId: ids.client,
          authorId: ids.client,
          title: "P",
          days: { create: [{ order: 1, title: "D1" }] },
        },
        include: { days: true },
      });
      const first = await actions.startWorkoutAction({
        dayId: program.days[0].id,
      });
      const again = await actions.startWorkoutAction({
        dayId: program.days[0].id,
      });
      expect(
        first.ok && again.ok && again.id === first.id && again.resumed,
      ).toBe(true);
      await prisma.program.deleteMany({ where: { id: program.id } });
    });
  });
});
