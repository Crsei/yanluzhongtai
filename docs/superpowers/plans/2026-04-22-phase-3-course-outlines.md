# Phase 3 — 课程大纲管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Phase 3 per `docs/superpowers/specs/2026-04-22-phase-3-course-outlines-design.md`: version-scoped `CourseSection` + `CourseOutlineItem` CRUD, inline section creation, xlsx-template-driven overwrite import, high-risk confirm flows, and the `/courses/outline` page, all audit-logged.

**Architecture:** A new `CourseOutlinesModule` on the backend owns three services (versions, items, overwrite import) plus a reusable version-name utility under `common/course-outline-version/`. The Prisma schema grows one new model (`CourseSection`) and a `@@unique` on `CourseOutlineItem`. The existing `StorageService` / `AuditLogsService` / `RequireAuth` / `@Roles` infrastructure from Phase 1A/1B is reused verbatim. Frontend introduces `features/course-outlines/` (page + 4 modals + 1 drawer + 3 hooks) plus one brand-new cross-module component (`components/EmployeePicker.tsx`) extracted from the Phase 2 spec as a prerequisite, and mounts a `/courses/outline` sub-route while leaving `/courses` as a breadcrumb `ModulePage` that links into it.

**Tech Stack:** NestJS 10 + Prisma 5 + `exceljs` ^4 + `minio` ^8 + class-validator on the backend; React 18 + Vite + AntD 5 + TanStack Query 5 + Zustand + React Router 6 on the frontend. No new third-party dependencies.

**Source spec:** [`docs/superpowers/specs/2026-04-22-phase-3-course-outlines-design.md`](../specs/2026-04-22-phase-3-course-outlines-design.md)
**Phase requirement:** [`docs/spec/04-Phase3-课程大纲管理.md`](../../spec/04-Phase3-课程大纲管理.md)

---

## Testing posture

The repo has no automated test runner (per `CLAUDE.md`: "No test or lint scripts are configured yet. Do not invent `pnpm test`."). Phase 1A/1B established a "verify-then-commit" pattern using manual curl / psql / browser checks — Phase 3 follows the same pattern. Each task's **Verify** step tells you exactly what to run and what output to expect.

## Prerequisites (run once before Task 1)

Phase 3 assumes Phase 1A (employees + storage + audit-logs + id-sequence + dictionaries) and Phase 1B (users + auth guards + `RequireAuth` / `RequireRole`) are already merged. Check:

```bash
# Should all exist and compile
test -d apps/api/src/modules/employees
test -d apps/api/src/modules/users
test -d apps/api/src/modules/storage
test -d apps/api/src/modules/audit-logs
test -f apps/web/src/features/auth/RequireRole.tsx
test -f apps/web/src/services/storage.ts
test -f apps/web/src/services/http.ts
```

**Phase 2 note.** The Phase 3 design (§1) calls out a hard dependency on the Phase 2 `EmployeePicker` + `excludeResigned` backend toggle. If Phase 2 has **not** landed yet, Tasks 4 and 11 in this plan extract those two artefacts as prerequisites — they're tagged "extracted from Phase 2" and can be cherry-picked into Phase 2 later without conflict. If Phase 2 **has** landed and those artefacts already exist, skip Task 4 and Task 11 (just confirm the files match the signatures this plan expects) and move on.

Bring up infra and regenerate the Prisma client once before Task 1:

```bash
pnpm install
docker compose up -d db minio
pnpm prisma:generate

test -f .env || cp .env.example .env
test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
test -f apps/web/.env || cp apps/web/.env.example apps/web/.env
```

You should be on a clean git tree (`git status` empty) before starting Task 1. If you are not in a git worktree, consider creating one:

```bash
git worktree add ../yanlu-phase-3 -b feature/phase-3-course-outlines
```

For curl-based verification across tasks, set these shell vars once at the start of your session (replace `SEED_*` values with whatever your local seed uses):

```bash
export API=http://localhost:3000/api
export TOKEN=$(curl -s -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"your-seed-password","rememberMe":false}' \
  | jq -r .accessToken)
# Sanity:
curl -s -H "Authorization: Bearer $TOKEN" $API/health
# Expected: {"status":"ok"} or similar
```

---

## File Structure

### Backend (`apps/api`)

**Create:**
- `src/common/course-outline-version/version-name.ts` — pure functions for parsing/formatting/computing the next `课程大纲-YYA` name
- `src/modules/course-outlines/course-outlines.module.ts`
- `src/modules/course-outlines/course-outlines.controller.ts`
- `src/modules/course-outlines/course-outlines.service.ts` — version-level CRUD + isActive maintenance
- `src/modules/course-outlines/course-outline-items.service.ts` — item add/update/delete (with inline section creation)
- `src/modules/course-outlines/course-outline-import.service.ts` — xlsx template generation + dryRun + commit overwrite
- `src/modules/course-outlines/course-outlines.types.ts`
- `src/modules/course-outlines/dto/create-item.dto.ts`
- `src/modules/course-outlines/dto/update-item.dto.ts`
- `src/modules/course-outlines/dto/delete-items.dto.ts`
- `src/modules/course-outlines/dto/create-section.dto.ts`
- `src/modules/course-outlines/dto/delete-version.dto.ts`
- `src/modules/course-outlines/dto/import.dto.ts`

**Modify:**
- `prisma/schema.prisma` — add `CourseSection` model, `CourseOutlineVersion.sections` relation + `@@index([isActive])`, `CourseOutlineItem @@unique([outlineVersionId, sectionCode, sequenceNo])` + `@@index([outlineVersionId, sectionCode])`
- `src/common/dictionaries.ts` — add `TEACHING_TYPE` + type; append `"course-outlines/import-batches"` to `STORAGE_FOLDERS`
- `src/modules/employees/dto/query-employees.dto.ts` — add `excludeResigned?: boolean` (Phase 2 extract)
- `src/modules/employees/employees.service.ts` — honour `excludeResigned` in `list()` WHERE (Phase 2 extract)
- `src/modules/audit-logs/audit-logs.types.ts` — extend `AuditAction` with `"import_overwrite"` and `AuditTargetType` with `"course_outline_version"` / `"course_outline_item"`
- `src/app.module.ts` — register `CourseOutlinesModule`

### Frontend (`apps/web`)

**Create:**
- `src/components/EmployeePicker.tsx` — reusable single-employee selector that hides 已离职 (Phase 2 extract; used by AddOutlineItemModal / EditOutlineItemModal and all future modules)
- `src/services/course-outlines.ts`
- `src/features/course-outlines/types.ts`
- `src/features/course-outlines/CourseOutlinePage.tsx`
- `src/features/course-outlines/OutlineVersionDropdown.tsx`
- `src/features/course-outlines/CreateVersionConfirm.tsx`
- `src/features/course-outlines/DeleteVersionConfirm.tsx`
- `src/features/course-outlines/AddOutlineItemModal.tsx`
- `src/features/course-outlines/EditOutlineItemModal.tsx`
- `src/features/course-outlines/DeleteItemsConfirm.tsx`
- `src/features/course-outlines/ImportOverwriteDrawer.tsx`
- `src/features/course-outlines/hooks/useOutlineVersions.ts`
- `src/features/course-outlines/hooks/useOutline.ts`
- `src/features/course-outlines/hooks/useOutlineMutations.ts`

**Modify:**
- `src/constants/dictionaries.ts` — add `TEACHING_TYPE` + labels + options (mirror of backend)
- `src/services/storage.ts` — extend the `StorageFolder` union with `"course-outlines/import-batches"`
- `src/services/employees.ts` — allow `excludeResigned?: boolean` in `EmployeeQueryParams` + URL (Phase 2 extract; used by EmployeePicker)
- `src/features/employees/types.ts` — add `excludeResigned?: boolean` to `EmployeeQueryParams` (Phase 2 extract)
- `src/router.tsx` — add `/courses/outline` subroute + adjust `/courses` `ModulePage` to link into it
- `src/styles.css` — minor rules for section cards / outline toolbar one-line layout (only if existing rules don't suffice)

---

## Task 1: Prisma schema — add `CourseSection` model and tighten `CourseOutlineItem`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Replace the `CourseOutlineVersion` and `CourseOutlineItem` blocks and add `CourseSection`**

Open `apps/api/prisma/schema.prisma`. Replace the existing `CourseOutlineVersion` and `CourseOutlineItem` models (currently lines 88–108) with:

```prisma
model CourseOutlineVersion {
  id          String              @id @default(cuid())
  versionName String              @unique
  isActive    Boolean             @default(false)
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  sections    CourseSection[]
  items       CourseOutlineItem[]
  courses     Course[]

  @@index([isActive])
}

model CourseSection {
  id               String @id @default(cuid())
  outlineVersionId String
  code             String
  name             String
  displayOrder     Int    @default(0)
  outlineVersion   CourseOutlineVersion @relation(fields: [outlineVersionId], references: [id], onDelete: Cascade)

  @@unique([outlineVersionId, code])
}

model CourseOutlineItem {
  id                    String               @id @default(cuid())
  outlineVersionId      String
  sectionCode           String
  sequenceNo            String
  secondaryCategoryName String
  suggestedTeachingType String
  plannedTeacherJobNo   String?
  lessonPlanUrl         String?
  outlineVersion        CourseOutlineVersion @relation(fields: [outlineVersionId], references: [id], onDelete: Cascade)

  @@unique([outlineVersionId, sectionCode, sequenceNo])
  @@index([outlineVersionId, sectionCode])
}
```

- [ ] **Step 2: Regenerate the Prisma client**

```bash
pnpm prisma:generate
```

Expected: prints "Generated Prisma Client (vX.Y.Z) ... in NNN ms". If you see a Rust panic about duplicate relations, re-read Step 1 for typos.

- [ ] **Step 3: Push the schema to the dev database**

```bash
pnpm prisma:push
```

Expected output ends with "Your database is now in sync with your Prisma schema."

If you see a "would delete data" warning, it means a local dev seed wrote rows into `CourseOutlineVersion` or `CourseOutlineItem`. They are development data only; rerun with `pnpm --filter @yanlu/api prisma db push --schema prisma/schema.prisma --accept-data-loss`.

- [ ] **Step 4: Verify the new table and constraints exist**

```bash
docker compose exec -T db psql -U yanlu -d yanluzhongtai \
  -c "\d \"CourseSection\"" \
  -c "\d \"CourseOutlineItem\"" \
  -c "\d \"CourseOutlineVersion\""
```

Expected:
- `CourseSection` lists `outlineVersionId`, `code`, `name`, `displayOrder`, a foreign key to `CourseOutlineVersion(id) ON DELETE CASCADE`, and a unique index on `(outlineVersionId, code)`.
- `CourseOutlineItem` shows a unique index on `(outlineVersionId, sectionCode, sequenceNo)` and a non-unique index on `(outlineVersionId, sectionCode)`.
- `CourseOutlineVersion` shows a non-unique index on `isActive`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(prisma)(phase-3): add CourseSection model and tighten CourseOutlineItem constraints"
```

---

## Task 2: Backend dictionaries — `TEACHING_TYPE` + `STORAGE_FOLDERS` augment

**Files:**
- Modify: `apps/api/src/common/dictionaries.ts`

- [ ] **Step 1: Append the new constants**

Open `apps/api/src/common/dictionaries.ts`. Append at the end of the file (after the existing `STORAGE_FOLDERS` export):

```ts
// ---- Phase 3: 建议/实际授课方式 ----
export const TEACHING_TYPE = ["公共课", "1v1", "小班课", "录播", "其他"] as const;
export type TeachingType = (typeof TEACHING_TYPE)[number];
```

Then extend the existing `STORAGE_FOLDERS` array by inserting one line **before** the closing `] as const;`. The resulting block should read:

```ts
export const STORAGE_FOLDERS = [
  "employees/attachments",
  "employees/import-batches",
  "course-outlines/import-batches",
] as const;
export type StorageFolder = (typeof STORAGE_FOLDERS)[number];
```

- [ ] **Step 2: Verify the file compiles**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/dictionaries.ts
git commit -m "feat(api)(phase-3): add TEACHING_TYPE dictionary and course-outlines import storage folder"
```

---

## Task 3: Version name utility — pure functions under `common/course-outline-version/`

**Files:**
- Create: `apps/api/src/common/course-outline-version/version-name.ts`

- [ ] **Step 1: Create the file**

```ts
// apps/api/src/common/course-outline-version/version-name.ts

export const VERSION_NAME_PREFIX = "课程大纲-";

export type ParsedVersion = { year: number; letter: string };

/**
 * Parse names like "课程大纲-24A" into { year: 2024, letter: "A" }.
 * Returns null when the input does not match the canonical format.
 */
export function parseVersionName(name: string): ParsedVersion | null {
  const m = /^课程大纲-(\d{2})([A-Z])$/.exec(name);
  if (!m) return null;
  return { year: 2000 + Number(m[1]), letter: m[2] };
}

export function formatVersionName(year: number, letter: string): string {
  const yy = String(year).slice(-2).padStart(2, "0");
  return `${VERSION_NAME_PREFIX}${yy}${letter}`;
}

/**
 * Given the currently-active version (or null when none exists) and the
 * current calendar year, compute the next version name.
 *
 * Rules (§4.1 of the Phase 3 design):
 *   - No active version → {nowYear}A
 *   - active.year < nowYear → {nowYear}A (new year resets the letter)
 *   - active.year === nowYear and letter < 'Z' → letter + 1
 *   - active.year === nowYear and letter === 'Z' → throw (business limit)
 *   - active.year > nowYear (clock skew) → keep advancing letters on active.year
 */
export function computeNextVersionName(
  latest: ParsedVersion | null,
  nowYear: number,
): string {
  if (!latest) return formatVersionName(nowYear, "A");
  if (latest.year < nowYear) return formatVersionName(nowYear, "A");
  if (latest.letter === "Z") {
    throw new Error(`已达 ${latest.year} 年度版本上限(Z),请在下一年度创建`);
  }
  const nextLetter = String.fromCharCode(latest.letter.charCodeAt(0) + 1);
  return formatVersionName(latest.year, nextLetter);
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Smoke-test the pure functions from the REPL**

The repo has no unit-test runner, but the helpers are pure, so a one-liner via `tsx`/`node` is enough:

```bash
pnpm --filter @yanlu/api exec tsx -e "
  import { parseVersionName, computeNextVersionName } from './src/common/course-outline-version/version-name';
  console.assert(JSON.stringify(parseVersionName('课程大纲-24A')) === JSON.stringify({ year: 2024, letter: 'A' }), 'parse A');
  console.assert(parseVersionName('bad') === null, 'parse bad');
  console.assert(computeNextVersionName(null, 2024) === '课程大纲-24A', 'from null');
  console.assert(computeNextVersionName({ year: 2024, letter: 'A' }, 2024) === '课程大纲-24B', 'A->B');
  console.assert(computeNextVersionName({ year: 2023, letter: 'C' }, 2024) === '课程大纲-24A', 'year reset');
  let threw = false; try { computeNextVersionName({ year: 2024, letter: 'Z' }, 2024); } catch { threw = true; }
  console.assert(threw, 'Z throws');
  console.log('version-name helpers OK');
