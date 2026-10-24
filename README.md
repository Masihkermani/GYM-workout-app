# Daftar

**Daftar** (دفتر, "logbook") is a bilingual web app for one personal coach and their clients: clients book
sessions, follow the program the coach writes (or write their own) and log every set; the coach runs the
timetable, the clients and the exercise library from one panel.

Persian (right-to-left, Jalali calendar, Persian digits, week starting on Saturday) is the default language and
English is a full second language. It is built to run on a single cheap VPS, including one inside Iran:
fonts are self-hosted and nothing is loaded from a CDN or a third-party API at runtime.

- Design brief: [`docs/DESIGN.md`](docs/DESIGN.md) · Architecture, data model and contracts: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Stack: Next.js 15.5 (App Router, React 19, Server Actions) · TypeScript strict · PostgreSQL 16 + Prisma 6.19 ·
  next-intl 4 · Tailwind CSS 4 · zod 4 · own auth (phone + password, argon2id, DB sessions) · Vitest · Playwright

## What it does

**Clients** (`/fa/app`, `/en/app`)

- **Today**: the next booking, today's training day with a one-tap "Start workout", the last workout and a recent record.
- **Book**: a weekly timetable of the coach's open hours. The coach decides whether a request needs approval or
  confirms instantly; clients hold at most three live bookings and can cancel until the coach's cancellation window.
- **Program**: the coach's program (read-only) and programs the client wrote for themselves, shown as training cards.
- **Workout logging**: giant weight and reps steppers (2.5 kg steps, "same as last set"), a barbell diagram with the
  plates for the entered weight, a rest timer, warm-up flag, edit and delete of a set, automatic personal-record detection.
- **History and progress**: every past workout, estimated 1RM per exercise, records and weekly volume charts.
- **Me**: name and goal, language, light or dark theme, password.

**Coach** (`/fa/coach`, `/en/coach`)

- **Dashboard**: today's agenda, pending requests (confirm or decline in one tap), this week's occupancy, recent client
  workouts and clients who have not trained for a week.
- **Schedule**: week view of bookings over availability, availability editor, time off, book on behalf of a client,
  move a booking, mark completed or no-show, private notes.
- **Clients**: search, add a client with a temporary password, reset a password, deactivate, private coach notes,
  full profile with bookings, programs, workouts and progress.
- **Program builder**: days, exercises, sets × reps @ weight, rest and notes, reordering.
- **Exercise library**: 1,324 exercises with Persian names, filters by body part and equipment, custom exercises.
- **Settings**: slot length, buffer, booking horizon, minimum notice, cancellation window, approval on or off, open
  sign-up on or off, bar weight, time zone (default `Asia/Tehran`).

**Public** (`/fa`, `/en`): a landing page with the coach's live open-slot count for the week, how it works, a sample
training card and the hours; login and registration.

## Screenshots

The look is documented as a clickable design preview with sample data (no server needed):

- Open [`design-preview/daftar-preview.html`](design-preview/daftar-preview.html) in a browser, or the same file as
  [`docs/index.html`](docs/index.html) (the GitHub Pages build; rebuild it with `scripts/build-pages.sh`). Screens:
  `#landing`, `#book`, `#workout`, `#progress`, `#coach`, `#builder`. See [`design-preview/README.md`](design-preview/README.md).
- For the real app: `npm run dev`, then `/fa/styleguide` (development only) shows every component in both themes, and
  `BASE_URL=http://localhost:3000 node scripts/qa-screenshots.mjs` writes screenshots of the key pages to `.qa/`.

## Local setup

Requirements: Node 22 (>= 22.12), npm, PostgreSQL 16.

```bash
# 1. a database (any role and name you like; this matches .env.example)
createdb daftar_dev            # or: CREATE DATABASE daftar_dev;

# 2. environment
cp .env.example .env           # DATABASE_URL=postgresql://daftar:daftar@localhost:5432/daftar_dev

# 3. install (also runs `prisma generate`)
npm install

# 4. schema and dev data
npm run db:migrate             # prisma migrate dev: applies prisma/migrations, incl. the booking_active_slot index
npm run db:seed                # DEMO data: coach, 6 clients, 1,324 exercises, programs, workout history, bookings

# 5. run
npm run dev                    # http://localhost:3000  ->  redirects to /fa
```

