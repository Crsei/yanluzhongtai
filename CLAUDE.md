# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

研录教学管理中台 — an internal teaching-management admin platform for 研录 staff. Phases 0–6 of `docs/spec/0X-Phase*.md` are implemented end-to-end; only Phase 7 (mobile-optimized pass) is still open. When picking up a new feature, start from the spec you're addressing and the matching design doc under `docs/superpowers/specs/`.

**Completed phases (summary):**

- **Phase 0** — auth: `/login`, refresh cookie, `JwtAuthGuard` + `RolesGuard` + `MustChangePasswordGuard`, 4-tier role model (`SUPER_ADMIN` / `ADMIN` / `MEMBER` / guest), `RequireAuth` / `RequireRole` wrappers on the web.
- **Phase 1A** — employees: `/employees` CRUD, Excel import (presign upload + dry-run + commit) via MinIO, `YYNNN` job numbers via `IdSequence`.
- **Phase 1B** — user management: `/user-settings`, `/users`, self-service phone/username/password/deactivate, admin register / reset / role change, force-password-change on first login.
- **Phase 2** — students: `/students` CRUD, `YYNNNN` student numbers, sharable advanced search, `EmployeePicker` shared component, student attachments.
- **Phase 3** — course outlines: `/courses/outline`, version switching, Excel import for outline items.
- **Phase 4** — course records + enrollment: `/courses/list`, `/courses/advanced-search`, `TTKKYYNNN` course numbers, status derived on read, credit hours auto-computed, `StudentPicker`.
- **Phase 5** — payroll: `/payroll` (admins only), `PayrollSettlement` + `PayrollManualRecord`, aggregate view by (teacher, YYYYMM), first-time hourly-rate + historical consistency check.
- **Phase 6** — quick-link centers + about + audit log: `/links` (auth), `/sop` (public), `/about` (public), `/logs` (admins only); QuickLink CRUD with NAVIGATE / COPY / DOWNLOAD kinds and drag-reorder; audit-log list endpoint with 180-day daily purge via `@nestjs/schedule`.

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

- `src/main.ts` — bootstrap, `/api` prefix, CORS from `APP_ORIGIN`, cookie-parser for refresh cookie
- `src/app.module.ts` — imports `ScheduleModule.forRoot()`, `ConfigModule` (env files resolved in order: `apps/api/.env`, then `.env`), all business modules, and three global guards (`JwtAuthGuard` → `RolesGuard` → `MustChangePasswordGuard`)
- `src/config/env.validation.ts` — explicit required-key list; adding a new required env var means adding it here
- `src/common/id-sequence/` — atomic sequence allocator for `employee` / `student` / `course:TTKKYY` kinds; `@Global()`; retention guarantees no-recycle after delete
- `src/common/dictionaries.ts` — enum string-literal unions used by `class-validator` (`EMPLOYMENT_STATUS`, `SERVICE_STATUS`, `TEACHING_TYPE`, `COURSE_STATUS`, `STORAGE_FOLDERS`, …); the web mirrors these in `apps/web/src/constants/dictionaries.ts` — changes must happen in both
- `src/prisma/` — `PrismaService` extends `PrismaClient` with lifecycle hooks; `PrismaModule` is `@Global()`, inject `PrismaService` anywhere without re-importing
- `src/health/` — `GET /api/health` smoke endpoint
- `src/modules/auth/` — login / refresh / logout / me, `@Public()` and `@Roles()` decorators, JWT + Refresh passport strategies, three guards
- `src/modules/users/` — self-service + admin user management (Phase 1B)
- `src/modules/storage/` — MinIO presign upload / download endpoints; `@Global()`; auto-creates `MINIO_BUCKET` on boot
- `src/modules/audit-logs/` — `@Global()` `AuditLogsService.record()` write side + `GET /api/audit-logs` read side + `AuditLogsRetentionService` cron (03:00 daily, 180-day delete). Extend `AuditAction` / `AuditTargetType` in `audit-logs.types.ts` when adding new domains
- `src/modules/employees/` `students/` `course-outlines/` `courses/` `payroll/` `quick-links/` — business modules; each is controller + service (+ import service where Excel import applies) + `dto/` folder. `@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)` decorates write endpoints

### Web layout