"
```

Expected: `version-name helpers OK`. Any `AssertionError` means re-read Step 1.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/common/course-outline-version/version-name.ts
git commit -m "feat(api)(phase-3): add course-outline version-name helpers"
```

---

## Task 4: Extract Phase 2 prerequisite — `excludeResigned` on employees query

**Files:**
- Modify: `apps/api/src/modules/employees/dto/query-employees.dto.ts`
- Modify: `apps/api/src/modules/employees/employees.service.ts`

> **Skip this task if Phase 2 has already landed and the DTO + service already honour `excludeResigned`.** Re-read both files; if both already contain the additions below, go straight to Task 5.

- [ ] **Step 1: Extend `QueryEmployeesDto` with `excludeResigned`**

Open `apps/api/src/modules/employees/dto/query-employees.dto.ts`. Replace its contents with:

```ts
import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import {
  EMPLOYMENT_STATUS,
  EmploymentStatus,
} from "../../../common/dictionaries";

export class QueryEmployeesDto {
  @IsOptional() @IsString()
  keyword?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt() @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt() @Min(1) @Max(200)
  pageSize?: number;

  @IsOptional()
  @IsIn(EMPLOYMENT_STATUS as unknown as string[])
  employmentStatus?: EmploymentStatus;

  /**
   * Phase 2/3 shared selector behaviour — when `true`, drops RESIGNED
   * employees from the list. Kept as a separate toggle (rather than a
   * multi-valued `employmentStatus`) to preserve the existing single-value
   * filter semantics used by the employee list page.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  excludeResigned?: boolean;
}
```

- [ ] **Step 2: Honour the toggle in `EmployeesService.list`**

Open `apps/api/src/modules/employees/employees.service.ts`. Inside the `list()` method, immediately **after** the existing `if (query.employmentStatus) { ... }` block and **before** the `if (query.keyword …)` block, insert:

```ts
    if (query.excludeResigned === true) {
      where.employmentStatus = {
        not: "RESIGNED",
      } as Prisma.EnumEmploymentStatusFilter;
    }
```

Then extend `buildSortedListQuery` so the raw-SQL path understands the same filter. Open the private method and locate the block:

```ts
    if (where.employmentStatus) {
      conditions.push(Prisma.sql`"employmentStatus"::text = ${where.employmentStatus as string}`);
    }
```

Replace it with:

```ts
    if (where.employmentStatus) {
      if (typeof where.employmentStatus === "string") {
        conditions.push(Prisma.sql`"employmentStatus"::text = ${where.employmentStatus}`);
      } else if (
        typeof where.employmentStatus === "object" &&
        "not" in where.employmentStatus &&
        typeof (where.employmentStatus as { not: unknown }).not === "string"
      ) {
        const notValue = (where.employmentStatus as { not: string }).not;
        conditions.push(Prisma.sql`"employmentStatus"::text <> ${notValue}`);
      }
    }
```

This keeps the existing single-value path working while adding a `<>` branch for `excludeResigned`.

- [ ] **Step 3: Verify compilation**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Verify the endpoint behaviour with curl**

Start the API in another terminal (`pnpm dev:api`). Seed at least one RESIGNED employee if your local DB doesn't have one (via the `/api/employees` POST + PATCH flow or directly through psql).

```bash
# Without the toggle — should include RESIGNED
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/employees?employmentStatus=RESIGNED" | jq '.total'

# With the toggle — should return 0 even when asking for RESIGNED explicitly
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/employees?excludeResigned=true" | jq '[.items[] | select(.employmentStatus == "RESIGNED")] | length'
```

Expected: first query returns a positive integer (or `0` if your seed has none — seed one first). Second query returns `0`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/employees/dto/query-employees.dto.ts apps/api/src/modules/employees/employees.service.ts
git commit -m "feat(api)(phase-2-extract): add excludeResigned toggle to employees query"
```

---

## Task 5: DTOs + `course-outlines.types.ts`

**Files:**
- Create: `apps/api/src/modules/course-outlines/course-outlines.types.ts`
- Create: `apps/api/src/modules/course-outlines/dto/create-item.dto.ts`
- Create: `apps/api/src/modules/course-outlines/dto/update-item.dto.ts`
- Create: `apps/api/src/modules/course-outlines/dto/delete-items.dto.ts`
- Create: `apps/api/src/modules/course-outlines/dto/create-section.dto.ts`
- Create: `apps/api/src/modules/course-outlines/dto/delete-version.dto.ts`
- Create: `apps/api/src/modules/course-outlines/dto/import.dto.ts`

- [ ] **Step 1: Create the shared types**

```ts
// apps/api/src/modules/course-outlines/course-outlines.types.ts
import type { CourseOutlineItem, CourseOutlineVersion, CourseSection } from "@prisma/client";

export type VersionListItem = {
  id: string;
  versionName: string;
  isActive: boolean;
  itemCount: number;
  createdAt: Date;
};

export type PlannedTeacherSummary = {
  jobNo: string;
  name: string;
  employmentStatus: string;
};

export type ActualTeacherSummary = {
  jobNo: string;
  name: string;
  employmentStatus: string;
  courseCount: number;
};

export type CourseOutlineItemDetail = CourseOutlineItem & {
  plannedTeacher: PlannedTeacherSummary | null;
  actualTeachers: ActualTeacherSummary[];
};

export type VersionDetail = {
  version: CourseOutlineVersion;
  sections: CourseSection[];
  items: CourseOutlineItemDetail[];
};

export type ImportRowError = {
  row: number;
  field: string;
  message: string;
};

export type OutlineImportReport = {
  totalRows: number;
  validRows: number;
  uniqueSections: number;
  errors: ImportRowError[];
};

export type OutlineImportCommitResult = {
  createdSections: number;
  createdItems: number;
  errors: ImportRowError[];
};
```

- [ ] **Step 2: `create-section.dto.ts` (inline-newSection payload + also reusable for the standalone endpoint)**

```ts
// apps/api/src/modules/course-outlines/dto/create-section.dto.ts
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from "class-validator";

export class CreateSectionDto {
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: "板块代码需为两位大写字母" })
  code!: string;

  @IsString() @MaxLength(50)
  name!: string;

  @IsOptional() @IsInt() @Min(0)
  displayOrder?: number;
}
```

- [ ] **Step 3: `create-item.dto.ts`**

```ts
// apps/api/src/modules/course-outlines/dto/create-item.dto.ts
import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  Max,
  ValidateIf,
  ValidateNested,
  IsUrl,
} from "class-validator";
import { TEACHING_TYPE, TeachingType } from "../../../common/dictionaries";
import { CreateSectionDto } from "./create-section.dto";

export class CreateItemDto {
  /** One of sectionCode / newSection must be provided. */
  @ValidateIf((o: CreateItemDto) => !o.newSection)
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: "板块代码需为两位大写字母" })
  sectionCode?: string;

  @ValidateIf((o: CreateItemDto) => !o.sectionCode)
  @ValidateNested()
  @Type(() => CreateSectionDto)
  newSection?: CreateSectionDto;

  /**
   * Accepts 1–99 as string (UI passes "01"/"02" after pad) or the raw number.
   * Service pads to two digits before persisting.
   */
  @IsString()
  @Matches(/^\d{1,2}$/, { message: "序列号需为 1-2 位数字" })
  sequenceNo!: string;

  @IsString() @MaxLength(100)
  secondaryCategoryName!: string;

  @IsIn(TEACHING_TYPE as unknown as string[])
  suggestedTeachingType!: TeachingType;

  @IsOptional() @IsString() @MaxLength(20)
  plannedTeacherJobNo?: string;

  @IsOptional() @IsUrl({}, { message: "教案排期链接需为合法 URL" })
  lessonPlanUrl?: string;
}
```

> **Note:** `@Min`/`@Max` are imported but not used here — keep the imports so future edits stay cheap. Any unused import warnings are silenced by the existing tsconfig (`"noUnusedLocals": false` in the api package).

- [ ] **Step 4: `update-item.dto.ts`**

```ts
// apps/api/src/modules/course-outlines/dto/update-item.dto.ts
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from "class-validator";
import { TEACHING_TYPE, TeachingType } from "../../../common/dictionaries";

