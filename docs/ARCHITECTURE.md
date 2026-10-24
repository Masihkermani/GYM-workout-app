# Daftar — architecture

One coach (who is also the admin), many clients (شاگرد). Clients book sessions with the coach,
follow programs the coach writes (or write their own), and log every set.

## Stack (pinned)

| Concern | Choice |
|---|---|
| Framework | Next.js **15.5.x** App Router, React 19, TypeScript strict, Server Components + Server Actions |
| DB | PostgreSQL 16, Prisma **6.19.x** (`prisma` + `@prisma/client`, classic `schema.prisma`, no driver adapters) |
| i18n | `next-intl` 4.x, locales `fa` (default) and `en`, always-prefixed routes `/fa/...`, `/en/...` |
| Styling | Tailwind CSS **4.x** (CSS-first `@theme`), tokens from `docs/DESIGN.md` as CSS variables |
| Fonts | `@fontsource-variable/vazirmatn`, `@fontsource-variable/archivo` (self-hosted) |
| Dates | `Intl.DateTimeFormat` with `calendar: 'persian'` for display; `date-fns` + `date-fns-jalali` for Jalali month/week arithmetic |
| Validation | `zod` 4 |
| Auth | own: phone + password, `@node-rs/argon2` (argon2id), DB sessions, httpOnly cookie |
| Icons | `lucide-react` |
| Tests | `vitest` (unit), `@playwright/test` (e2e, Chromium at `/opt/pw-browsers/chromium` — never run `playwright install`) |

Coach timezone defaults to `Asia/Tehran` (no DST since 2022). **All instants are stored in UTC**; wall-clock
logic (availability rules, slot generation) happens in the coach timezone via `Intl`/`date-fns-tz`-free helpers in
`src/lib/time.ts`.

## Directory layout

```
prisma/schema.prisma, prisma/seed.ts, prisma/migrations/
data/exercises/exercises.en.json        MIT exercise text (1,324)
data/exercises/exercises.fa.json        Persian names { "<id>": "نام فارسی" }
messages/{en,fa}/{common,auth,landing,booking,training,coach}.json   one namespace per file
src/i18n/{routing.ts,request.ts,navigation.ts}
src/middleware.ts                       next-intl + auth gate for /app and /coach
src/app/[locale]/layout.tsx             <html lang dir>, fonts, theme
src/app/[locale]/page.tsx               landing
src/app/[locale]/(auth)/login, register
src/app/[locale]/app/...                client area
src/app/[locale]/coach/...              coach/admin area
src/components/ui/*                     primitives (Button, Field, Input, NumberInput, Select, Sheet, Dialog, Stamp, Tally, SectionLabel, EmptyState, Tabs)
src/components/booking/*                booking feature components
src/components/training/*               training feature components
src/components/coach/*                  coach-only components
src/lib/{db,auth,session,time,digits,phone,format,validation}.ts
src/lib/scheduling/*                    slot generation (pure, unit-tested)
src/lib/training/*                      e1RM, PR detection, volume (pure, unit-tested)
src/server/*                            server actions per feature (booking.ts, training.ts, coach.ts, auth.ts)
tests/unit/*, tests/e2e/*
```

## Data model (Prisma) — frozen after Phase 1