### Seeded accounts (development only)

`npm run db:seed` is the **development** seed. It refuses to run when `NODE_ENV=production` (see
[Deploy](#deploy-with-docker-compose-a-vps) for what to run there instead).

| Who | Phone | Password |
|---|---|---|
| Coach / admin | `09120000000` | `coach-pass-1234` |
| Clients 1 to 6 | `09120000001` … `09120000006` | `client-pass-1234` |

**These passwords are public.** They exist so the app is usable on your laptop. Anywhere real, do not run the demo
seed: use `npm run db:seed:base` and `npm run create-coach` (below). If a database ever got the demo accounts, deactivate
them in the coach panel and change the coach's password in Profile. Phone numbers can be
typed with Persian or Arabic digits, spaces or dashes; they are stored as E.164 (`+989120000000`). The seed is
idempotent: running it again rebuilds the data that depends on "now" (availability, time off, programs, workouts,
bookings) without duplicating anything.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Next dev server (Turbopack). `-- -p 3100` for another port |
| `npm run build` / `npm start` | Production build / server (the build is `output: 'standalone'`, see Deploy) |
| `npm run lint` | ESLint (`next/core-web-vitals` + TypeScript) |
| `npm run typecheck` | `tsc --noEmit --incremental false` (no shared build-info file, so parallel runs cannot see each other's stale state) |
| `npm test` | Vitest unit tests (`tests/unit`); the database-backed suites run when `DATABASE_URL` points at a migrated database |
| `npm run test:e2e` | Playwright (`tests/e2e`) against a dev server it starts, or one you point at with `E2E_BASE_URL` |
| `npm run test:e2e:prod` | `next build`, then the same Playwright suite against `next start` (the real production server). Extra arguments go to Playwright. `ui.spec.ts` drives the dev-only `/styleguide` and skips itself here: run it with `npm run test:e2e` |
| `npm run qa:final` | Screenshots of every route and key sheet (fa/en × light/dark × 390/1280) into `.qa/final/` plus a `REPORT.txt`: `DATABASE_URL=… BASE_URL=http://localhost:3100 npm run qa:final` against a running production server on a seeded database |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Demo seed (idempotent), **development only**: refuses to run with `NODE_ENV=production` unless `SEED_DEMO=1` is set |
| `npm run db:seed:base` | Production base data, no users (idempotent): the settings row, default weekly availability, the 1,324 exercises with Persian names. Never overwrites what the coach changed |
| `npm run create-coach -- --phone 0912… --name "…" [--name-fa "…"]` | Creates (or promotes) the coach. Password from `COACH_PASSWORD` (at least 10 characters) or generated and printed once. Idempotent on the phone; see Deploy |
| `npm run db:reset` | `prisma migrate reset` + demo seed: **destructive, see below** (refused first when the demo seed would be refused) |
| `npm run i18n:check` | Compares message keys across locales; also flags Arabic ي/ك, a missing ZWNJ after «می» and mismatched ICU placeholders |

Also: `node scripts/contrast-check.mjs` (WCAG audit of the colour tokens, both themes) and
`bash scripts/build-pages.sh` (rebuild `docs/index.html` from the design preview).

### Resetting the database

`npm run db:reset` drops every table, re-applies the migrations and re-seeds. Prisma refuses to run
`migrate reset` from an AI agent session unless the human gives explicit consent through
`PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. **Run `npm run db:reset` yourself, in your own terminal, and never set
that variable on an agent's behalf.** Never point it at a database with real data.

### Tests

- `npm test` needs nothing but Node; with `DATABASE_URL` set to a migrated database it also runs the server-action
  suites (they create and delete their own rows, the seed is not required).
- Playwright uses the preinstalled Chromium at `/opt/pw-browsers/chromium` (override with `PW_CHROMIUM_PATH`); never run
  `playwright install` in the sandbox. The suites expect the seeded database. Variables: `E2E_BASE_URL` (default
  `http://localhost:3100`), `E2E_PORT`, `PW_OUTPUT_DIR` (traces and screenshots, default `./test-results`),
  `DATABASE_URL` (so the tests that plant rows can reach the same database as the server).
- `tests/e2e/a11y.spec.ts` runs axe-core (WCAG 2.0 A/AA, 2.1 AA, 2.2 AA) on every route of the route map as the right
  role, in fa and en, light and dark, at 390 and 1280 px, plus the open booking, add-client, exercise-picker and
  edit-set sheets. It needs `DATABASE_URL` (it plants an open workout and a throwaway empty client and removes them
  again). Automated checks cover only part of WCAG; keyboard and screen-reader behaviour are checked by the other specs
  and by hand.
- Playwright runs with one worker: the specs share one database and some change global state on purpose.
- **CI** (`.github/workflows/ci.yml`) runs on every push and pull request: Postgres 16 service, `npm ci`,
  `prisma migrate deploy`, lint, typecheck, unit tests, `i18n:check` and `next build`. It does **not** run the Playwright
  end-to-end tests yet; run `npm run test:e2e` (or `test:e2e:prod`) before a release.
- Parallel dev servers: `NEXT_DIST_DIR=.next-foo npm run dev -- -p 3101` (the dist dir is read in `next.config.ts`).
  Next may add `.next-foo/types/**/*.ts` to `tsconfig.json` `include`; do not commit that line. `next-env.d.ts` is
  generated and gitignored.

## Deploy with Docker Compose (a VPS)

`Dockerfile` builds a self-contained production image (multi-stage, Debian bookworm-slim with Node 22, Next.js
standalone server, runs as a non-root user). On start its entrypoint applies pending migrations
(`prisma migrate deploy`, which never drops data) and then starts the server. `docker-compose.yml` runs it next to
PostgreSQL 16 with a named volume and a health check.

```bash
# on the server: Docker Engine with the compose plugin, git
git clone https://github.com/Masihkermani/GYM-workout-app.git daftar && cd daftar

cp .env.example .env
#   edit .env: set POSTGRES_PASSWORD (letters and digits only: `openssl rand -hex 24`)
#   and NEXT_PUBLIC_SITE_URL=https://your-domain (baked in at build time)

docker compose up -d --build        # builds the image, starts db + app, migrations run automatically
docker compose logs -f app          # "[daftar] applying database migrations" ... "Ready"

# first time only: the base data (settings, default hours, the 1,324-exercise library; no users) ...
docker compose --profile tools run --rm seed

# ... and your coach account. Pick the password yourself (10+ characters; not echoed, not stored in .env) ...
read -rs COACH_PASSWORD && export COACH_PASSWORD
docker compose --profile tools run --rm create-coach --phone 09121234567 --name "Your Name" --name-fa "نام شما"
# ... or leave COACH_PASSWORD unset and the command generates one and prints it once. Store it right away.
```

**Production never gets the demo data.** `seed` runs `npm run db:seed:base`, which creates no users. The demo seed
(`npm run db:seed`: a coach and six clients whose passwords are printed in this README) refuses to run when
`NODE_ENV=production`, and the `seed` and `create-coach` containers set it. A demo or staging server that really wants
those accounts says so explicitly: `docker compose --profile tools run --rm -e SEED_DEMO=1 seed npm run db:seed`.

`create-coach` is idempotent on the phone number: run again, it updates the same account and leaves its password alone
(`COACH_PASSWORD` or `--reset-password` changes it and signs the account out everywhere). It refuses passwords shorter
than 10 characters, the two published demo passwords, one repeated character, and the phone number itself. A client who
already registered with that number is promoted to coach (reactivated, with a new password and no old sessions). It also
puts `--name` / `--name-fa` into the public settings, and warns if other active coach accounts exist.

The compose file publishes the app on `127.0.0.1:3000` only, so nothing is exposed until you put a reverse proxy in
front of it.

### HTTPS is required

The session cookie `daftar_session` is `httpOnly`, `SameSite=Lax` and **`Secure` in production**: browsers drop it over
plain `http://` (except on `localhost`), so login only works behind HTTPS. A [Caddy](https://caddyserver.com) site
block is enough (it gets and renews the certificate itself):

```
daftar.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:3000
}
```

Keep the container's `HOSTNAME=0.0.0.0` (set in the Dockerfile): the standalone server then answers with relative
redirects, which is what a reverse proxy needs.

### Sessions, cookies and limits

- `daftar_session`: 32 random bytes in the cookie, only their SHA-256 in the database, 30 days. Logging out, changing
  a password (other devices are signed out), a coach's password reset and deactivating a user all end sessions on the
  server side.
- `daftar_role`: a non-secret hint the middleware uses to bounce a client from `/coach`. It is never trusted: every page
  and server action re-checks the session.
- `theme`: light or dark preference (one year).
- Login rate limiting (5 failures per phone per 15 minutes) lives in memory: right for one app container, reset on
  restart. Use a shared store before running more than one instance.
- There are no secrets other than the database password in `.env`. `.env` is git-ignored and excluded from the image.

### Running in Iran

Nothing is fetched at runtime: fonts are bundled (`@fontsource-variable`), there is no Google Fonts, no CDN, no
analytics, no map or auth provider, and Next.js telemetry is off in the image. The server needs no outbound access
beyond what you choose to add. **Building** the image does need the npm registry, `binaries.prisma.sh` (Prisma engines)
and Docker Hub / Debian mirrors, and some of those may be filtered from inside Iran. Then either build on another
machine and ship the image (`docker save daftar:latest | ssh vps docker load`), or set `NPM_CONFIG_REGISTRY` and
`PRISMA_ENGINES_MIRROR` in `.env` to mirrors you can reach (they are passed as build arguments).

### Operations

```bash
docker compose up -d --build                                              # update: git pull, then this
docker compose exec db pg_dump -U daftar daftar > daftar-$(date +%F).sql  # backup
docker compose exec -T db psql -U daftar daftar < daftar-2026-10-23.sql   # restore into an empty database
```

> Status: the production build, the standalone server that the image runs, the Argon2 native binding, the Prisma
> engine and login were exercised outside Docker on a glibc Linux host. The image itself (apt, `npm ci` and the Prisma
> engine download inside a container) has not been built end to end yet: do a first `docker compose build` on the
> server and check `docker compose logs app`.

## GitHub Pages

Only the **design preview** is static: GitHub Pages can serve `docs/index.html` (Settings → Pages → deploy from the
`main` branch, `/docs` folder). The app itself needs a Node server and PostgreSQL, so it cannot run on GitHub Pages;
use the Docker deployment above (or any host that runs Node 22 and Postgres).

## Notes

- **Auth**: the middleware only checks that the `daftar_session` cookie exists (UX redirect to `/login?next=`). Every
  page and server action re-checks with `requireUser()` / `requireCoach()`.
- **Theme**: follows `prefers-color-scheme`; the toggle stores `theme=light|dark` in a cookie that the server reads.
- **Locale**: always-prefixed routes (`/fa/...`, `/en/...`). `/` goes to `/fa`; the language is never guessed from the browser.
- **Time**: instants are stored in UTC; wall-clock logic runs in the coach time zone (`CoachSettings.timezone`, default `Asia/Tehran`).
- **Dates and numbers** are formatted by `src/lib/format.ts` only (Jalali calendar and Persian digits in fa), composed from
  `Intl` parts so the server and the browser print identical strings.

## Licensing

**Application code**: no license file has been chosen yet, so by default all rights are reserved. Add a `LICENSE` before
accepting outside contributions or publishing it as open source.

**Exercise data** (`data/exercises/`): the exercise names, body parts, equipment, targets, muscles and English
instruction steps in `exercises.en.json` come from
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (originating from ExerciseDB v1) and
are used under the MIT License below. **No images or GIFs from that dataset are included**: that media is © Gym visual
and is not MIT-licensed, so Daftar ships exercise text only, with no visual media. The Persian names in
`exercises.fa.json` were written for this project. The same notice, with the dataset's media exception, is in
[`data/exercises/LICENSE-exercises.md`](data/exercises/LICENSE-exercises.md).

<details>
<summary>MIT License (exercise text)</summary>

```
MIT License

Copyright (c) 2026 Hasan Emir Yıldırım

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation and data files (the "Software"),
to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

</details>