export class UpdateItemDto {
  /** sectionCode must reference an existing section within the item's version. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: "板块代码需为两位大写字母" })
  sectionCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,2}$/, { message: "序列号需为 1-2 位数字" })
  sequenceNo?: string;

  @IsOptional() @IsString() @MaxLength(100)
  secondaryCategoryName?: string;

  @IsOptional() @IsIn(TEACHING_TYPE as unknown as string[])
  suggestedTeachingType?: TeachingType;

  @IsOptional() @IsString() @MaxLength(20)
  plannedTeacherJobNo?: string | null;

  @IsOptional() @IsUrl({}, { message: "教案排期链接需为合法 URL" })
  lessonPlanUrl?: string | null;
}
```

- [ ] **Step 5: `delete-items.dto.ts`**

```ts
// apps/api/src/modules/course-outlines/dto/delete-items.dto.ts
import { ArrayMinSize, ArrayUnique, IsArray, IsString } from "class-validator";

export class DeleteItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  ids!: string[];
}
```

- [ ] **Step 6: `delete-version.dto.ts`**

```ts
// apps/api/src/modules/course-outlines/dto/delete-version.dto.ts
import { IsString, MaxLength } from "class-validator";

export class DeleteVersionDto {
  @IsString() @MaxLength(30)
  confirmVersionName!: string;
}
```

- [ ] **Step 7: `import.dto.ts`**

```ts
// apps/api/src/modules/course-outlines/dto/import.dto.ts
import { IsString, MaxLength } from "class-validator";

export class OutlineImportDto {
  @IsString() @MaxLength(300)
  fileKey!: string;
}
```

- [ ] **Step 8: Verify compilation**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/course-outlines/course-outlines.types.ts apps/api/src/modules/course-outlines/dto
git commit -m "feat(api)(phase-3): add course-outlines DTOs and shared types"
```

---

## Task 6: Extend `AuditAction` / `AuditTargetType` unions

**Files:**
- Modify: `apps/api/src/modules/audit-logs/audit-logs.types.ts`

- [ ] **Step 1: Edit the unions**

Open `apps/api/src/modules/audit-logs/audit-logs.types.ts`. Replace the existing `AuditAction` and `AuditTargetType` type aliases with:

```ts
export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "reset_password"
  | "deactivate"
  | "register"
  | "settle"
  | "import_overwrite"
  | "user.register"
  | "user.update_phone"
  | "user.update_username"
  | "user.change_password"
  | "user.reset_password"
  | "user.update_role"
  | "user.deactivate";

export type AuditTargetType =
  | "employee"
  | "user"
  | "course"
  | "payroll"
  | "User"
  | "course_outline_version"
  | "course_outline_item";
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output. (No other call site references these strings as literals yet — this task only widens the union.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/audit-logs/audit-logs.types.ts
git commit -m "feat(api)(phase-3): widen AuditAction and AuditTargetType unions for course-outlines"
```

---

## Task 7: `CourseOutlinesService` — version CRUD + isActive maintenance

**Files:**
- Create: `apps/api/src/modules/course-outlines/course-outlines.service.ts`

- [ ] **Step 1: Create the service**

```ts
// apps/api/src/modules/course-outlines/course-outlines.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CourseOutlineVersion } from "@prisma/client";
import {
  computeNextVersionName,
  parseVersionName,
} from "../../common/course-outline-version/version-name";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  VersionDetail,
  VersionListItem,
  CourseOutlineItemDetail,
} from "./course-outlines.types";

@Injectable()
export class CourseOutlinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async listVersions(): Promise<VersionListItem[]> {
    const versions = await this.prisma.courseOutlineVersion.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { items: true } } },
    });
    return versions.map((v) => ({
      id: v.id,
      versionName: v.versionName,
      isActive: v.isActive,
      itemCount: v._count.items,
      createdAt: v.createdAt,
    }));
  }

  async getVersion(id: string): Promise<VersionDetail> {
    const version = await this.prisma.courseOutlineVersion.findUnique({
      where: { id },
      include: {
        sections: { orderBy: { displayOrder: "asc" } },
        items: true,
      },
    });
    if (!version) throw new NotFoundException("大纲版本不存在");

    const teacherJobNos = [
      ...new Set(
        version.items
          .map((i) => i.plannedTeacherJobNo)
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    const teachers = teacherJobNos.length
      ? await this.prisma.employee.findMany({
          where: { jobNo: { in: teacherJobNos } },
          select: { jobNo: true, name: true, employmentStatus: true },
        })
      : [];
    const teacherMap = new Map(teachers.map((t) => [t.jobNo, t]));

    const enrichedItems: CourseOutlineItemDetail[] = [...version.items]
      .sort((a, b) => this.sequenceOrder(a.sequenceNo) - this.sequenceOrder(b.sequenceNo))
      .map((item) => ({
        ...item,
        plannedTeacher: item.plannedTeacherJobNo
          ? teacherMap.get(item.plannedTeacherJobNo) ?? null
          : null,
        actualTeachers: [],
      }));

    const { sections, items: _items, ...bare } = version;
    void _items;
    return { version: bare as CourseOutlineVersion, sections, items: enrichedItems };
  }

  async createVersion(operatorId: string): Promise<CourseOutlineVersion> {
    const latest = await this.prisma.courseOutlineVersion.findFirst({
      where: { isActive: true },
    });
    const parsed = latest ? parseVersionName(latest.versionName) : null;
    let nextName: string;
    try {
      nextName = computeNextVersionName(parsed, new Date().getFullYear());
    } catch (err) {
      throw new ConflictException((err as Error).message);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.courseOutlineVersion.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
      return tx.courseOutlineVersion.create({
        data: { versionName: nextName, isActive: true },
      });
    });

    await this.auditLogs.record({
      operatorId,
      action: "create",
      targetType: "course_outline_version",
      targetId: created.id,
      after: { versionName: created.versionName, isActive: true },
    });
    return created;
  }

  async deleteVersion(
    id: string,
    confirmVersionName: string,
    operatorId: string,
  ): Promise<void> {
    const before = await this.prisma.courseOutlineVersion.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("大纲版本不存在");
    if (before.versionName !== confirmVersionName) {
      throw new BadRequestException("版本号确认不匹配");
    }

    await this.prisma.$transaction(async (tx) => {
      if (before.isActive) {
        const next = await tx.courseOutlineVersion.findFirst({
          where: { id: { not: id } },
          orderBy: { createdAt: "desc" },
        });
        if (next) {
          await tx.courseOutlineVersion.update({
            where: { id: next.id },
            data: { isActive: true },
          });
        }
      }
      await tx.courseOutlineVersion.delete({ where: { id } });
    });

    await this.auditLogs.record({
      operatorId,
      action: "delete",
      targetType: "course_outline_version",
      targetId: id,
      before: { versionName: before.versionName, isActive: before.isActive },
    });
  }

  private sequenceOrder(seq: string): number {
    const n = Number(seq);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output. If you see `Type ... is not assignable to AuditTargetType`, re-check that Task 6 is committed.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/course-outlines/course-outlines.service.ts
git commit -m "feat(api)(phase-3): add CourseOutlinesService with version CRUD and isActive maintenance"
```

---

## Task 8: `CourseOutlineItemsService` — item add / update / delete + inline section creation

**Files:**
- Create: `apps/api/src/modules/course-outlines/course-outline-items.service.ts`

- [ ] **Step 1: Create the service**

```ts
// apps/api/src/modules/course-outlines/course-outline-items.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CourseOutlineItem,
  CourseSection,
  Prisma,
} from "@prisma/client";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateItemDto } from "./dto/create-item.dto";
import { UpdateItemDto } from "./dto/update-item.dto";
import type { CourseOutlineItemDetail } from "./course-outlines.types";

@Injectable()
export class CourseOutlineItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async addItem(
    versionId: string,
    dto: CreateItemDto,
    operatorId: string,
  ): Promise<CourseOutlineItemDetail> {
    const version = await this.prisma.courseOutlineVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException("大纲版本不存在");

    const created = await this.prisma.$transaction(async (tx) => {
      let section: CourseSection | null;
      if (dto.newSection) {
        const existing = await tx.courseSection.findUnique({
          where: {
            outlineVersionId_code: { outlineVersionId: versionId, code: dto.newSection.code },
          },
        });
        if (existing) {
          throw new ConflictException(
            `板块代码 ${dto.newSection.code} 在当前大纲版本已存在`,
          );
        }
        section = await tx.courseSection.create({
          data: {
            outlineVersionId: versionId,
            code: dto.newSection.code,
            name: dto.newSection.name,
            displayOrder: dto.newSection.displayOrder ?? 0,
          },
        });
      } else if (dto.sectionCode) {
        section = await tx.courseSection.findUnique({
          where: {
            outlineVersionId_code: { outlineVersionId: versionId, code: dto.sectionCode },
          },
        });
        if (!section) throw new BadRequestException("指定板块在当前大纲版本不存在");
      } else {
        throw new BadRequestException("必须提供 sectionCode 或 newSection");
      }

      const sequenceNo = dto.sequenceNo.padStart(2, "0");
      try {
        return await tx.courseOutlineItem.create({
          data: {
            outlineVersionId: versionId,
            sectionCode: section.code,
            sequenceNo,
            secondaryCategoryName: dto.secondaryCategoryName,
            suggestedTeachingType: dto.suggestedTeachingType,
            plannedTeacherJobNo: dto.plannedTeacherJobNo ?? null,
            lessonPlanUrl: dto.lessonPlanUrl ?? null,
          },
        });
      } catch (err) {
        if (this.isUniqueViolation(err)) {
          throw new ConflictException(
            `板块 ${section.code} 下序列号 ${sequenceNo} 已存在`,
          );
        }
        throw err;
      }
    });

    await this.auditLogs.record({
      operatorId,
      action: "create",
      targetType: "course_outline_item",
      targetId: created.id,
      after: this.snapshot(created),
    });

    return this.enrichOne(created);
  }

  async updateItem(
    itemId: string,
    dto: UpdateItemDto,
    operatorId: string,
  ): Promise<CourseOutlineItemDetail> {
    const before = await this.prisma.courseOutlineItem.findUnique({ where: { id: itemId } });
    if (!before) throw new NotFoundException("大纲条目不存在");

    if (dto.sectionCode && dto.sectionCode !== before.sectionCode) {
      const target = await this.prisma.courseSection.findUnique({
        where: {
          outlineVersionId_code: {
            outlineVersionId: before.outlineVersionId,
            code: dto.sectionCode,
          },
        },
      });
      if (!target) throw new BadRequestException("目标板块在当前大纲版本不存在");
    }

    const data: Prisma.CourseOutlineItemUpdateInput = {};
    if (dto.sectionCode !== undefined) data.sectionCode = dto.sectionCode;
    if (dto.sequenceNo !== undefined) data.sequenceNo = dto.sequenceNo.padStart(2, "0");
    if (dto.secondaryCategoryName !== undefined) data.secondaryCategoryName = dto.secondaryCategoryName;
    if (dto.suggestedTeachingType !== undefined) data.suggestedTeachingType = dto.suggestedTeachingType;
    if (dto.plannedTeacherJobNo !== undefined) {
      data.plannedTeacherJobNo = dto.plannedTeacherJobNo || null;
    }
    if (dto.lessonPlanUrl !== undefined) {
      data.lessonPlanUrl = dto.lessonPlanUrl || null;
    }

    if (Object.keys(data).length === 0) return this.enrichOne(before);

    let after: CourseOutlineItem;
    try {
      after = await this.prisma.courseOutlineItem.update({ where: { id: itemId }, data });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException("同板块下序列号冲突");
      }
      throw err;
    }

    await this.auditLogs.record({
      operatorId,
      action: "update",
      targetType: "course_outline_item",
      targetId: itemId,
      before: this.snapshot(before),
      after: this.snapshot(after),
    });

    return this.enrichOne(after);
  }

  async deleteItems(ids: string[], operatorId: string): Promise<{ deleted: number }> {
    const items = await this.prisma.courseOutlineItem.findMany({
      where: { id: { in: ids } },
    });
    if (items.length === 0) return { deleted: 0 };

    await this.prisma.courseOutlineItem.deleteMany({ where: { id: { in: ids } } });

    for (const item of items) {
      await this.auditLogs.record({
        operatorId,
        action: "delete",
        targetType: "course_outline_item",
        targetId: item.id,
        before: this.snapshot(item),
      });
    }

    return { deleted: items.length };
  }

  private async enrichOne(item: CourseOutlineItem): Promise<CourseOutlineItemDetail> {
    const plannedTeacher = item.plannedTeacherJobNo
      ? await this.prisma.employee.findUnique({
          where: { jobNo: item.plannedTeacherJobNo },
          select: { jobNo: true, name: true, employmentStatus: true },
        })
      : null;
    return { ...item, plannedTeacher, actualTeachers: [] };
  }

  private snapshot(item: CourseOutlineItem): Record<string, unknown> {
    const { id: _id, ...rest } = item;
    void _id;
    return rest as unknown as Record<string, unknown>;
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "P2002"
    );
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/course-outlines/course-outline-items.service.ts
git commit -m "feat(api)(phase-3): add CourseOutlineItemsService with inline section creation"
```

---

## Task 9: `CourseOutlineImportService` — template, dry-run, commit overwrite

**Files:**
- Create: `apps/api/src/modules/course-outlines/course-outline-import.service.ts`

- [ ] **Step 1: Create the service**

```ts
// apps/api/src/modules/course-outlines/course-outline-import.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import * as ExcelJS from "exceljs";
import { TEACHING_TYPE, TeachingType } from "../../common/dictionaries";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type {
  ImportRowError,
  OutlineImportCommitResult,
  OutlineImportReport,
} from "./course-outlines.types";

const COLUMNS = [
  "sectionCode",
  "sectionName",
  "sectionDisplayOrder",
  "sequenceNo",
  "secondaryCategoryName",
  "suggestedTeachingType",
  "plannedTeacherJobNo",
  "lessonPlanUrl",
] as const;

type Col = (typeof COLUMNS)[number];

const COLUMN_HEADERS: Record<Col, string> = {
  sectionCode: "板块代码",
  sectionName: "板块名称",
  sectionDisplayOrder: "板块排序",
  sequenceNo: "序列号",
  secondaryCategoryName: "二级课程类别名称",
  suggestedTeachingType: "建议授课方式",
  plannedTeacherJobNo: "计划授课老师工号",
  lessonPlanUrl: "教案排期链接",
};

const REQUIRED_COLUMNS: Col[] = [
  "sectionCode",
  "sectionName",
  "sequenceNo",
  "secondaryCategoryName",
  "suggestedTeachingType",
];

type ParsedRow = {
  rowNumber: number;
  raw: Partial<Record<Col, string>>;
};

type ValidatedRow = {
  rowNumber: number;
  sectionCode: string;
  sectionName: string;
  sectionDisplayOrder: number | null;
  sequenceNo: string;
  secondaryCategoryName: string;
  suggestedTeachingType: TeachingType;
  plannedTeacherJobNo: string | null;
  lessonPlanUrl: string | null;
};

@Injectable()
export class CourseOutlineImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  /** Build the blank .xlsx template at request time — no file checked into git. */
  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("课程大纲导入");
    sheet.columns = COLUMNS.map((key) => ({
      header: COLUMN_HEADERS[key],
      key,
      width: 20,
    }));

    // Example row so the format is obvious.
    sheet.addRow({
      sectionCode: "GP",
      sectionName: "GPA提升",
      sectionDisplayOrder: 1,
      sequenceNo: "01",
      secondaryCategoryName: "微积分一对一",
      suggestedTeachingType: "1v1",
      plannedTeacherJobNo: "26001",
      lessonPlanUrl: "https://example.com/plan/gp-01",
    });

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async dryRun(versionId: string, fileKey: string): Promise<OutlineImportReport> {
    const version = await this.prisma.courseOutlineVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException("大纲版本不存在");

    const buffer = await this.storage.readObject(fileKey);
    const parsed = await this.parse(buffer);
    if (parsed.errors.length > 0) {
      return {
        totalRows: parsed.rows.length,
        validRows: 0,
        uniqueSections: 0,
        errors: parsed.errors,
      };
    }

    const validated = await this.validate(parsed.rows);
    return {
      totalRows: parsed.rows.length,
      validRows: validated.rows.length,
      uniqueSections: new Set(validated.rows.map((r) => r.sectionCode)).size,
      errors: validated.errors,
    };
  }

  async commit(
    versionId: string,
    fileKey: string,
    operatorId: string,
  ): Promise<OutlineImportCommitResult> {
    const version = await this.prisma.courseOutlineVersion.findUnique({ where: { id: versionId } });
    if (!version) throw new NotFoundException("大纲版本不存在");

    const buffer = await this.storage.readObject(fileKey);
    const parsed = await this.parse(buffer);
    if (parsed.errors.length > 0) {
      return { createdSections: 0, createdItems: 0, errors: parsed.errors };
    }

    const validated = await this.validate(parsed.rows);
    if (validated.errors.length > 0) {
      return { createdSections: 0, createdItems: 0, errors: validated.errors };
    }

    // Build deduped section list preserving first-seen order.
    const sectionsByCode = new Map<
      string,
      { name: string; displayOrder: number }
    >();
    let nextAutoOrder = 1;
    for (const row of validated.rows) {
      if (!sectionsByCode.has(row.sectionCode)) {
        sectionsByCode.set(row.sectionCode, {
          name: row.sectionName,
          displayOrder: row.sectionDisplayOrder ?? nextAutoOrder,
        });
        nextAutoOrder += 1;
      }
    }

    const sectionRows = Array.from(sectionsByCode.entries()).map(([code, meta]) => ({
      outlineVersionId: versionId,
      code,
      name: meta.name,
      displayOrder: meta.displayOrder,
    }));

    const itemRows = validated.rows.map((row) => ({
      outlineVersionId: versionId,
      sectionCode: row.sectionCode,
      sequenceNo: row.sequenceNo,
      secondaryCategoryName: row.secondaryCategoryName,
      suggestedTeachingType: row.suggestedTeachingType,
      plannedTeacherJobNo: row.plannedTeacherJobNo,
      lessonPlanUrl: row.lessonPlanUrl,
    }));

    await this.prisma.$transaction(async (tx) => {
      // Order matters: items reference sections by (outlineVersionId, sectionCode) semantics.
      await tx.courseOutlineItem.deleteMany({ where: { outlineVersionId: versionId } });
      await tx.courseSection.deleteMany({ where: { outlineVersionId: versionId } });
      if (sectionRows.length > 0) await tx.courseSection.createMany({ data: sectionRows });
      if (itemRows.length > 0) await tx.courseOutlineItem.createMany({ data: itemRows });
    });

    await this.auditLogs.record({
      operatorId,
      action: "import_overwrite",
      targetType: "course_outline_version",
      targetId: versionId,
      after: {
        sectionCount: sectionRows.length,
        itemCount: itemRows.length,
      },
    });

    return { createdSections: sectionRows.length, createdItems: itemRows.length, errors: [] };
  }

