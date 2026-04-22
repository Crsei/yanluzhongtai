# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

研录教学管理中台 — an internal teaching-management admin platform. This is a **first-pass scaffold**: the monorepo layout, shell UI, NestJS bootstrap, and initial Prisma schema are in place, but most business modules under `apps/api/src/modules/*` are empty placeholder directories, login is a stub (no real auth), and there is no RBAC, file upload, or Excel import yet. Expect to fill these in when implementing a phase.

## Commands

Package manager is `pnpm@9` (required — workspace uses `pnpm-workspace.yaml`). The environment is Windows with bash available; use forward slashes in paths.

Root scripts (run from repo root):

```bash
pnpm install
pnpm dev:web              # Vite dev server on :5173
pnpm dev:api              # Nest watch mode on :3000, prefix /api
pnpm debug:api            # Same, with --inspect on 0.0.0.0:9229
pnpm build                # Recursive build across workspace
pnpm prisma:generate      # Regenerate Prisma client
pnpm prisma:push          # Push schema to DB (no migrations yet — see "Database" below)
pnpm compose:up           # docker compose up --build -d
pnpm compose:down
```

Target a single workspace directly when needed:

```bash
pnpm --filter @yanlu/api <script>
pnpm --filter @yanlu/web <script>
```

**No test or lint scripts are configured yet.** Do not invent `pnpm test` / `pnpm lint` — they don't exist. If you add them, wire them into both the app package.json and root.

**Typical local bring-up** (also encoded in `.vscode/tasks.json` as `prepare:local`):

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
docker compose up -d db minio    # infra only
pnpm prisma:push                 # apply schema to Postgres
pnpm dev:api                     # in one shell
pnpm dev:web                     # in another
```

VS Code has `Debug API (NestJS)`, `Launch Web (Chrome)`, and a `Full Stack Debug` compound in `.vscode/launch.json`.

## Architecture

### Monorepo layout

- `apps/web` — React 18 + TypeScript + Vite + Ant Design 5 + React Router 6 + TanStack Query + Zustand
- `apps/api` — NestJS 10 + Prisma 5 + PostgreSQL + class-validator
- `packages/` — reserved for future shared code; currently empty (`.gitkeep` only)
- `infra/nginx/web.conf` — production Nginx config that serves the built SPA and reverse-proxies `/api/` to the `api` service
- `docs/spec/` — **phased requirements** (`00`–`08`); route components in `apps/web/src/router.tsx` explicitly reference these spec files, so features should be implemented phase-by-phase against the corresponding spec
- `docs/technical/` — stack, scaffold structure, deployment notes (source of truth; `docs/architecture/`, `docs/db/`, `docs/api/` etc. are thinner indexes pointing back to `docs/technical`)
- `docs/_docx_extract/` and the `.docx` in `docs/` — the original Chinese requirements doc and its extracted images

### Request flow

Browser → `web` (Nginx in prod / Vite in dev) → `/api/*` → `api` (NestJS) → PostgreSQL + MinIO. The API sets a global `/api` prefix in `apps/api/src/main.ts` and enables CORS against `APP_ORIGIN`. The web app reads `VITE_API_BASE_URL` at build time (`/api` in the Docker build, `http://localhost:3000/api` for local dev).

### API module layout

- `src/main.ts` — bootstrap, `/api` prefix, CORS from `APP_ORIGIN`
- `src/app.module.ts` — imports `ConfigModule` (env files are resolved in order: `apps/api/.env`, then `.env`), `PrismaModule`, `HealthModule`
- `src/config/env.validation.ts` — explicit required-key list; adding a new required env var means adding it here
- `src/prisma/` — `PrismaService` extends `PrismaClient` with lifecycle hooks; `PrismaModule` is `@Global()`, so inject `PrismaService` anywhere without re-importing
- `src/health/` — GET `/api/health` smoke endpoint
- `src/modules/{auth,users,employees,students,course-outlines,courses,payroll,links,audit-logs}/` — **empty placeholder folders.** The eventual per-module convention should be controller/service/repository (DTOs via `class-validator`), registered in `app.module.ts`

### Web layout

- `src/main.tsx` → `src/App.tsx` wires `QueryClientProvider` + AntD `ConfigProvider` (custom theme tokens: `colorPrimary #1d8cff`, `borderRadius 12`) + `RouterProvider`
- `src/router.tsx` — all routes defined here. Login is a sibling of the shell; all business routes live under `AppShell` and currently render a shared `ModulePage` placeholder that just lists milestones + the spec file it maps to
- `src/layouts/AppShell.tsx` — Sider + Header + Content shell, with a responsive `Drawer` fallback under `lg` (`Grid.useBreakpoint`). The `currentUser` is hard-coded pending real auth
- `src/config/navigation.tsx` — single source of truth for sidebar items; routes in `router.tsx` must stay in sync with paths here
- `src/styles.css` — global styles (brand colors, card shadows, mobile drawer). Visual rules in `docs/spec/00-全局约束与实施路线.md` §5 are load-bearing — match them when building new pages
- `src/{components,features,hooks,services,stores,utils}/` — empty, reserved for the planned split when features land

### Database

Defined in `apps/api/prisma/schema.prisma`. Key models: `User` (role enum `SUPER_ADMIN`/`ADMIN`/`MEMBER`, phone-based identity), `Employee`, `Student`, `CourseOutlineVersion` + `CourseOutlineItem`, `Course`, `Enrollment` (composite PK), `PayrollSettlement`, `QuickLink`, `AuditLog`. Student↔Course is many-to-many via `Enrollment`; `CourseOutlineItem` cascades on version delete.

The current workflow is **`prisma db push`, not migrations.** `docs/technical/deployment.md` explicitly calls out switching to `prisma migrate` before going to real production.

### Docker & deployment

`docker-compose.yml` at the root defines `web` (Nginx + built SPA), `api` (Node), `db` (postgres:16-alpine), and `minio`. Both app Dockerfiles do a workspace-aware `pnpm install --filter ... --no-frozen-lockfile` from the repo root, so the build context must be the repo root, not the app subdirectory. First deploy requires `docker compose run --rm api pnpm prisma:push` to initialize the schema.

## Conventions worth knowing

- **Chinese UI copy.** User-facing strings, spec docs, and most comments are in Simplified Chinese. Keep that when adding pages; English is fine in code identifiers and internal types.
- **Phased implementation.** Each business feature should be implemented against its corresponding `docs/spec/0X-Phase*.md` — the specs capture both data fields and UI structure (layout, states, buttons) derived from the original design images, not just requirements.
- **Identifier formats** are spec-mandated and must not recycle numbers after deletion: employee job number `YYNNN`, student number `YYNNNN`, course number `TTKKYYNNN` (see spec §4.2).
- **Audit logging.** Create/edit/delete/settle/permission-change/register/deregister all need to write to `AuditLog`; retention target is 180 days (spec §4.3).
- **Runtime state must not be committed.** `.gitignore` excludes `postgres-data/`, `minio-data/`, all `.env` files, and per-app `node_modules`/`dist`. The `.omx/` directory is also ignored.