- `src/main.tsx` → `src/App.tsx` wires `QueryClientProvider` + AntD `ConfigProvider` (custom theme tokens: `colorPrimary #1d8cff`, `borderRadius 12`) + `RouterProvider`; `MustChangePasswordGate` reacts to auth-store hydration
- `src/router.tsx` — all routes defined here. Login and `/force-password-change` are siblings of the shell; `/user-settings` + `/users` are in a `UserSettingsLayout` sibling (new tab UX); business routes live under `AppShell`
- `src/layouts/AppShell.tsx` — Sider + Header + Content shell; responsive `Drawer` fallback under `lg` via `Grid.useBreakpoint`; footer user panel reads `useAuthStore` (guest vs authenticated)
- `src/config/navigation.tsx` — single source of truth for sidebar items; routes in `router.tsx` must stay in sync with paths here
- `src/styles.css` — global styles (brand colors, card shadows, mobile drawer, Phase 5 payroll money-red, Phase 6 quick-link grid / about / sort modal). Visual rules in `docs/spec/00-全局约束与实施路线.md` §5 are load-bearing — match them when building new pages
- `src/services/http.ts` — `fetch` wrapper with automatic 401 → `/auth/refresh` → retry, and 403 `MUST_CHANGE_PASSWORD` interceptor that redirects to `/force-password-change`
- `src/services/{employees,students,course-outlines,courses,payroll,quickLinks,auditLogs,storage}.ts` — thin API wrappers consumed by TanStack Query hooks under each `features/<domain>/hooks/`
- `src/features/<domain>/` — the convention per domain is: `<Domain>ListPage.tsx` + `<Domain>FormModal.tsx` + delete confirm helper + optional Excel import drawer + `hooks/` folder + `types.ts`. `auth/`, `user-settings/`, `users/`, `employees/`, `students/`, `course-outlines/`, `courses/`, `payroll/`, `quick-links/`, `about/`, `audit-logs/` all follow this layout
- `src/components/EmployeePicker.tsx`, `src/features/courses/StudentPickerModal.tsx` — shared cross-module pickers
- `src/constants/dictionaries.ts` + `src/constants/about.ts` — the former mirrors `common/dictionaries.ts` on the API side; any enum change must go in both
- `src/public/templates/` — static assets for `QuickLinkKind=DOWNLOAD` entries (binaries ignored by `.gitignore`, see Phase 6 design)

### Database

Defined in `apps/api/prisma/schema.prisma`. Enums: `UserRole`, `EmploymentStatus`, `ServiceStatus`, `QuickLinkPageType`, `QuickLinkKind`. Models: `User` (phone-based identity, `deactivatedAt`, `mustChangePassword`), `Employee`, `Student`, `CourseOutlineVersion` + `CourseSection` + `CourseOutlineItem`, `Course`, `Enrollment` (composite PK), `PayrollSettlement`, `PayrollManualRecord`, `QuickLink` (pageType + kind + category + sortOrder), `AuditLog` (indexed on `createdAt` / `operatorId` / `(targetType,targetId)`), `IdSequence` (composite PK `(kind, year)` — sequence allocator for `employee`, `student`, `course:TTKKYY` kinds). Student↔Course is many-to-many via `Enrollment`; `CourseOutlineItem` cascades on version delete.

The current workflow is **`prisma db push`, not migrations.** `docs/technical/deployment.md` explicitly calls out switching to `prisma migrate` before going to real production.

### Docker & deployment

`docker-compose.yml` at the root defines `web` (Nginx + built SPA), `api` (Node), `db` (postgres:16-alpine), and `minio`. Both app Dockerfiles do a workspace-aware `pnpm install --filter ... --no-frozen-lockfile` from the repo root, so the build context must be the repo root, not the app subdirectory. First deploy requires `docker compose run --rm api pnpm prisma:push` to initialize the schema.

## Conventions worth knowing

- **Chinese UI copy.** User-facing strings, spec docs, and most comments are in Simplified Chinese. Keep that when adding pages; English is fine in code identifiers and internal types.
- **Phased implementation.** Each business feature lives against its `docs/spec/0X-Phase*.md`. When you extend an area, re-read the matching spec — it encodes layout, states, buttons, and error text from the original design images, not just requirements.
- **Identifier formats** are spec-mandated and must not recycle numbers after deletion: employee job number `YYNNN`, student number `YYNNNN`, course number `TTKKYYNNN`. `IdSequenceService.allocate(kind, year)` is the only legitimate source.
- **Audit logging.** Writes to `AuditLog` go through `AuditLogsService.record()`; updates automatically split into one row per changed field (`action === "update" || action.endsWith(".update")`). 180-day purge runs 03:00 daily (`AuditLogsRetentionService`).
- **Role gating.** Page-level: `RequireAuth` / `RequireRole` in `router.tsx`. Button-level: read `useAuthStore` and conditionally render. API-level: `@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)` on write endpoints; guest-facing endpoints (`/api/public/sop-links`) explicitly opt in with `@Public()`.
- **Excel import pattern.** Every importable domain follows: `GET …/import/template` (returns xlsx) → frontend presign + direct PUT to MinIO → `POST …/import/dry-run` (returns `{ totalRows, validRows, errors }`) → `POST …/import/commit`. Import batches land in `<domain>/import-batches/` for audit trail.
- **No test / lint scripts.** Per-task verification is `pnpm --filter @yanlu/api build` or `pnpm --filter @yanlu/web build` plus curl smoke + manual browser walk-through. Don't invent `pnpm test` / `pnpm lint`.
- **Schema changes.** Still `prisma db push` (not migrate). Regenerate client via `pnpm prisma:generate`. Switch to `prisma migrate` before real production launch.
- **Runtime state must not be committed.** `.gitignore` excludes `postgres-data/`, `minio-data/`, all `.env` files, per-app `node_modules`/`dist`, and `apps/web/public/templates/*.rar|*.zip`. The `.omx/` directory is also ignored.