  // ------------------------------- internals ------------------------------- //

  private async parse(buffer: Buffer): Promise<{ rows: ParsedRow[]; errors: ImportRowError[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { rows: [], errors: [{ row: 0, field: "header", message: "未找到任何工作表" }] };
    }

    const headerRow = sheet.getRow(1);
    const headerMap = new Map<number, Col>();
    headerRow.eachCell((cell, colNumber) => {
      const headerText = String(cell.value ?? "").trim();
      const matched = COLUMNS.find((k) => COLUMN_HEADERS[k] === headerText);
      if (matched) headerMap.set(colNumber, matched);
    });

    const present = new Set(headerMap.values());
    const missing = REQUIRED_COLUMNS.filter((k) => !present.has(k));
    if (missing.length > 0) {
      return {
        rows: [],
        errors: [
          {
            row: 1,
            field: "header",
            message: `缺少列：${missing.map((k) => COLUMN_HEADERS[k]).join("、")}`,
          },
        ],
      };
    }

    const rows: ParsedRow[] = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const raw: ParsedRow["raw"] = {};
      let hasAny = false;
      headerMap.forEach((key, colNumber) => {
        const value = row.getCell(colNumber).value;
        if (value !== null && value !== undefined && String(value).trim() !== "") {
          raw[key] = String(value).trim();
          hasAny = true;
        }
      });
      if (hasAny) rows.push({ rowNumber: r, raw });
    }
    return { rows, errors: [] };
  }

  private async validate(
    rows: ParsedRow[],
  ): Promise<{ rows: ValidatedRow[]; errors: ImportRowError[] }> {
    const errors: ImportRowError[] = [];
    const valid: ValidatedRow[] = [];

    // Pre-collect unique teacher jobNos so we batch-fetch employees once.
    const teacherJobNos = new Set<string>();
    for (const { raw } of rows) {
      if (raw.plannedTeacherJobNo) teacherJobNos.add(raw.plannedTeacherJobNo);
    }
    const teachers = teacherJobNos.size
      ? await this.prisma.employee.findMany({
          where: { jobNo: { in: [...teacherJobNos] } },
          select: { jobNo: true, employmentStatus: true },
        })
      : [];
    const teacherMap = new Map(teachers.map((t) => [t.jobNo, t]));

    // Per-row validation + per-section name-consistency + per-(section, seq) dedupe.
    const sectionNameByCode = new Map<string, string>();
    const sectionOrderByCode = new Map<string, number>();
    const seenKeys = new Set<string>();

    for (const { rowNumber, raw } of rows) {
      const rowErrors: ImportRowError[] = [];

      for (const key of REQUIRED_COLUMNS) {
        if (!raw[key]) rowErrors.push({ row: rowNumber, field: COLUMN_HEADERS[key], message: "必填" });
      }

      const sectionCode = raw.sectionCode ?? "";
      if (sectionCode && !/^[A-Z]{2}$/.test(sectionCode)) {
        rowErrors.push({ row: rowNumber, field: "板块代码", message: "需为两位大写字母" });
      }

      const sectionName = raw.sectionName ?? "";
      if (sectionCode && sectionName) {
        const existingName = sectionNameByCode.get(sectionCode);
        if (existingName === undefined) {
          sectionNameByCode.set(sectionCode, sectionName);
        } else if (existingName !== sectionName) {
          rowErrors.push({
            row: rowNumber,
            field: "板块名称",
            message: `板块 ${sectionCode} 名称不一致: ${existingName} vs ${sectionName}`,
          });
        }
      }

      let sectionDisplayOrder: number | null = null;
      if (raw.sectionDisplayOrder) {
        const n = Number(raw.sectionDisplayOrder);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
          rowErrors.push({ row: rowNumber, field: "板块排序", message: "需为非负整数" });
        } else {
          sectionDisplayOrder = n;
          if (sectionCode && !sectionOrderByCode.has(sectionCode)) {
            sectionOrderByCode.set(sectionCode, n);
          }
        }
      }

      let sequenceNo = "";
      if (raw.sequenceNo) {
        if (!/^\d{1,2}$/.test(raw.sequenceNo)) {
          rowErrors.push({ row: rowNumber, field: "序列号", message: "需为 1-2 位数字" });
        } else {
          const seqNum = Number(raw.sequenceNo);
          if (seqNum < 1 || seqNum > 99) {
            rowErrors.push({ row: rowNumber, field: "序列号", message: "取值需在 1-99 之间" });
          } else {
            sequenceNo = String(seqNum).padStart(2, "0");
          }
        }
      }

      if (
        raw.suggestedTeachingType &&
        !(TEACHING_TYPE as readonly string[]).includes(raw.suggestedTeachingType)
      ) {
        rowErrors.push({
          row: rowNumber,
          field: "建议授课方式",
          message: `非法值，仅支持 ${TEACHING_TYPE.join("/")}`,
        });
      }

      if (raw.plannedTeacherJobNo) {
        const t = teacherMap.get(raw.plannedTeacherJobNo);
        if (!t) {
          rowErrors.push({
            row: rowNumber,
            field: "计划授课老师工号",
            message: `员工 ${raw.plannedTeacherJobNo} 不存在`,
          });
        } else if (t.employmentStatus === "RESIGNED") {
          rowErrors.push({
            row: rowNumber,
            field: "计划授课老师工号",
            message: `员工 ${raw.plannedTeacherJobNo} 已离职`,
          });
        }
      }

      if (raw.lessonPlanUrl && !/^https?:\/\//i.test(raw.lessonPlanUrl)) {
        rowErrors.push({ row: rowNumber, field: "教案排期链接", message: "URL 需以 http(s):// 开头" });
      }

      if (sectionCode && sequenceNo) {
        const key = `${sectionCode}|${sequenceNo}`;
        if (seenKeys.has(key)) {
          rowErrors.push({
            row: rowNumber,
            field: "序列号",
            message: `板块 ${sectionCode} 下序列号 ${sequenceNo} 在模板内重复`,
          });
        } else {
          seenKeys.add(key);
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      valid.push({
        rowNumber,
        sectionCode,
        sectionName,
        sectionDisplayOrder: sectionDisplayOrder,
        sequenceNo,
        secondaryCategoryName: raw.secondaryCategoryName!,
        suggestedTeachingType: raw.suggestedTeachingType as TeachingType,
        plannedTeacherJobNo: raw.plannedTeacherJobNo ?? null,
        lessonPlanUrl: raw.lessonPlanUrl ?? null,
      });
    }

    return { rows: valid, errors };
  }
}
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/course-outlines/course-outline-import.service.ts
git commit -m "feat(api)(phase-3): add CourseOutlineImportService with template, dry-run and overwrite commit"
```

---

## Task 10: Controller + Module + `AppModule` wiring

**Files:**
- Create: `apps/api/src/modules/course-outlines/course-outlines.controller.ts`
- Create: `apps/api/src/modules/course-outlines/course-outlines.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the controller**

```ts
// apps/api/src/modules/course-outlines/course-outlines.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { CreateItemDto } from "./dto/create-item.dto";
import { UpdateItemDto } from "./dto/update-item.dto";
import { DeleteItemsDto } from "./dto/delete-items.dto";
import { DeleteVersionDto } from "./dto/delete-version.dto";
import { OutlineImportDto } from "./dto/import.dto";
import { CourseOutlinesService } from "./course-outlines.service";
import { CourseOutlineItemsService } from "./course-outline-items.service";
import { CourseOutlineImportService } from "./course-outline-import.service";

@Controller("course-outlines")
export class CourseOutlinesController {
  constructor(
    private readonly versions: CourseOutlinesService,
    private readonly items: CourseOutlineItemsService,
    private readonly imports: CourseOutlineImportService,
  ) {}

  @Get("versions")
  listVersions() {
    return this.versions.listVersions();
  }

  @Get("versions/:id")
  getVersion(@Param("id") id: string) {
    return this.versions.getVersion(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("versions")
  createVersion(@CurrentUser() operator: AuthUser) {
    return this.versions.createVersion(operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete("versions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteVersion(
    @Param("id") id: string,
    @Body() dto: DeleteVersionDto,
    @CurrentUser() operator: AuthUser,
  ) {
    await this.versions.deleteVersion(id, dto.confirmVersionName, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("versions/:id/items")
  addItem(
    @Param("id") versionId: string,
    @Body() dto: CreateItemDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.items.addItem(versionId, dto, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Put("items/:itemId")
  updateItem(
    @Param("itemId") itemId: string,
    @Body() dto: UpdateItemDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.items.updateItem(itemId, dto, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete("items")
  deleteItems(@Body() dto: DeleteItemsDto, @CurrentUser() operator: AuthUser) {
    return this.items.deleteItems(dto.ids, operator.id);
  }

  /**
   * Reserved standalone endpoint — not wired to any UI entry in Phase 3. The
   * UI creates sections inline inside the "add item" dialog. Kept so Phase 4
   * / 5 can build section-only flows without another backend change.
   */
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("versions/:id/sections")
  async createSection() {
    // Intentionally returns 501 until a UI path calls it, so we don't ship dead code.
    return { message: "暂未启用,Phase 4+ 打开时再补实现" };
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get("template")
  async downloadTemplate(@Res() res: Response) {
    try {
      const buf = await this.imports.generateTemplate();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="course-outline-template.xlsx"',
      );
      res.send(buf);
    } catch (err) {
      res.status(500).json({ message: "模板生成失败" });
    }
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("versions/:id/import/dry-run")
  importDryRun(@Param("id") versionId: string, @Body() dto: OutlineImportDto) {
    return this.imports.dryRun(versionId, dto.fileKey);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("versions/:id/import/commit")
  importCommit(
    @Param("id") versionId: string,
    @Body() dto: OutlineImportDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.imports.commit(versionId, dto.fileKey, operator.id);
  }
}
```

> Note: `CreateSectionDto` intentionally is **not** imported in the controller. The reserved `POST versions/:id/sections` endpoint is a no-op stub in Phase 3 (Phase 4 wires it up); importing the DTO now would produce an unused-import. Keep the DTO file — it's consumed by `CreateItemDto.newSection` via `@ValidateNested`.

- [ ] **Step 2: Create the module**

```ts
// apps/api/src/modules/course-outlines/course-outlines.module.ts
import { Module } from "@nestjs/common";
import { CourseOutlinesController } from "./course-outlines.controller";
import { CourseOutlinesService } from "./course-outlines.service";
import { CourseOutlineItemsService } from "./course-outline-items.service";
import { CourseOutlineImportService } from "./course-outline-import.service";

@Module({
  controllers: [CourseOutlinesController],
  providers: [CourseOutlinesService, CourseOutlineItemsService, CourseOutlineImportService],
  exports: [CourseOutlinesService],
})
export class CourseOutlinesModule {}
```

- [ ] **Step 3: Register the module in `AppModule`**

Open `apps/api/src/app.module.ts`. Add the import line alongside the others:

```ts
import { CourseOutlinesModule } from "./modules/course-outlines/course-outlines.module";
```

Then add `CourseOutlinesModule` to the `imports: [ ... ]` array — place it right after `EmployeesModule`:

```ts
    EmployeesModule,
    CourseOutlinesModule,
    UsersModule,
```

- [ ] **Step 4: Verify compilation and startup**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

Then start the API in one terminal:

```bash
pnpm dev:api
```

Expected log lines include:

```
Mapped {/api/course-outlines/versions, GET} route
Mapped {/api/course-outlines/versions/:id, GET} route
Mapped {/api/course-outlines/versions, POST} route
Mapped {/api/course-outlines/versions/:id, DELETE} route
Mapped {/api/course-outlines/versions/:id/items, POST} route
Mapped {/api/course-outlines/items/:itemId, PUT} route
Mapped {/api/course-outlines/items, DELETE} route
Mapped {/api/course-outlines/versions/:id/sections, POST} route
Mapped {/api/course-outlines/template, GET} route
Mapped {/api/course-outlines/versions/:id/import/dry-run, POST} route
Mapped {/api/course-outlines/versions/:id/import/commit, POST} route
```

Leave it running for Task 11's smoke test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/course-outlines/course-outlines.controller.ts \
        apps/api/src/modules/course-outlines/course-outlines.module.ts \
        apps/api/src/app.module.ts
git commit -m "feat(api)(phase-3): wire CourseOutlinesController and register CourseOutlinesModule"
```

---

## Task 11: Backend end-to-end smoke (curl)

**Files:** (none — verification only)

- [ ] **Step 1: Create a version and fetch it**

With the API still running from Task 10 and `$TOKEN` set (see Prerequisites):

```bash
# Initial list — if this is a fresh DB, should be []
curl -s -H "Authorization: Bearer $TOKEN" $API/course-outlines/versions | jq

# Create the first version
VERSION=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  $API/course-outlines/versions)
echo "$VERSION" | jq
VID=$(echo "$VERSION" | jq -r .id)
VNAME=$(echo "$VERSION" | jq -r .versionName)

# List again
curl -s -H "Authorization: Bearer $TOKEN" $API/course-outlines/versions | jq
```

Expected: second `jq` prints one row with `"versionName"` matching `课程大纲-YYA` for the current year, `"isActive": true`, `"itemCount": 0`.

- [ ] **Step 2: Inline-create a section and add an item**

Pick any active employee jobNo for `plannedTeacherJobNo` (or omit the field). For this smoke, we'll omit it:

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"newSection\":{\"code\":\"GP\",\"name\":\"GPA提升\",\"displayOrder\":1},\"sequenceNo\":\"1\",\"secondaryCategoryName\":\"微积分\",\"suggestedTeachingType\":\"1v1\"}" \
  $API/course-outlines/versions/$VID/items | jq
```