```prisma
enum Role { COACH CLIENT }
enum BookingStatus { PENDING CONFIRMED CANCELLED COMPLETED NO_SHOW }

model User {
  id            String   @id @default(cuid())
  phone         String   @unique            // normalised E.164, e.g. +989121234567
  name          String
  passwordHash  String
  role          Role     @default(CLIENT)
  locale        String   @default("fa")
  active        Boolean  @default(true)
  coachNotes    String?                     // private, coach-only
  goal          String?                     // client's own words
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  sessions      Session[]
  bookings      Booking[]   @relation("ClientBookings")
  programs      Program[]   @relation("ClientPrograms")
  programsMade  Program[]   @relation("ProgramAuthor")
  workouts      WorkoutLog[]
  exercisesMade Exercise[]
}

model Session {
  id         String   @id @default(cuid())
  tokenHash  String   @unique                // sha256(token); the raw token only lives in the cookie
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  @@index([userId])
}

model CoachSettings {                         // singleton row id = 1
  id                  Int     @id @default(1)
  coachName           String
  coachNameFa         String
  bioEn               String  @default("")
  bioFa               String  @default("")
  locationEn          String  @default("")
  locationFa          String  @default("")
  timezone            String  @default("Asia/Tehran")
  slotMinutes         Int     @default(60)
  bufferMinutes       Int     @default(0)
  horizonDays         Int     @default(21)   // how far ahead clients can book
  minNoticeHours      Int     @default(12)   // can't book a slot starting sooner than this
  cancelWindowHours   Int     @default(24)   // client can cancel until this many hours before
  requireApproval     Boolean @default(true) // client bookings start PENDING
  allowSignup         Boolean @default(true)
  barKg               Decimal @default(20) @db.Decimal(5,2)
  updatedAt           DateTime @updatedAt
}

model AvailabilityRule {                      // recurring weekly window, coach wall-clock time
  id          String  @id @default(cuid())
  weekday     Int                             // 0 = Sunday … 6 = Saturday (JS convention)
  startMinute Int                             // minutes from 00:00, e.g. 17:00 = 1020
  endMinute   Int
  active      Boolean @default(true)
}

model TimeOff {
  id       String   @id @default(cuid())
  startsAt DateTime
  endsAt   DateTime
  reason   String?
}

model Booking {
  id          String        @id @default(cuid())
  clientId    String
  client      User          @relation("ClientBookings", fields: [clientId], references: [id], onDelete: Cascade)
  startsAt    DateTime
  endsAt      DateTime
  status      BookingStatus @default(PENDING)
  clientNote  String?
  coachNote   String?
  cancelledAt DateTime?
  cancelledByCoach Boolean  @default(false)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  workout     WorkoutLog?
  @@index([startsAt])
  @@index([clientId, startsAt])
}
// + raw SQL in the init migration:
// CREATE UNIQUE INDEX booking_active_slot ON "Booking"("startsAt") WHERE status IN ('PENDING','CONFIRMED');
// => a slot can hold only one live booking even under concurrent requests.

model Exercise {
  id               String   @id @default(cuid())
  sourceId         String?  @unique             // "0025" from data/exercises
  nameEn           String
  nameFa           String?
  bodyPart         String
  equipment        String
  target           String
  secondaryMuscles String[]
  stepsEn          String[]
  stepsFa          String[]
  isCustom         Boolean  @default(false)
  createdById      String?
  createdBy        User?    @relation(fields: [createdById], references: [id], onDelete: SetNull)
  archived         Boolean  @default(false)
  createdAt        DateTime @default(now())
  items            ProgramItem[]
  sets             SetLog[]
  @@index([nameEn])
}

model Program {
  id          String   @id @default(cuid())
  clientId    String
  client      User     @relation("ClientPrograms", fields: [clientId], references: [id], onDelete: Cascade)
  authorId    String
  author      User     @relation("ProgramAuthor", fields: [authorId], references: [id])
  title       String
  notes       String?
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  days        ProgramDay[]
}

model ProgramDay {
  id        String  @id @default(cuid())
  programId String
  program   Program @relation(fields: [programId], references: [id], onDelete: Cascade)
  order     Int
  title     String                              // "A — Push" / «روز اول — سینه و سرشانه»
  items     ProgramItem[]
  workouts  WorkoutLog[]
}

model ProgramItem {
  id            String     @id @default(cuid())
  dayId         String
  day           ProgramDay @relation(fields: [dayId], references: [id], onDelete: Cascade)
  exerciseId    String
  exercise      Exercise   @relation(fields: [exerciseId], references: [id])
  order         Int
  targetSets    Int
  targetRepsMin Int
  targetRepsMax Int?                            // null = fixed reps; else a range 8–12
  targetWeightKg Decimal?  @db.Decimal(6,2)
  restSeconds   Int?
  note          String?
}

model WorkoutLog {
  id           String      @id @default(cuid())
  clientId     String
  client       User        @relation(fields: [clientId], references: [id], onDelete: Cascade)
  programDayId String?
  programDay   ProgramDay? @relation(fields: [programDayId], references: [id], onDelete: SetNull)
  bookingId    String?     @unique
  booking      Booking?    @relation(fields: [bookingId], references: [id], onDelete: SetNull)
  startedAt    DateTime    @default(now())
  finishedAt   DateTime?
  note         String?
  sets         SetLog[]
  @@index([clientId, startedAt])
}

model SetLog {
  id         String     @id @default(cuid())
  workoutId  String
  workout    WorkoutLog @relation(fields: [workoutId], references: [id], onDelete: Cascade)
  exerciseId String
  exercise   Exercise   @relation(fields: [exerciseId], references: [id])
  setIndex   Int                                // 1-based within (workout, exercise)
  reps       Int
  weightKg   Decimal    @db.Decimal(6,2)        // 0 for bodyweight
  rpe        Decimal?   @db.Decimal(3,1)
  isWarmup   Boolean    @default(false)
  createdAt  DateTime   @default(now())
  @@index([exerciseId])
}
```

