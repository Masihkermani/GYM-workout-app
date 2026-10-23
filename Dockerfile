# syntax=docker/dockerfile:1.7
#
# Production image for Daftar (Next.js 15 standalone server + Prisma migrations at start).
#
#   docker build -t daftar .
#   docker compose up -d --build        # recommended: app + PostgreSQL 16 (see docker-compose.yml)
#
# Base: Debian bookworm-slim (glibc), not Alpine. @node-rs/argon2 ships prebuilt glibc and musl
# binaries, but Prisma's engines and every native module are best supported on glibc, so there is
# nothing to compile and nothing to patch. OpenSSL is installed because the Prisma engines need it.
#
# Behind a restricted network (for example a VPS in Iran) the build needs the npm registry and
# binaries.prisma.sh. Pass mirrors as build args if the defaults are unreachable:
#   --build-arg npm_config_registry=https://your-mirror/   --build-arg PRISMA_ENGINES_MIRROR=https://your-mirror/prisma
# or build the image on another machine and ship it (`docker save daftar | ssh vps docker load`).

ARG NODE_VERSION=22

# ------------------------------------------------------------------------------------------ base
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ------------------------------------------------------------------------------------------ deps
FROM base AS deps
ARG npm_config_registry
ARG PRISMA_ENGINES_MIRROR
COPY package.json package-lock.json ./
# `postinstall` runs `prisma generate`, which needs the schema
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

# ----------------------------------------------------------------------------------------- build
# Also the image the one-off `seed` service of docker-compose.yml runs (it has the sources and tsx).
FROM base AS build
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# No database is needed to build (every page that reads data is rendered per request); this only
# satisfies Prisma's env("DATABASE_URL") if anything reads it while compiling.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build

# --------------------------------------------------------------------------------- prisma-cli
# The Prisma CLI (a devDependency, so absent from the standalone output) in its own folder, used
# only by the entrypoint for `prisma migrate deploy`. Keep PRISMA_VERSION equal to package.json.
FROM base AS prisma-cli
ARG PRISMA_VERSION=6.19.3
ARG npm_config_registry
ARG PRISMA_ENGINES_MIRROR
RUN mkdir /prisma-cli \
 && cd /prisma-cli \
 && npm init -y >/dev/null \
 && npm install "prisma@${PRISMA_VERSION}" --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------------------------------- runner
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 daftar \
 && useradd --system --uid 1001 --gid daftar --home-dir /app --shell /usr/sbin/nologin daftar

# standalone server (traced node_modules included), then the static assets it does not copy itself
COPY --from=build --chown=daftar:daftar /app/.next/standalone ./
COPY --from=build --chown=daftar:daftar /app/.next/static ./.next/static
COPY --from=build --chown=daftar:daftar /app/public ./public
# schema + migrations for `prisma migrate deploy`, and the CLI that runs them
COPY --from=build --chown=daftar:daftar /app/prisma/schema.prisma /app/prisma/schema.prisma
COPY --from=build --chown=daftar:daftar /app/prisma/migrations /app/prisma/migrations
COPY --from=prisma-cli --chown=daftar:daftar /prisma-cli /opt/prisma-cli
COPY --chown=daftar:daftar docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER daftar
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/fa/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "server.js"]