Expected: returns an item with `"sequenceNo":"01"`, `"sectionCode":"GP"`, `"plannedTeacher": null`, `"actualTeachers": []`.

Then fetch the full version and confirm the section + item are there:

```bash
curl -s -H "Authorization: Bearer $TOKEN" $API/course-outlines/versions/$VID | jq
```

Expected shape:

```json
{
  "version": { "id": "...", "versionName": "课程大纲-...", "isActive": true, ... },
  "sections": [{ "code": "GP", "name": "GPA提升", "displayOrder": 1, ... }],
  "items": [{ "sectionCode": "GP", "sequenceNo": "01", "plannedTeacher": null, "actualTeachers": [] }]
}
```

- [ ] **Step 3: Conflict tests**

```bash
# Duplicate section code in the same version — expect 409
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"newSection\":{\"code\":\"GP\",\"name\":\"GPA提升\",\"displayOrder\":2},\"sequenceNo\":\"2\",\"secondaryCategoryName\":\"线代\",\"suggestedTeachingType\":\"1v1\"}" \
  $API/course-outlines/versions/$VID/items | jq

# Same section + same sequenceNo — expect 409
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"sectionCode\":\"GP\",\"sequenceNo\":\"01\",\"secondaryCategoryName\":\"重复\",\"suggestedTeachingType\":\"1v1\"}" \
  $API/course-outlines/versions/$VID/items | jq
```

Expected: both return `{"statusCode":409,"message":"...","error":"Conflict"}`.

- [ ] **Step 4: Version delete with wrong confirm name**

```bash
# Wrong confirmVersionName — expect 400
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"confirmVersionName":"wrong"}' \
  $API/course-outlines/versions/$VID -w "%{http_code}\n" -o /dev/null
```

Expected prints `400`.

- [ ] **Step 5: Template download**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  $API/course-outlines/template -o /tmp/outline-template.xlsx
file /tmp/outline-template.xlsx
```

Expected: `file` reports `Microsoft OOXML` or `Zip archive data` (xlsx is a zip under the hood). Size should be non-zero (`stat -c %s /tmp/outline-template.xlsx`).

- [ ] **Step 6: Cleanup — delete the smoke version**

```bash
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"confirmVersionName\":\"$VNAME\"}" \
  $API/course-outlines/versions/$VID -w "%{http_code}\n" -o /dev/null
```

Expected: prints `204`.

- [ ] **Step 7: Audit log sanity**

```bash
docker compose exec -T db psql -U yanlu -d yanluzhongtai \
  -c "SELECT action, \"targetType\", \"targetId\" FROM \"AuditLog\" ORDER BY \"createdAt\" DESC LIMIT 5;"
```

Expected: the top rows include at least one `(create, course_outline_version)`, one `(create, course_outline_item)`, and one `(delete, course_outline_version)` row.

No commit needed for this task — verification only.

---

## Task 12: Web dictionaries mirror + `storage.ts` union + `services/course-outlines.ts` + types

**Files:**
- Modify: `apps/web/src/constants/dictionaries.ts`
- Modify: `apps/web/src/services/storage.ts`
- Create: `apps/web/src/features/course-outlines/types.ts`
- Create: `apps/web/src/services/course-outlines.ts`

- [ ] **Step 1: Mirror `TEACHING_TYPE` on the web side**

Open `apps/web/src/constants/dictionaries.ts`. Append:

```ts
export const TEACHING_TYPE = ["公共课", "1v1", "小班课", "录播", "其他"] as const;
export type TeachingType = (typeof TEACHING_TYPE)[number];
export const TEACHING_TYPE_OPTIONS = TEACHING_TYPE.map((value) => ({
  value,
  label: value,
}));
```

- [ ] **Step 2: Extend the `StorageFolder` union**

Open `apps/web/src/services/storage.ts`. Change the `StorageFolder` type alias to:

```ts
export type StorageFolder =
  | "employees/attachments"
  | "employees/import-batches"
  | "course-outlines/import-batches";
```

No other change in this file.

- [ ] **Step 3: Create the feature-level type file**

```ts
// apps/web/src/features/course-outlines/types.ts

export type VersionListItem = {
  id: string;
  versionName: string;
  isActive: boolean;
  itemCount: number;
  createdAt: string;
};

export type PlannedTeacherSummary = {
  jobNo: string;
  name: string;
  employmentStatus: "FULL_TIME" | "PART_TIME" | "RESIGNED";
};

export type ActualTeacherSummary = {
  jobNo: string;
  name: string;
  employmentStatus: "FULL_TIME" | "PART_TIME" | "RESIGNED";
  courseCount: number;
};

export type CourseSection = {
  id: string;
  outlineVersionId: string;
  code: string;
  name: string;
  displayOrder: number;
};

export type CourseOutlineItem = {
  id: string;
  outlineVersionId: string;
  sectionCode: string;
  sequenceNo: string;
  secondaryCategoryName: string;
  suggestedTeachingType: string;
  plannedTeacherJobNo: string | null;
  lessonPlanUrl: string | null;
  plannedTeacher: PlannedTeacherSummary | null;
  actualTeachers: ActualTeacherSummary[];
};

export type VersionDetail = {
  version: {
    id: string;
    versionName: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
  sections: CourseSection[];
  items: CourseOutlineItem[];
};

export type CreateItemBody = {
  sectionCode?: string;
  newSection?: { code: string; name: string; displayOrder?: number };
  sequenceNo: string;
  secondaryCategoryName: string;
  suggestedTeachingType: string;
  plannedTeacherJobNo?: string | null;
  lessonPlanUrl?: string | null;
};

export type UpdateItemBody = Partial<{
  sectionCode: string;
  sequenceNo: string;
  secondaryCategoryName: string;
  suggestedTeachingType: string;
  plannedTeacherJobNo: string | null;
  lessonPlanUrl: string | null;
}>;

export type ImportRowError = {
  row: number;
  field: string;
  message: string;
};

export type OutlineImportReport = {
  totalRows: number;
  validRows: number;
  uniqueSections: number;
  errors: ImportRowError[];
};

export type OutlineImportCommitResult = {
  createdSections: number;
  createdItems: number;
  errors: ImportRowError[];
};
```

- [ ] **Step 4: Create `services/course-outlines.ts`**

```ts
// apps/web/src/services/course-outlines.ts
import { api, downloadAuthed } from "./http";
import type {
  CreateItemBody,
  CourseOutlineItem,
  OutlineImportCommitResult,
  OutlineImportReport,
  UpdateItemBody,
  VersionDetail,
  VersionListItem,
} from "../features/course-outlines/types";

export const courseOutlinesApi = {
  listVersions: () => api.get<VersionListItem[]>("/course-outlines/versions"),
  getVersion: (id: string) => api.get<VersionDetail>(`/course-outlines/versions/${id}`),
  createVersion: () =>
    api.post<VersionListItem>("/course-outlines/versions", {}),
  deleteVersion: (id: string, confirmVersionName: string) =>
    api.delete<void>(`/course-outlines/versions/${id}`, {
      body: { confirmVersionName },
    }),
  addItem: (versionId: string, body: CreateItemBody) =>
    api.post<CourseOutlineItem>(`/course-outlines/versions/${versionId}/items`, body),
  updateItem: (itemId: string, body: UpdateItemBody) =>
    api.put<CourseOutlineItem>(`/course-outlines/items/${itemId}`, body),
  deleteItems: (ids: string[]) =>
    api.delete<{ deleted: number }>("/course-outlines/items", { body: { ids } }),
  importDryRun: (versionId: string, fileKey: string) =>
    api.post<OutlineImportReport>(
      `/course-outlines/versions/${versionId}/import/dry-run`,
      { fileKey },
    ),
  importCommit: (versionId: string, fileKey: string) =>
    api.post<OutlineImportCommitResult>(
      `/course-outlines/versions/${versionId}/import/commit`,
      { fileKey },
    ),
  downloadTemplate: () =>
    downloadAuthed("/course-outlines/template", "课程大纲空白模板.xlsx"),
};
```

> Note: `api.delete`'s current signature (see `apps/web/src/services/http.ts`) accepts an `init` object whose `body` is serialized — the existing code already uses this pattern elsewhere in the codebase.

- [ ] **Step 5: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/constants/dictionaries.ts \
        apps/web/src/services/storage.ts \
        apps/web/src/features/course-outlines/types.ts \
        apps/web/src/services/course-outlines.ts
git commit -m "feat(web)(phase-3): add course-outlines service, types and dictionary mirror"
```

---

## Task 13: Extract Phase 2 prerequisite — `EmployeePicker` component

**Files:**
- Modify: `apps/web/src/services/employees.ts`
- Modify: `apps/web/src/features/employees/types.ts`
- Create: `apps/web/src/components/EmployeePicker.tsx`

> **Skip this task if Phase 2 has already landed and the component already exists with the same props.** Open `apps/web/src/components/EmployeePicker.tsx`; if the signature matches Step 3 below, leave it alone.

- [ ] **Step 1: Add `excludeResigned` to `EmployeeQueryParams`**

Open `apps/web/src/features/employees/types.ts`. Find the `EmployeeQueryParams` export (if it exists — the type is imported by `services/employees.ts`). If it doesn't exist yet, add it; otherwise extend it. The file should contain:

```ts
export type EmployeeQueryParams = {
  keyword?: string;
  page?: number;
  pageSize?: number;
  employmentStatus?: import("@prisma/client").EmploymentStatus;
  excludeResigned?: boolean;
};
```

> If the file already exports `EmployeeQueryParams` without `excludeResigned`, add only the `excludeResigned?: boolean` line.

- [ ] **Step 2: Forward `excludeResigned` in `services/employees.ts`**

Open `apps/web/src/services/employees.ts`. In `toQuery(params)`, add a line right before the `const qs = search.toString();`:

```ts
  if (params.excludeResigned) search.set("excludeResigned", "true");
```

- [ ] **Step 3: Create the component**

```tsx
// apps/web/src/components/EmployeePicker.tsx
import { Select, Spin, Tag } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { employeesApi } from "../services/employees";
import type { EmployeeListItem } from "../features/employees/types";

type Props = {
  value: string | null | undefined;
  onChange: (jobNo: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  excludeResigned?: boolean;
  /**
   * When the initial value refers to an employee that is not returned by the
   * search endpoint (e.g. already RESIGNED while `excludeResigned=true`), the
   * caller can pass the last-known row here so the picker still renders the
   * name + a "已离职" tag.
   */
  historicalEmployee?: Pick<EmployeeListItem, "jobNo" | "name" | "employmentStatus" | "jobTitle"> | null;
};

export function EmployeePicker({
  value,
  onChange,
  placeholder = "搜索员工姓名或工号",
  disabled,
  excludeResigned = true,
  historicalEmployee = null,
}: Props) {
  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(keyword.trim()), 250);
    return () => clearTimeout(t);
  }, [keyword]);

  const { data, isFetching } = useQuery({
    queryKey: ["employees", "picker", { keyword: debounced, excludeResigned }],
    queryFn: () =>
      employeesApi.list({
        keyword: debounced || undefined,
        pageSize: 30,
        excludeResigned,
      }),
  });

  const options = useMemo(() => {
    const live = data?.items ?? [];
    const seen = new Set(live.map((e) => e.jobNo));
    const all = [...live];
    if (
      value &&
      historicalEmployee &&
      historicalEmployee.jobNo === value &&
      !seen.has(value)
    ) {
      all.unshift(historicalEmployee as EmployeeListItem);
    }
    return all.map((e) => ({
      value: e.jobNo,
      label: (
        <span>
          {e.name} {e.jobTitle ? `(${e.jobTitle})` : ""} — {e.jobNo}
          {e.employmentStatus === "RESIGNED" ? (
            <Tag color="red" style={{ marginLeft: 8 }}>已离职</Tag>
          ) : null}
        </span>
      ),
    }));
  }, [data, historicalEmployee, value]);

  return (
    <Select
      showSearch
      allowClear
      value={value ?? undefined}
      onChange={(next) => onChange(next ?? null)}
      onSearch={setKeyword}
      filterOption={false}
      placeholder={placeholder}
      disabled={disabled}
      options={options}
      style={{ width: "100%" }}
      notFoundContent={isFetching ? <Spin size="small" /> : "暂无匹配员工"}
    />
  );
}
```

- [ ] **Step 4: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/EmployeePicker.tsx \
        apps/web/src/services/employees.ts \
        apps/web/src/features/employees/types.ts
git commit -m "feat(web)(phase-2-extract): add reusable EmployeePicker with excludeResigned"
```

---

## Task 14: Query + mutation hooks

**Files:**
- Create: `apps/web/src/features/course-outlines/hooks/useOutlineVersions.ts`
- Create: `apps/web/src/features/course-outlines/hooks/useOutline.ts`
- Create: `apps/web/src/features/course-outlines/hooks/useOutlineMutations.ts`

- [ ] **Step 1: `useOutlineVersions.ts`**

```ts
// apps/web/src/features/course-outlines/hooks/useOutlineVersions.ts
import { useQuery } from "@tanstack/react-query";
import { courseOutlinesApi } from "../../../services/course-outlines";

export function useOutlineVersions() {
  return useQuery({
    queryKey: ["outline-versions"],
    queryFn: () => courseOutlinesApi.listVersions(),
  });
}
```

- [ ] **Step 2: `useOutline.ts`**

```ts
// apps/web/src/features/course-outlines/hooks/useOutline.ts
import { useQuery } from "@tanstack/react-query";
import { courseOutlinesApi } from "../../../services/course-outlines";

export function useOutline(versionId: string | null) {
  return useQuery({
    queryKey: ["outline", versionId],
    queryFn: () => courseOutlinesApi.getVersion(versionId as string),
    enabled: !!versionId,
  });
}
```

- [ ] **Step 3: `useOutlineMutations.ts`**

```ts
// apps/web/src/features/course-outlines/hooks/useOutlineMutations.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "antd";
import { courseOutlinesApi } from "../../../services/course-outlines";
import { HttpError } from "../../../services/http";
import type {
  CreateItemBody,
  UpdateItemBody,
} from "../types";

export function useOutlineMutations(activeVersionId: string | null) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["outline-versions"] });
    if (activeVersionId) {
      qc.invalidateQueries({ queryKey: ["outline", activeVersionId] });
    }
  };

  const notifyError = (err: unknown, fallback: string) => {
    message.error(err instanceof HttpError ? err.message : fallback);
  };

  const createVersion = useMutation({
    mutationFn: () => courseOutlinesApi.createVersion(),
    onSuccess: (created) => {
      message.success(`已创建 ${created.versionName}`);
      invalidate();
    },
    onError: (err) => notifyError(err, "创建大纲失败"),
  });

  const deleteVersion = useMutation({
    mutationFn: ({ id, confirmVersionName }: { id: string; confirmVersionName: string }) =>
      courseOutlinesApi.deleteVersion(id, confirmVersionName),
    onSuccess: () => {
      message.success("版本已删除");
      invalidate();
    },
    onError: (err) => notifyError(err, "删除大纲失败"),
  });

  const addItem = useMutation({
    mutationFn: ({ versionId, body }: { versionId: string; body: CreateItemBody }) =>
      courseOutlinesApi.addItem(versionId, body),
    onSuccess: () => {
      message.success("已添加条目");
      invalidate();
    },
    onError: (err) => notifyError(err, "添加失败"),
  });

  const updateItem = useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: UpdateItemBody }) =>
      courseOutlinesApi.updateItem(itemId, body),
    onSuccess: () => {
      message.success("条目已更新");
      invalidate();
    },
    onError: (err) => notifyError(err, "更新失败"),
  });

  const deleteItems = useMutation({
    mutationFn: (ids: string[]) => courseOutlinesApi.deleteItems(ids),
    onSuccess: (res) => {
      message.success(`已删除 ${res.deleted} 条`);
      invalidate();
    },
    onError: (err) => notifyError(err, "删除失败"),
  });

  const importCommit = useMutation({
    mutationFn: ({ versionId, fileKey }: { versionId: string; fileKey: string }) =>
      courseOutlinesApi.importCommit(versionId, fileKey),
    onSuccess: (res) => {
      message.success(
        `已导入 ${res.createdSections} 个板块 / ${res.createdItems} 条条目`,
      );
      invalidate();
    },
    onError: (err) => notifyError(err, "导入失败"),
  });

  return { createVersion, deleteVersion, addItem, updateItem, deleteItems, importCommit };
}
```

- [ ] **Step 4: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/course-outlines/hooks
git commit -m "feat(web)(phase-3): add outline version/list/mutations hooks"
```