## Auth & authorization

- Register: name, phone, password (≥ 8 chars). Phone normalised by `src/lib/phone.ts`
  (accepts `0912…`, `912…`, `+98912…`, `0098912…`, Persian/Arabic digits, spaces/dashes → `+98912…`;
  other `+<country>` numbers kept as E.164). Blocked when `allowSignup = false`.
- Login: phone + password. Constant-time verify. Simple rate limit: 5 failed attempts per phone per 15 min (in-memory map is acceptable for a single-instance deploy; note it in README).
- Session: 32 random bytes → base64url token in cookie `daftar_session` (httpOnly, sameSite=lax, secure in prod, 30 days); DB stores sha256.
- `getCurrentUser()`, `requireUser()`, `requireCoach()` in `src/lib/auth.ts`. **Every** server action and
  page re-checks; middleware only redirects for UX. Clients may only read/write their own rows
  (bookings, programs where `clientId = me`, workouts, sets). Coach may read/write everything.
- Clients may create/edit programs for themselves (`authorId = clientId = me`). They may **not** edit a
  program the coach authored, but may log workouts against it.
- SMS OTP is a future hook: `src/lib/otp.ts` exports an interface + a no-op dev provider; not wired to the UI.

## Booking rules (`src/lib/scheduling`)

`generateSlots({ rules, timeOff, bookings, settings, from, to, now })` → `{ startsAt, endsAt, state: 'open'|'taken'|'mine-pending'|'mine-confirmed'|'past'|'too-soon' }[]`
- Slots tile each active rule window in `slotMinutes + bufferMinutes` steps, in coach timezone.
- Remove slots overlapping `TimeOff`. Slot is `taken` if a PENDING/CONFIRMED booking starts there.
- `too-soon` if `startsAt < now + minNoticeHours`; nothing beyond `now + horizonDays`.
- Client create booking: re-validate the slot server-side against the same function, insert; unique
  index catches races → friendly "just taken" error. Status PENDING if `requireApproval` else CONFIRMED.
- Client may hold at most 3 future live bookings.
- Client cancel: allowed until `startsAt - cancelWindowHours`; after that, show the coach's contact instead.
- Coach: confirm / decline (→ CANCELLED, cancelledByCoach) / mark COMPLETED or NO_SHOW / book on behalf of a client / move a booking.

## Training rules (`src/lib/training`)

- e1RM = Epley `w × (1 + reps/30)` for reps ≤ 12, else null.
- PR = best e1RM per exercise (and best weight for a given rep count); flagged at log time.
- Volume = Σ reps × weight over non-warm-up sets.
- "Last time" prefill: latest non-warm-up sets of the same exercise for that client.

## Route map

Public: `/[locale]` landing · `/[locale]/login` · `/[locale]/register`