---

## Task 15: `OutlineVersionDropdown` + `CreateVersionConfirm` + `DeleteVersionConfirm`

**Files:**
- Create: `apps/web/src/features/course-outlines/OutlineVersionDropdown.tsx`
- Create: `apps/web/src/features/course-outlines/CreateVersionConfirm.tsx`
- Create: `apps/web/src/features/course-outlines/DeleteVersionConfirm.tsx`

- [ ] **Step 1: `OutlineVersionDropdown.tsx`**

```tsx
// apps/web/src/features/course-outlines/OutlineVersionDropdown.tsx
import { Select, Tag } from "antd";
import type { VersionListItem } from "./types";

type Props = {
  versions: VersionListItem[];
  value: string | null;
  onChange: (id: string) => void;
  loading?: boolean;
};

export function OutlineVersionDropdown({ versions, value, onChange, loading }: Props) {
  const options = versions.map((v) => ({
    value: v.id,
    label: (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {v.versionName}
        {v.isActive ? <Tag color="blue">当前</Tag> : null}
      </span>
    ),
  }));

  return (
    <Select
      style={{ width: 220 }}
      value={value ?? undefined}
      options={options}
      placeholder="选择大纲版本"
      loading={loading}
      onChange={onChange}
      disabled={!loading && versions.length === 0}
    />
  );
}
```

- [ ] **Step 2: `CreateVersionConfirm.tsx`**

```tsx
// apps/web/src/features/course-outlines/CreateVersionConfirm.tsx
import { ExclamationCircleFilled } from "@ant-design/icons";
import { Modal } from "antd";

export function confirmCreateVersion(onOk: () => Promise<unknown> | void) {
  Modal.confirm({
    title: "创建新大纲",
    icon: <ExclamationCircleFilled />,
    content:
      "即将创建新空白大纲;新版本将自动设为当前活跃版本,旧版本会自动退出活跃状态。是否继续?",
    okText: "确认创建",
    cancelText: "取消",
    onOk,
  });
}
```

- [ ] **Step 3: `DeleteVersionConfirm.tsx`**

```tsx
// apps/web/src/features/course-outlines/DeleteVersionConfirm.tsx
import { Alert, Button, Input, Modal, Space, Typography } from "antd";
import { useState } from "react";

type Props = {
  open: boolean;
  versionName: string;
  onClose: () => void;
  onConfirm: () => Promise<unknown> | void;
  loading?: boolean;
};

export function DeleteVersionConfirm({ open, versionName, onClose, onConfirm, loading }: Props) {
  const [input, setInput] = useState("");
  const handleClose = () => {
    setInput("");
    onClose();
  };

  return (
    <Modal
      title={<span style={{ color: "#ff4d4f" }}>删除当前大纲 — 高风险操作</span>}
      open={open}
      onCancel={handleClose}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={handleClose} disabled={loading}>取消</Button>
          <Button
            danger
            type="primary"
            loading={loading}
            disabled={input !== versionName}
            onClick={async () => {
              await onConfirm();
              handleClose();
            }}
          >
            确认删除
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Alert
          type="error"
          showIcon
          message={`即将永久删除版本 ${versionName},此动作不可恢复。`}
          description="该版本下所有板块与条目将一并删除。引用此版本的课程会自动解除版本关联(Phase 4 后生效)。"
        />
        <Typography.Text>请输入版本号以确认:</Typography.Text>
        <Input
          autoFocus
          placeholder={versionName}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </Space>
    </Modal>
  );
}
```

- [ ] **Step 4: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/course-outlines/OutlineVersionDropdown.tsx \
        apps/web/src/features/course-outlines/CreateVersionConfirm.tsx \
        apps/web/src/features/course-outlines/DeleteVersionConfirm.tsx
git commit -m "feat(web)(phase-3): add outline version dropdown and create/delete confirm dialogs"
```

---

## Task 16: `AddOutlineItemModal` — add item with inline section creation

**Files:**
- Create: `apps/web/src/features/course-outlines/AddOutlineItemModal.tsx`

- [ ] **Step 1: Create the modal**

```tsx
// apps/web/src/features/course-outlines/AddOutlineItemModal.tsx
import { PlusOutlined } from "@ant-design/icons";
import {
  Button,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Typography,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { TEACHING_TYPE_OPTIONS } from "../../constants/dictionaries";
import { EmployeePicker } from "../../components/EmployeePicker";
import { useOutlineMutations } from "./hooks/useOutlineMutations";
import type { CourseSection, CreateItemBody } from "./types";

type Props = {
  open: boolean;
  versionId: string;
  sections: CourseSection[];
  onClose: () => void;
};

type InlineSection = { code: string; name: string; displayOrder: number | undefined };

type FormValues = {
  sectionCode: string;
  sequenceNo: number;
  secondaryCategoryName: string;
  suggestedTeachingType: string;
  plannedTeacherJobNo?: string | null;
  lessonPlanUrl?: string;
};

export function AddOutlineItemModal({ open, versionId, sections, onClose }: Props) {
  const [form] = Form.useForm<FormValues>();
  const mutations = useOutlineMutations(versionId);
  const [inline, setInline] = useState<InlineSection | null>(null);
  const [showInlineForm, setShowInlineForm] = useState(false);
  const [inlineDraft, setInlineDraft] = useState<InlineSection>({ code: "", name: "", displayOrder: undefined });

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ sequenceNo: 1, suggestedTeachingType: "1v1" });
      setInline(null);
      setShowInlineForm(false);
      setInlineDraft({ code: "", name: "", displayOrder: undefined });
    }
  }, [open, form]);

  const sectionOptions = useMemo(() => {
    const base = sections.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }));
    if (inline) {
      base.push({ value: inline.code, label: `${inline.name} (${inline.code}) — 新建` });
    }
    return base;
  }, [sections, inline]);

  const saveInline = () => {
    const code = inlineDraft.code.trim().toUpperCase();
    const name = inlineDraft.name.trim();
    if (!/^[A-Z]{2}$/.test(code)) return;
    if (!name) return;
    if (sections.some((s) => s.code === code)) return;
    const next = { code, name, displayOrder: inlineDraft.displayOrder };
    setInline(next);
    setShowInlineForm(false);
    form.setFieldsValue({ sectionCode: code });
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const body: CreateItemBody = {
      sequenceNo: String(values.sequenceNo).padStart(2, "0"),
      secondaryCategoryName: values.secondaryCategoryName.trim(),
      suggestedTeachingType: values.suggestedTeachingType,
      plannedTeacherJobNo: values.plannedTeacherJobNo ?? null,
      lessonPlanUrl: values.lessonPlanUrl?.trim() || null,
    };
    if (inline && values.sectionCode === inline.code) {
      body.newSection = { code: inline.code, name: inline.name, displayOrder: inline.displayOrder };
    } else {
      body.sectionCode = values.sectionCode;
    }
    await mutations.addItem.mutateAsync({ versionId, body });
    onClose();
  };

  return (
    <Modal
      title="向大纲添加"
      open={open}
      onCancel={onClose}
      width={720}
      destroyOnClose
      onOk={handleSubmit}
      okText="确定"
      cancelText="取消"
      confirmLoading={mutations.addItem.isPending}
    >
      <Form<FormValues> form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              label="板块"
              name="sectionCode"
              rules={[{ required: true, message: "请选择板块" }]}
            >
              <Select
                options={sectionOptions}
                placeholder="选择已有板块或新建"
                dropdownRender={(menu) => (
                  <>
                    {menu}
                    <Divider style={{ margin: "4px 0" }} />
                    <div style={{ padding: "0 8px 8px" }}>
                      <Button
                        type="link"
                        icon={<PlusOutlined />}
                        onClick={() => setShowInlineForm(true)}
                      >
                        + 新建板块
                      </Button>
                    </div>
                  </>
                )}
              />
            </Form.Item>
          </Col>

          {showInlineForm ? (
            <Col span={24}>
              <div style={{ background: "#fafafa", padding: 12, borderRadius: 8 }}>
                <Typography.Text type="secondary">新建板块(随本次条目一起保存)</Typography.Text>
                <Row gutter={12} style={{ marginTop: 8 }}>
                  <Col span={8}>
                    <Input
                      placeholder="代码(2 位大写字母)"
                      maxLength={2}
                      value={inlineDraft.code}
                      onChange={(e) =>
                        setInlineDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }))
                      }
                    />
                  </Col>
                  <Col span={10}>
                    <Input
                      placeholder="板块名称"
                      value={inlineDraft.name}
                      onChange={(e) => setInlineDraft((d) => ({ ...d, name: e.target.value }))}
                    />
                  </Col>
                  <Col span={6}>
                    <InputNumber
                      placeholder="排序"
                      min={0}
                      style={{ width: "100%" }}
                      value={inlineDraft.displayOrder ?? null}
                      onChange={(v) =>
                        setInlineDraft((d) => ({ ...d, displayOrder: v ?? undefined }))
                      }
                    />
                  </Col>
                </Row>
                <Space style={{ marginTop: 8 }}>
                  <Button onClick={() => setShowInlineForm(false)}>取消</Button>
                  <Button type="primary" onClick={saveInline}>
                    保存板块
                  </Button>
                </Space>
              </div>
            </Col>
          ) : null}

          <Col span={12}>
            <Form.Item
              label="序列号"
              name="sequenceNo"
              rules={[{ required: true, message: "请填写序列号" }]}
            >
              <InputNumber min={1} max={99} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="建议授课方式"
              name="suggestedTeachingType"
              rules={[{ required: true }]}
            >
              <Select options={TEACHING_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              label="二级课程类别名称"
              name="secondaryCategoryName"
              rules={[{ required: true, message: "请填写二级课程类别名称" }, { max: 100 }]}
            >
              <Input placeholder="例:微积分一对一" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="计划授课老师" name="plannedTeacherJobNo">
              <EmployeePickerField />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="教案排期链接"
              name="lessonPlanUrl"
              rules={[
                {
                  pattern: /^https?:\/\/.+/i,
                  message: "URL 需以 http(s):// 开头",
                },
              ]}
            >
              <Input placeholder="https://..." />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

// Form.Item only injects `value`/`onChange`. `EmployeePicker` is typed
// to expect those same props, so we wrap it here to silence the typing
// mismatch without pulling `Form.useWatch` into every parent.
function EmployeePickerField(props: {
  value?: string | null;
  onChange?: (jobNo: string | null) => void;
}) {
  return (
    <EmployeePicker
      value={props.value ?? null}
      onChange={(next) => props.onChange?.(next)}
      excludeResigned
    />
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/course-outlines/AddOutlineItemModal.tsx
git commit -m "feat(web)(phase-3): add AddOutlineItemModal with inline section creation"
```

---

## Task 17: `EditOutlineItemModal` + `DeleteItemsConfirm`

**Files:**
- Create: `apps/web/src/features/course-outlines/EditOutlineItemModal.tsx`
- Create: `apps/web/src/features/course-outlines/DeleteItemsConfirm.tsx`

- [ ] **Step 1: `EditOutlineItemModal.tsx`**

```tsx
// apps/web/src/features/course-outlines/EditOutlineItemModal.tsx
import {
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
} from "antd";
import { useEffect } from "react";
import { TEACHING_TYPE_OPTIONS } from "../../constants/dictionaries";
import { EmployeePicker } from "../../components/EmployeePicker";
import { useOutlineMutations } from "./hooks/useOutlineMutations";
import type { CourseOutlineItem, CourseSection, UpdateItemBody } from "./types";

type Props = {
  open: boolean;
  versionId: string;
  sections: CourseSection[];
  item: CourseOutlineItem | null;
  onClose: () => void;
};

type FormValues = {
  sectionCode: string;
  sequenceNo: number;
  secondaryCategoryName: string;
  suggestedTeachingType: string;
  plannedTeacherJobNo?: string | null;
  lessonPlanUrl?: string;
};

export function EditOutlineItemModal({ open, versionId, sections, item, onClose }: Props) {
  const [form] = Form.useForm<FormValues>();
  const mutations = useOutlineMutations(versionId);

  useEffect(() => {
    if (open && item) {
      form.setFieldsValue({
        sectionCode: item.sectionCode,
        sequenceNo: Number(item.sequenceNo),
        secondaryCategoryName: item.secondaryCategoryName,
        suggestedTeachingType: item.suggestedTeachingType,
        plannedTeacherJobNo: item.plannedTeacherJobNo ?? undefined,
        lessonPlanUrl: item.lessonPlanUrl ?? undefined,
      });
    }
  }, [open, item, form]);

  if (!item) return null;

  const sectionOptions = sections.map((s) => ({
    value: s.code,
    label: `${s.name} (${s.code})`,
  }));

  const handleSubmit = async () => {
    const v = await form.validateFields();
    const body: UpdateItemBody = {
      sectionCode: v.sectionCode,
      sequenceNo: String(v.sequenceNo).padStart(2, "0"),
      secondaryCategoryName: v.secondaryCategoryName.trim(),
      suggestedTeachingType: v.suggestedTeachingType,
      plannedTeacherJobNo: v.plannedTeacherJobNo ?? null,
      lessonPlanUrl: v.lessonPlanUrl?.trim() || null,
    };
    await mutations.updateItem.mutateAsync({ itemId: item.id, body });
    onClose();
  };

  return (
    <Modal
      title="编辑大纲条目"
      open={open}
      onCancel={onClose}
      onOk={handleSubmit}
      width={720}
      destroyOnClose
      okText="保存"
      cancelText="取消"
      confirmLoading={mutations.updateItem.isPending}
    >
      <Form<FormValues> form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item
              label="板块"
              name="sectionCode"
              rules={[{ required: true, message: "请选择板块" }]}
            >
              <Select options={sectionOptions} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="序列号"
              name="sequenceNo"
              rules={[{ required: true, message: "请填写序列号" }]}
            >
              <InputNumber min={1} max={99} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="建议授课方式"
              name="suggestedTeachingType"
              rules={[{ required: true }]}
            >
              <Select options={TEACHING_TYPE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              label="二级课程类别名称"
              name="secondaryCategoryName"
              rules={[{ required: true, message: "请填写二级课程类别名称" }, { max: 100 }]}
            >
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="计划授课老师" name="plannedTeacherJobNo">
              <EditEmployeePickerField
                historicalEmployee={
                  item.plannedTeacher
                    ? {
                        jobNo: item.plannedTeacher.jobNo,
                        name: item.plannedTeacher.name,
                        employmentStatus: item.plannedTeacher.employmentStatus,
                        jobTitle: null,
                      }
                    : null
                }
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="教案排期链接"
              name="lessonPlanUrl"
              rules={[
                {
                  pattern: /^https?:\/\/.+/i,
                  message: "URL 需以 http(s):// 开头",
                },
              ]}
            >
              <Input />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}

function EditEmployeePickerField(props: {
  value?: string | null;
  onChange?: (jobNo: string | null) => void;
  historicalEmployee?: {
    jobNo: string;
    name: string;
    employmentStatus: "FULL_TIME" | "PART_TIME" | "RESIGNED";
    jobTitle: string | null;
  } | null;
}) {
  return (
    <EmployeePicker
      value={props.value ?? null}
      onChange={(next) => props.onChange?.(next)}
      excludeResigned
      historicalEmployee={
        props.historicalEmployee
          ? {
              jobNo: props.historicalEmployee.jobNo,
              name: props.historicalEmployee.name,
              employmentStatus: props.historicalEmployee.employmentStatus,
              jobTitle: props.historicalEmployee.jobTitle ?? "",
            }
          : null
      }
    />
  );
}
```

- [ ] **Step 2: `DeleteItemsConfirm.tsx`**

```tsx
// apps/web/src/features/course-outlines/DeleteItemsConfirm.tsx
import { ExclamationCircleFilled } from "@ant-design/icons";
import { Modal } from "antd";

type Target = { id: string; secondaryCategoryName: string };

export function confirmDeleteItems(
  targets: Target[],
  onOk: () => Promise<unknown> | void,
) {
  Modal.confirm({
    title: "确认从大纲删除以下条目?",
    icon: <ExclamationCircleFilled />,
    content: (
      <div>
        <p>即将删除 {targets.length} 个二级课程类别:</p>
        <ul style={{ paddingLeft: 20, maxHeight: 240, overflowY: "auto" }}>
          {targets.map((t) => (
            <li key={t.id}>{t.secondaryCategoryName}</li>
          ))}
        </ul>
        <p style={{ color: "#faad14" }}>
          若现有课程引用了这些分类,对应课程的分类将在 Phase 4 课程模块落地后变为空值。
        </p>
      </div>
    ),
    okText: "确认删除",
    okButtonProps: { danger: true },
    cancelText: "取消",
    onOk,
  });
}
```

- [ ] **Step 3: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/course-outlines/EditOutlineItemModal.tsx \
        apps/web/src/features/course-outlines/DeleteItemsConfirm.tsx
git commit -m "feat(web)(phase-3): add edit item modal and delete items confirm"
```

---

## Task 18: `ImportOverwriteDrawer`

**Files:**
- Create: `apps/web/src/features/course-outlines/ImportOverwriteDrawer.tsx`

- [ ] **Step 1: Create the drawer**

```tsx
// apps/web/src/features/course-outlines/ImportOverwriteDrawer.tsx
import { DownloadOutlined, InboxOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Drawer,
  Space,
  Statistic,
  Table,
  Typography,
  Upload,
  message,
} from "antd";
import type { UploadProps } from "antd";
import { useState } from "react";
import { courseOutlinesApi } from "../../services/course-outlines";
import { uploadToStorage } from "../../services/storage";
import { useOutlineMutations } from "./hooks/useOutlineMutations";
import type { ImportRowError, OutlineImportReport } from "./types";

type Props = {
  open: boolean;
  versionId: string;
  versionName: string;
  onClose: () => void;
};

export function ImportOverwriteDrawer({ open, versionId, versionName, onClose }: Props) {
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [report, setReport] = useState<OutlineImportReport | null>(null);
  const [uploading, setUploading] = useState(false);
  const mutations = useOutlineMutations(versionId);

  const reset = () => {
    setFileKey(null);
    setReport(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const customRequest: UploadProps["customRequest"] = async ({ file, onSuccess, onError }) => {
    setUploading(true);
    try {
      const key = await uploadToStorage("course-outlines/import-batches", file as File);
      setFileKey(key);
      const dryRun = await courseOutlinesApi.importDryRun(versionId, key);
      setReport(dryRun);
      onSuccess?.({ key });
    } catch (err) {
      onError?.(err as Error);
      message.error("上传或预校验失败");
    } finally {
      setUploading(false);
    }
  };

  const handleCommit = async () => {
    if (!fileKey) return;
    await mutations.importCommit.mutateAsync({ versionId, fileKey });
    handleClose();
  };

  const errorColumns = [
    { title: "行号", dataIndex: "row", key: "row", width: 80 },
    { title: "字段", dataIndex: "field", key: "field", width: 160 },
    { title: "问题", dataIndex: "message", key: "message" },
  ];

  return (
    <Drawer
      title={`导入并覆盖当前大纲(${versionName})`}
      width={720}
      open={open}
      onClose={handleClose}
      destroyOnClose
      extra={
        <Button icon={<DownloadOutlined />} onClick={() => courseOutlinesApi.downloadTemplate()}>
          下载模板
        </Button>
      }
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Alert
          type="warning"
          showIcon
          message={`导入将覆盖当前版本 ${versionName} 的全部板块与条目,版本号不变。原有条目将被永久删除。`}
        />
        <Typography.Paragraph type="secondary">
          1. 下载模板,按列填充板块与条目。<br />
          2. 上传后系统会预校验所有行;只有零错误时才允许"确认导入并覆盖"。<br />
          3. 计划授课老师工号需对应未离职员工。
        </Typography.Paragraph>

        <Upload.Dragger
          accept=".xlsx"
          multiple={false}
          showUploadList={false}
          customRequest={customRequest}
          disabled={uploading || mutations.importCommit.isPending}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            {uploading ? "上传中..." : "点击或拖拽 .xlsx 文件到此处"}
          </p>
        </Upload.Dragger>

        {report ? (
          <>
            <Space size="large">
              <Statistic title="总行数" value={report.totalRows} />
              <Statistic title="有效行" value={report.validRows} />
              <Statistic title="识别板块数" value={report.uniqueSections} />
              <Statistic
                title="错误条数"
                value={report.errors.length}
                valueStyle={{ color: report.errors.length > 0 ? "#ff4d4f" : "#52c41a" }}
              />
            </Space>
            {report.errors.length > 0 ? (
              <Alert
                type="error"
                showIcon
                message="检测到错误,请修正模板后重新上传"
                description={
                  <Table<ImportRowError>
                    rowKey={(row, idx) => `${row.row}-${row.field}-${idx}`}
                    size="small"
                    pagination={false}
                    columns={errorColumns}
                    dataSource={report.errors}
                    style={{ marginTop: 12 }}
                  />
                }
              />
            ) : (
              <Alert type="success" message="校验通过,可以导入" />
            )}
            <Button
              type="primary"
              danger
              size="large"
              block
              loading={mutations.importCommit.isPending}
              disabled={report.errors.length > 0 || report.validRows === 0}
              onClick={handleCommit}
            >
              确认导入并覆盖
            </Button>
          </>
        ) : null}
      </Space>
    </Drawer>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/course-outlines/ImportOverwriteDrawer.tsx
git commit -m "feat(web)(phase-3): add ImportOverwriteDrawer with dry-run + commit flow"
```

---

## Task 19: `CourseOutlinePage` composition + styles

**Files:**
- Create: `apps/web/src/features/course-outlines/CourseOutlinePage.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Create the page**

```tsx
// apps/web/src/features/course-outlines/CourseOutlinePage.tsx
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ImportOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Empty,
  Popover,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { courseOutlinesApi } from "../../services/course-outlines";
import { AddOutlineItemModal } from "./AddOutlineItemModal";
import { EditOutlineItemModal } from "./EditOutlineItemModal";
import { ImportOverwriteDrawer } from "./ImportOverwriteDrawer";
import { OutlineVersionDropdown } from "./OutlineVersionDropdown";
import { confirmCreateVersion } from "./CreateVersionConfirm";
import { DeleteVersionConfirm } from "./DeleteVersionConfirm";
import { confirmDeleteItems } from "./DeleteItemsConfirm";
import { useOutline } from "./hooks/useOutline";
import { useOutlineVersions } from "./hooks/useOutlineVersions";
import { useOutlineMutations } from "./hooks/useOutlineMutations";
import type { CourseOutlineItem } from "./types";

export function CourseOutlinePage() {
  const [params, setParams] = useSearchParams();
  const versionsQ = useOutlineVersions();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === "SUPER_ADMIN" || role === "ADMIN";

  const versions = versionsQ.data ?? [];
  const activeFromUrl = params.get("v");
  const activeVersionId =
    activeFromUrl && versions.some((v) => v.id === activeFromUrl)
      ? activeFromUrl
      : versions.find((v) => v.isActive)?.id ?? null;

  const outlineQ = useOutline(activeVersionId);
  const mutations = useOutlineMutations(activeVersionId);
  const activeVersion = versions.find((v) => v.id === activeVersionId) ?? null;

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<CourseOutlineItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteVersionOpen, setDeleteVersionOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!activeFromUrl && activeVersionId) {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("v", activeVersionId);
        return next;
      }, { replace: true });
    }
  }, [activeFromUrl, activeVersionId, setParams]);

  const sections = outlineQ.data?.sections ?? [];
  const items = outlineQ.data?.items ?? [];

  const itemsBySectionCode = useMemo(() => {
    const map = new Map<string, CourseOutlineItem[]>();
    for (const s of sections) map.set(s.code, []);
    for (const i of items) {
      const bucket = map.get(i.sectionCode);
      if (bucket) bucket.push(i);
      else map.set(i.sectionCode, [i]);
    }
    return map;
  }, [sections, items]);

  const selectedCount = selectedIds.length;
  const canEdit = selectedCount === 1;
  const canBatchDelete = selectedCount >= 1;

  const openEdit = () => {
    const target = items.find((i) => i.id === selectedIds[0]);
    if (!target) return;
    setEditItem(target);
    setEditOpen(true);
  };

  const openDelete = () => {
    const targets = items.filter((i) => selectedIds.includes(i.id));
    confirmDeleteItems(
      targets.map((t) => ({ id: t.id, secondaryCategoryName: t.secondaryCategoryName })),
      async () => {
        await mutations.deleteItems.mutateAsync(selectedIds);
        setSelectedIds([]);
      },
    );
  };

  const onCreateVersion = () => {
    confirmCreateVersion(async () => {
      try {
        const created = await mutations.createVersion.mutateAsync();
        setParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("v", created.id);
          return next;
        });
      } catch {
        // useOutlineMutations handles message.error
      }
    });
  };

  const renderActualTeachers = (list: CourseOutlineItem["actualTeachers"]) => {
    if (!list || list.length === 0) return <span>—</span>;
    const head = list.slice(0, 2);
    const rest = list.length - head.length;
    const chips = head.map((t) => <Tag key={t.jobNo}>{t.name}</Tag>);
    if (rest > 0) {
      return (
        <Popover
          content={
            <div style={{ maxWidth: 260 }}>
              {list.map((t) => (
                <div key={t.jobNo}>
                  {t.name} — {t.jobNo}({t.courseCount} 门)
                </div>
              ))}
            </div>
          }
        >
          <span>
            {chips}
            <Tag>+{rest} 人</Tag>
          </span>
        </Popover>
      );
    }
    return <span>{chips}</span>;
  };

  const columns = [
    { title: "序列号", dataIndex: "sequenceNo", key: "sequenceNo", width: 90 },
    {
      title: "二级课程类别名称",
      dataIndex: "secondaryCategoryName",
      key: "secondaryCategoryName",
    },
    {
      title: "建议授课方式",
      dataIndex: "suggestedTeachingType",
      key: "suggestedTeachingType",
      width: 140,
    },
    {
      title: "计划授课老师",
      key: "plannedTeacher",
      width: 160,
      render: (_: unknown, row: CourseOutlineItem) =>
        row.plannedTeacher ? (
          <span>
            {row.plannedTeacher.name}
            {row.plannedTeacher.employmentStatus === "RESIGNED" ? (
              <Tag color="red" style={{ marginLeft: 8 }}>已离职</Tag>
            ) : null}
          </span>
        ) : (
          <span>—</span>
        ),
    },
    {
      title: "实际授课老师(自动同步)",
      key: "actualTeachers",
      width: 240,
      render: (_: unknown, row: CourseOutlineItem) => renderActualTeachers(row.actualTeachers),
    },
    {
      title: "教案排期",
      dataIndex: "lessonPlanUrl",
      key: "lessonPlanUrl",
      width: 200,
      render: (url: string | null) =>
        url ? (
          <a href={url} target="_blank" rel="noreferrer">打开</a>
        ) : (
          <span>—</span>
        ),
    },
  ];

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        研录课程大纲
      </Typography.Title>

      <div className="course-outline-toolbar">
        <Space wrap>
          <OutlineVersionDropdown
            versions={versions}
            value={activeVersionId}
            loading={versionsQ.isLoading}
            onChange={(id) =>
              setParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("v", id);
                return next;
              })
            }
          />
          {canManage ? (
            <>
              <Button icon={<EditOutlined />} disabled={!canEdit} onClick={openEdit}>
                编辑
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={!activeVersionId}
                onClick={() => setAddOpen(true)}
              >
                向大纲添加
              </Button>
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={!canBatchDelete}
                onClick={openDelete}
              >
                从大纲删除
              </Button>
            </>
          ) : null}
        </Space>
        <div style={{ flex: 1 }} />
        <Space wrap>
          {canManage ? (
            <>
              <Button onClick={onCreateVersion}>创建新大纲</Button>
              <Button
                icon={<ImportOutlined />}
                disabled={!activeVersionId}
                onClick={() => setImportOpen(true)}
              >
                导入并覆盖
              </Button>
              <Button
                danger
                disabled={!activeVersionId}
                onClick={() => setDeleteVersionOpen(true)}
              >
                删除当前大纲
              </Button>
            </>
          ) : null}
          <Button
            type="link"
            icon={<DownloadOutlined />}
            onClick={() => courseOutlinesApi.downloadTemplate().catch(() => message.error("下载失败"))}
          >
            下载空白大纲模板
          </Button>
        </Space>
      </div>

      {!activeVersionId ? (
        <Empty
          description="暂无大纲版本,请点击"
          style={{ marginTop: 48 }}
        />
      ) : sections.length === 0 ? (
        <Empty
          description={`版本 ${activeVersion?.versionName ?? ""} 暂无板块,请点击"向大纲添加"开始创建`}
          style={{ marginTop: 48 }}
        />
      ) : (
        sections.map((section) => (
          <Card
            key={section.id}
            title={`${section.name} (${section.code})`}
            className="course-outline-section-card"
          >
            <Table<CourseOutlineItem>
              rowKey="id"
              size="middle"
              pagination={false}
              dataSource={itemsBySectionCode.get(section.code) ?? []}
              columns={columns}
              rowSelection={{
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys as string[]),
                preserveSelectedRowKeys: true,
              }}
            />
          </Card>
        ))
      )}

      {activeVersionId ? (
        <>
          <AddOutlineItemModal
            open={addOpen}
            versionId={activeVersionId}
            sections={sections}
            onClose={() => setAddOpen(false)}
          />
          <EditOutlineItemModal
            open={editOpen}
            versionId={activeVersionId}
            sections={sections}
            item={editItem}
            onClose={() => {
              setEditOpen(false);
              setEditItem(null);
            }}
          />
          <ImportOverwriteDrawer
            open={importOpen}
            versionId={activeVersionId}
            versionName={activeVersion?.versionName ?? ""}
            onClose={() => setImportOpen(false)}
          />
          <DeleteVersionConfirm
            open={deleteVersionOpen}
            versionName={activeVersion?.versionName ?? ""}
            onClose={() => setDeleteVersionOpen(false)}
            loading={mutations.deleteVersion.isPending}
            onConfirm={async () => {
              await mutations.deleteVersion.mutateAsync({
                id: activeVersionId,
                confirmVersionName: activeVersion?.versionName ?? "",
              });
              setParams((prev) => {
                const next = new URLSearchParams(prev);
                next.delete("v");
                return next;
              });
            }}
          />
        </>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Append styles**

Open `apps/web/src/styles.css`. Append at the end of the file:

```css
.course-outline-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.course-outline-section-card {
  margin-bottom: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
```

- [ ] **Step 3: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/course-outlines/CourseOutlinePage.tsx \
        apps/web/src/styles.css
git commit -m "feat(web)(phase-3): add CourseOutlinePage composing sections, modals and import"
```

---

## Task 20: Router wiring + `/courses` breadcrumb

**Files:**
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Edit `router.tsx`**

Open `apps/web/src/router.tsx`. Add the import at the top alongside the other feature imports:

```tsx
import { CourseOutlinePage } from "./features/course-outlines/CourseOutlinePage";
```

Then replace the existing `"courses"` child block with the two-route pair:

```tsx
      {
        path: "courses",
        element: (
          <RequireAuth>
            <ModulePage
              title="课程管理"
              summary="课程大纲已上线;课程列表 / 学生选课将在 Phase 4 开放。"
              milestones={["课程大纲已上线", "课程列表/选课待 Phase 4"]}
              specs={[
                "docs/spec/04-Phase3-课程大纲管理.md",
                "docs/spec/05-Phase4-课程信息与学生选课.md",
              ]}
              entryLinks={[{ label: "进入课程大纲", to: "/courses/outline" }]}
            />
          </RequireAuth>
        ),
      },
      {
        path: "courses/outline",
        element: (
          <RequireAuth>
            <CourseOutlinePage />
          </RequireAuth>
        ),
      },
```

- [ ] **Step 2: Teach `ModulePage` about `entryLinks` (if the prop does not exist yet)**

Check the existing `ModulePage` component:

```bash
grep -n "entryLinks" apps/web/src/pages/ModulePage.tsx || echo "NOT FOUND — add it"
```

If `entryLinks` does not exist in the component, open `apps/web/src/pages/ModulePage.tsx` and add the prop. The pattern (preserving the existing style):

```tsx
// Inside the existing Props type:
  entryLinks?: { label: string; to: string }[];

// Inside the render, right after the existing milestones list:
{props.entryLinks?.length ? (
  <Space wrap style={{ marginTop: 16 }}>
    {props.entryLinks.map((l) => (
      <Button key={l.to} type="primary" onClick={() => navigate(l.to)}>
        {l.label}
      </Button>
    ))}
  </Space>
) : null}
```

Add `import { Button, Space } from "antd";` and `import { useNavigate } from "react-router-dom";` at the top if not already present. Inside the function body, add `const navigate = useNavigate();`.

If `ModulePage.tsx` already accepts `entryLinks`, do nothing here.

- [ ] **Step 3: Verify compilation + dev server starts**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
pnpm dev:web
```

Expected: Vite reports `Local: http://localhost:5173/` and `/courses/outline` opens without a console error when you visit it (white page is fine if you're not logged in — `RequireAuth` will redirect).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/router.tsx apps/web/src/pages/ModulePage.tsx
git commit -m "feat(web)(phase-3): mount /courses/outline sub-route and breadcrumb entry"
```

---

## Task 21: End-to-end smoke (browser) + acceptance checklist

**Files:** (none — verification only)

With the API and web dev servers both running, and a SUPER_ADMIN session active:

- [ ] **Step 1: First-time empty state**

Navigate to `http://localhost:5173/courses/outline`. If your DB has no versions, expect:

- Toolbar shows dropdown (disabled / empty), `创建新大纲` enabled, other write buttons disabled.
- Main area shows `Empty` with text "暂无大纲版本..."

- [ ] **Step 2: Create three versions in a row**

Click `创建新大纲`. Confirm the warning modal. Expect message "已创建 课程大纲-YYA" and the dropdown now shows that version. Repeat twice — second creation should go to `YYB`, third to `YYC`. The dropdown shows the latest with a `当前` tag; switching the dropdown updates the URL query string `?v=<id>` and reloads the body.

- [ ] **Step 3: Add sections + items inline**

On the active version, click `向大纲添加`. In the section select, click `+ 新建板块` and add code `GP`, name `GPA提升`, order `1`. Save inline → select returns to GP. Fill sequenceNo `1`, category `微积分`, teaching type `1v1`, leave teacher empty. Submit. Expect success toast + section card appears with one row.

Repeat to add code `KY` / `科研赋能` / order 2, then a second item in GP with sequenceNo `2`. Verify card ordering matches `displayOrder`.

- [ ] **Step 4: Duplicate section / duplicate sequence**

Attempt `向大纲添加` again and inline-create `GP` a second time → should be blocked either by the local check (same-code disabled in saveInline) or by backend 409 on submit with the expected toast.

Attempt to add an item in `GP` with sequenceNo `1` (already used) → expect 409 toast `板块 GP 下序列号 01 已存在`.

- [ ] **Step 5: Edit + delete items**

Tick one item → `编辑` becomes enabled. Open it, change `secondaryCategoryName` → save → row refreshes.

Tick two items → `编辑` disables, `从大纲删除` stays enabled. Click delete → confirm dialog lists both category names → confirm. Expect toast `已删除 2 条`, both rows removed.

- [ ] **Step 6: Import overwrite**

Click `导入并覆盖`. Click `下载模板` → browser downloads `课程大纲空白模板.xlsx`. Open it, add two rows under a new `ZZ`/测试板块 with sequenceNo 01 and 02, save, upload back via drag-drop. Expect stats show `总行数: 2 / 有效行: 2 / 识别板块数: 1 / 错误: 0`. Click `确认导入并覆盖` → toast `已导入 1 个板块 / 2 条条目`, main area now shows only the `ZZ` card (previous GP/KY are gone since commit overwrites everything).

Error-path sanity: re-open the drawer, upload a template with a row whose `建议授课方式` is `bogus`. Expect the error table row `建议授课方式 / 非法值...` and the commit button stays disabled.

- [ ] **Step 7: Delete version**

Click `删除当前大纲`. Expect red-titled modal. Try typing something wrong into the input → `确认删除` stays disabled. Type the exact version name → button enables → click → toast `版本已删除`. Dropdown updates, the previous latest becomes active.

- [ ] **Step 8: Audit log sanity**

```bash
docker compose exec -T db psql -U yanlu -d yanluzhongtai \
  -c "SELECT action, \"targetType\" FROM \"AuditLog\" ORDER BY \"createdAt\" DESC LIMIT 15;"
```

Expected: within the last 15 rows you see at least one of each:
- `(create, course_outline_version)`
- `(create, course_outline_item)`
- `(update, course_outline_item)`
- `(delete, course_outline_item)`
- `(import_overwrite, course_outline_version)`
- `(delete, course_outline_version)`

- [ ] **Step 9: Acceptance checklist cross-check**

Run through Phase 3 design §8. Every item below must be green; otherwise go back and fix.

- [ ] `/courses/outline` bounces unauthenticated traffic to the unauthorized page (via `RequireAuth`).
- [ ] Fresh DB → empty state renders and only `创建新大纲` is enabled.
- [ ] Creating versions generates `课程大纲-YYA`, `YYB`, `YYC` in sequence.
- [ ] Year rollover resets to `YYA` of the new year (verify by changing the server clock manually if desired; otherwise trust the unit assertion from Task 3 Step 3).
- [ ] Dropdown shows `当前` tag on the active version.
- [ ] Inline-creating a section while adding an item lands both records in the same transaction.
- [ ] Same-section same-sequence add returns 409 and a toast appears.
- [ ] Edit modal pre-fills values; save refreshes the table.
- [ ] Selecting 1 row enables 编辑; selecting ≥2 rows disables 编辑 but keeps 删除.
- [ ] Delete items confirmation lists the category names.
- [ ] Import drawer shows stats, error table when rows are invalid, warning banner about overwrite.
- [ ] Delete version requires typing the exact version name; cascades sections + items; promotes the next-most-recent version to active.
- [ ] Audit log rows exist for every write verb above.
- [ ] 下载空白大纲模板 renders as a link-style button (not a primary button).

No commit for this task — verification only. If any checklist line failed, open a fresh branch from the failure point rather than amending the last commit.

---

## Wrap-up

After Task 21 all passes, you're done:

```bash
# Final sanity: everything compiles on both sides
pnpm --filter @yanlu/api exec tsc --noEmit
pnpm --filter @yanlu/web exec tsc --noEmit

# And the branch is clean
git status
```

Expected: both tsc calls print nothing; `git status` shows `working tree clean`.

You can now either:
- Open a PR against `main`, or
- Hand the branch off to the next phase (Phase 2 / Phase 4 depending on project order). If Phase 2 lands later, the Task 4 + Task 13 extracts are forward-compatible — the Phase 2 PR should delete them from its own plan and rebase on top.