Client `/[locale]/app`:
- `/app` Today: next booking, today's program day, "start workout", last workout summary.
- `/app/book` Timetable → pick slot → confirm sheet → stamp.
- `/app/bookings` upcoming + past, cancel.
- `/app/program` active program(s) as training cards; `/app/program/new`, `/app/program/[id]/edit` (own programs only).
- `/app/workout/[id]` live logging (SetLogger); `/app/workout/new?day=<programDayId>` or free workout.
- `/app/history` workouts list; `/app/history/[id]` detail.
- `/app/progress` per-exercise e1RM chart, PR list, weekly volume.
- `/app/me` name, goal, language, theme, password, logout.

Coach `/[locale]/coach`:
- `/coach` dashboard: today's agenda, pending requests (one-tap confirm/decline), this week's occupancy, recent client workouts, clients without a workout in 7+ days.
- `/coach/schedule` week view of bookings over availability; availability editor; time off.
- `/coach/clients` table + search + add client (coach sets a temporary password).
- `/coach/clients/[id]` profile, coach notes, bookings, programs, workout history, progress.
- `/coach/clients/[id]/programs/[programId]` program builder (days, exercises, sets×reps@weight, rest, notes; reorder).
- `/coach/clients/[id]/workouts/[workoutId]` the coach logs a session for the client (same logger; finishing a workout linked to a started CONFIRMED booking marks it COMPLETED).
- `/coach/exercises` library: search en/fa, filter by body part/equipment, edit Persian name/steps, add custom.
- `/coach/settings` everything in `CoachSettings`.

## i18n

- `messages/<locale>/<namespace>.json`, merged in `src/i18n/request.ts`. Each feature owns its namespace file.
- Keys must exist in **both** locales; `npm run i18n:check` (script in `scripts/i18n-check.mjs`) fails on missing/extra keys.
- Exercise names: `nameFa ?? nameEn` in fa; `nameEn` in en.

## Seed (`npm run db:seed`, development only)

`db:seed` refuses to run when `NODE_ENV=production` unless `SEED_DEMO=1` (`prisma/seed-guard.ts`; `db:reset` checks the same
first, before it drops anything). Production uses `npm run db:seed:base` (`prisma/seed-base.ts`: settings row, default
availability when there are no rules, the exercise library; no users; never overwrites coach edits) and
`npm run create-coach -- --phone … --name …` (`prisma/coach-bootstrap.ts`: creates or promotes the COACH user, password from
`COACH_PASSWORD` (>= 10 characters) or generated and printed once, idempotent on the phone). The shared pieces live in
`prisma/seed-shared.ts`.

- Coach: phone `09120000000`, password `coach-pass-1234` (dev only; README says change it).
- 6 clients with Persian names, phones `0912000000{1..6}`, password `client-pass-1234`.
- Availability: Sat–Wed 07:00–11:00 and 16:00–21:00, Thu 08:00–12:00, Fri off.
- 1,324 exercises from `data/exercises`.
- Each client: one coach-written program (2–4 days), 6–10 weeks of realistic workout history with progressive overload, a mix of past/future bookings in all statuses.

## Scripts

`dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit --incremental false`), `test` (vitest), `test:e2e` (playwright),
`test:e2e:prod` (build, then playwright against `next start`), `db:migrate`, `db:seed` (demo, dev only), `db:seed:base`,
`create-coach`, `db:reset`, `i18n:check`.

Deployment: `Dockerfile` + `docker-compose.yml` (standalone output, `prisma migrate deploy` on start), CI in `.github/workflows/ci.yml`; see README.

## Working rules for parallel agents

- `next.config.ts` reads `distDir: process.env.NEXT_DIST_DIR ?? '.next'` so agents can run separate dev servers.
- Each agent uses its own database (`DATABASE_URL=postgresql://daftar:daftar@localhost:5432/daftar_<agent>`), port and `NEXT_DIST_DIR`.
- Stay inside your owned files. Shared files (`schema.prisma`, `src/lib/*` outside your folder, `src/components/ui/*`, layouts) are read-only in Phase 2 — report needed changes instead.
- Do not `git commit`; the monitor reviews and commits.
