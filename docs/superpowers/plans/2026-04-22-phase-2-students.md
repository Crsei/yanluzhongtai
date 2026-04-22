# Phase 2 — 学生模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the full student CRUD slice (list with advanced search / view / add / edit / delete + Excel import + MinIO attachments + counselor/planner employee picker) on top of the Phase 1A infrastructure.

**Architecture:** All backend infrastructure (`IdSequenceService`, `StorageService`, `AuditLogsService`, global `RolesGuard`, dictionaries) already exists from Phase 1A; Phase 2 extends each slightly and adds a new `modules/students/` alongside a new frontend `features/students/`. The only new shared frontend primitive is `<EmployeePicker>`, a reusable Select used by the student form (and, in Phase 3, the course form). Grade is computed server-side via a CTE that exposes both a text label (for filter / display) and a numeric rank (for sort), so a single SQL expression backs both the `WHERE grade = '大三'` filter and the `ORDER BY gradePriority` clause.

**Tech Stack:** NestJS 10 + Prisma 5 + class-validator + `minio` ^8 + `exceljs` ^4 on the backend; React 18 + Vite + AntD 5 + TanStack Query 5 + Zustand on the frontend; PostgreSQL + MinIO via docker-compose. No new dependencies.

**Source spec:** [`docs/superpowers/specs/2026-04-22-phase-2-students-design.md`](../specs/2026-04-22-phase-2-students-design.md)
**Phase requirement:** [`docs/spec/03-Phase2-学生管理.md`](../../spec/03-Phase2-学生管理.md)

## Testing posture

The repo intentionally has **no** automated test runner (per `CLAUDE.md`: "No test or lint scripts are configured yet. Do not invent `pnpm test`."). Phase 2 continues the Phase 1A/1B convention: each task swaps the usual TDD cycle for an explicit **Verify** step with runnable shell / curl / psql / browser commands, run before the commit. Adopt the discipline of "specify expected behavior → implement → verify → commit"; do not ship a task whose Verify step did not pass.

## Pre-flight (run once before Task 1)

```bash
pnpm install
docker compose up -d db minio
pnpm prisma:generate

test -f .env || cp .env.example .env
test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
test -f apps/web/.env || cp apps/web/.env.example apps/web/.env

# Confirm Phase 1A/1B landed cleanly — the student slice assumes employees + users already work.
curl -s http://localhost:3000/api/health || (pnpm dev:api &) && sleep 5 && curl -s http://localhost:3000/api/health
```

You should be on a clean git tree (`git status` empty) before starting Task 1.

---

## Task 1: Prisma schema — add `ServiceStatus` enum + extend `Student`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add the `ServiceStatus` enum**

In `apps/api/prisma/schema.prisma`, below the existing `enum EmploymentStatus { ... }` block (around line 16-20), add:

```prisma
enum ServiceStatus {
  NOT_STARTED
  IN_SERVICE
  PAUSED
  TERMINATED
  COMPLETED
}
```

- [ ] **Step 2: Replace the `Student` model block**

Replace the existing `model Student { ... }` block with:

```prisma
model Student {
  id                       String        @id @default(cuid())
  studentNo                String        @unique
  name                     String
  gender                   String
  enrollmentYear           Int
  graduationYear           Int
  school                   String?
  major                    String?
  counselorJobNo           String?
  plannerJobNo             String?
  phone                    String?
  email                    String?
  servicePlatform          String
  source                   String
  serviceStatus            ServiceStatus @default(NOT_STARTED)
  totalPublicCredits       Decimal?      @db.Decimal(8, 2)
  totalPrivateCredits      Decimal?      @db.Decimal(8, 2)
  remainingPublicCredits   Decimal?      @db.Decimal(8, 2)
  remainingPrivateCredits  Decimal?      @db.Decimal(8, 2)
  serviceChecklistUrl      String?
  serviceChecklistKeys     String[]
  overallPlanUrl           String?
  overallPlanText          String?
  policyKeys               String[]
  policyText               String?
  detailNotes              Json?
  scheduleKeys             String[]
  transcriptKeys           String[]
  attachmentKeys           String[]
  note                     String?
  enrollments              Enrollment[]
  createdAt                DateTime      @default(now())
  updatedAt                DateTime      @updatedAt

  @@index([name])
  @@index([enrollmentYear])
}
```

- [ ] **Step 3: Regenerate the Prisma client**

```bash
pnpm prisma:generate
```

Expected: prints "Generated Prisma Client (vX.Y.Z) ... in NNN ms".

- [ ] **Step 4: Push the schema to the dev database**

```bash
pnpm prisma:push
```

If Postgres complains about the `serviceStatus` column type change on a non-empty `Student` table, rerun with:

```bash
pnpm --filter @yanlu/api exec prisma db push --accept-data-loss
```

The Phase 0 / 1A scaffold leaves `Student` empty (Phase 2 is its first write path), so the data-loss flag only drops zero rows.

Expected output ends with `Your database is now in sync with your Prisma schema.`

- [ ] **Step 5: Verify the new table shape + enum**

```bash
docker compose exec -T db psql -U yanlu -d yanluzhongtai -c "\dT+ \"ServiceStatus\"" -c "\d \"Student\""
```

Expected:
- `ServiceStatus` lists five labels (`NOT_STARTED`, `IN_SERVICE`, `PAUSED`, `TERMINATED`, `COMPLETED`).
- `Student.serviceStatus` column is type `ServiceStatus`, default `NOT_STARTED`.
- Columns `transcriptKeys`, `overallPlanText`, `policyText`, `attachmentKeys` present.
- Index `Student_enrollmentYear_idx` present.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(phase-2)(prisma): add ServiceStatus enum and extend Student model"
```

---

## Task 2: Backend dictionaries extension

**Files:**
- Modify: `apps/api/src/common/dictionaries.ts`

- [ ] **Step 1: Append the new exports**

Open `apps/api/src/common/dictionaries.ts`. Leave all Phase 1A exports untouched. Append the following block **after** the existing `EMPLOYEE_SERVING_FOR` export but **before** the existing `STORAGE_FOLDERS` export:

```ts
// ---------------------------------------------------------------------------
// Phase 2: Student dictionaries
// ---------------------------------------------------------------------------

/** Mirrors Prisma enum ServiceStatus. */
export const SERVICE_STATUS = [
  "NOT_STARTED",
  "IN_SERVICE",
  "PAUSED",
  "TERMINATED",
  "COMPLETED",
] as const;
export type ServiceStatus = (typeof SERVICE_STATUS)[number];

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  NOT_STARTED: "未开始",
  IN_SERVICE: "正常服务中",
  PAUSED: "服务暂缓",
  TERMINATED: "取消或终止",
  COMPLETED: "服务完成",
};

/** spec §4.3 first-priority sort: 未开始 > 正常服务中 > 服务暂缓 > 取消或终止 > 服务完成 */
export const SERVICE_STATUS_SORT: Record<ServiceStatus, number> = {
  NOT_STARTED: 0,
  IN_SERVICE: 1,
  PAUSED: 2,
  TERMINATED: 3,
  COMPLETED: 4,
};

/** Reverse map for Excel import: Chinese label → enum code */
export const SERVICE_STATUS_BY_LABEL: Record<string, ServiceStatus> =
  Object.fromEntries(
    Object.entries(SERVICE_STATUS_LABELS).map(([code, label]) => [label, code as ServiceStatus]),
  );

export const SERVICE_PLATFORM = ["研录保研", "研录考研", "高途", "其他"] as const;
export type ServicePlatform = (typeof SERVICE_PLATFORM)[number];

export const STUDENT_SOURCE = [
  "自有流量",
  "研录考研",
  "高途",
  "转介绍",
  "其他",
] as const;
export type StudentSource = (typeof STUDENT_SOURCE)[number];

/** Frontend-only display dict; backend computes from enrollmentYear/graduationYear. */
export const GRADE_VALUES = [
  "大一",
  "大二",
  "大三",
  "大四",
  "大五",
  "已毕业",
] as const;
export type GradeValue = (typeof GRADE_VALUES)[number];
```

- [ ] **Step 2: Update `STORAGE_FOLDERS` to include the student prefixes**

Replace the existing `STORAGE_FOLDERS` constant (still in the same file) with:

```ts
/** Whitelist of allowed presign upload prefixes. */
export const STORAGE_FOLDERS = [
  "employees/attachments",
  "employees/import-batches",
  "students/attachments",
  "students/import-batches",
] as const;
export type StorageFolder = (typeof STORAGE_FOLDERS)[number];
```

- [ ] **Step 3: Verify the file compiles**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/common/dictionaries.ts
git commit -m "feat(phase-2)(api): add student dictionaries (service status, platform, source, grade)"
```

---

## Task 3: Generalize `AuditLogsService` — `*.update` triggers field-level diff

**Files:**
- Modify: `apps/api/src/modules/audit-logs/audit-logs.service.ts`

- [ ] **Step 1: Locate the existing update-path guard**

Current code in `apps/api/src/modules/audit-logs/audit-logs.service.ts::record()` contains:

```ts
// Behaviour-level row for create / delete / updates without a diff payload
if (action !== "update" || !before || !after) {
  // ...
  return;
}
```

- [ ] **Step 2: Replace the guard with a suffix-aware check**

Change the condition so any action equal to `"update"` OR ending in `.update` triggers the field-level diff branch. Replace the two lines above (up to the open brace) with:

```ts
// Behaviour-level row for create / delete / updates without a diff payload
const isUpdateAction = action === "update" || action.endsWith(".update");
if (!isUpdateAction || !before || !after) {
```

Leave the rest of the method untouched.

- [ ] **Step 3: Verify the file still compiles**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Regression-verify the existing employee audit path still behaves**

Start the API (`pnpm dev:api`), log in as SUPER_ADMIN, then edit an employee's name via the existing UI (or curl). Query the audit log:

```bash
docker compose exec -T db psql -U yanlu -d yanluzhongtai -c "SELECT action, \"fieldName\", \"beforeValue\", \"afterValue\" FROM \"AuditLog\" WHERE action = 'update' ORDER BY \"createdAt\" DESC LIMIT 5"
```

Expected: the latest row has `fieldName = 'name'` (not null) — confirming the field-level branch still fires for plain `"update"`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/audit-logs/audit-logs.service.ts
git commit -m "feat(phase-2)(api): let AuditLogsService treat *.update actions as field-level"
```

---

## Task 4: Extend `EmployeesService.list` — jobNo filter + multi-value employmentStatus

**Files:**
- Modify: `apps/api/src/modules/employees/dto/query-employees.dto.ts`
- Modify: `apps/api/src/modules/employees/employees.service.ts`

This is needed so the frontend `<EmployeePicker>` can (a) exclude RESIGNED employees via `employmentStatus=FULL_TIME,PART_TIME` and (b) look up a single employee by `jobNo` for form backfill.

- [ ] **Step 1: Relax the DTO**

Open `apps/api/src/modules/employees/dto/query-employees.dto.ts`. Replace the existing `employmentStatus` field and add `jobNo` so the class looks like:

```ts
import { Transform, Type } from "class-transformer";
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { EMPLOYMENT_STATUS, type EmploymentStatus } from "../../../common/dictionaries";

export class QueryEmployeesDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  /**
   * Accept either a single code ("FULL_TIME") or a comma-separated list
   * ("FULL_TIME,PART_TIME"). The transformer normalises to an array; the
   * service reads .length to decide single vs. `in` filtering.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === "") return undefined;
    if (Array.isArray(value)) return value;
    return String(value).split(",").map((s) => s.trim()).filter(Boolean);
  })
  @IsArray()
  @IsString({ each: true })
  employmentStatus?: EmploymentStatus[];

  /** Comma-separated list of exact jobNo values. When present, keyword is ignored. */
  @IsOptional()
  @IsString()
  jobNo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}
```

Delete any prior import or `@IsIn(EMPLOYMENT_STATUS)` decorator that referenced the old single-value shape.

- [ ] **Step 2: Update `EmployeesService.list` to honour the new params**

In `apps/api/src/modules/employees/employees.service.ts`, find the existing `where` construction inside `list()`:

```ts
const where: Prisma.EmployeeWhereInput = {};
if (query.employmentStatus) {
  where.employmentStatus = query.employmentStatus as EmploymentStatus;
}
if (query.keyword && query.keyword.trim().length > 0) {
  // ...
}
```

Replace with:

```ts
const where: Prisma.EmployeeWhereInput = {};

if (query.employmentStatus && query.employmentStatus.length > 0) {
  where.employmentStatus =
    query.employmentStatus.length === 1
      ? (query.employmentStatus[0] as EmploymentStatus)
      : { in: query.employmentStatus as EmploymentStatus[] };
}

if (query.jobNo && query.jobNo.trim().length > 0) {
  const jobNos = query.jobNo
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  where.jobNo = jobNos.length === 1 ? jobNos[0] : { in: jobNos };
} else if (query.keyword && query.keyword.trim().length > 0) {
  const keyword = query.keyword.trim();
  where.OR = [
    { name: { contains: keyword, mode: "insensitive" } },
    { jobNo: { contains: keyword, mode: "insensitive" } },
    { phone: { contains: keyword, mode: "insensitive" } },
  ];
}
```

Find the `buildSortedListQuery` helper in the same file and update its `employmentStatus` branch so it accepts both shapes. Replace the existing:

```ts
if (where.employmentStatus) {
  conditions.push(Prisma.sql`"employmentStatus"::text = ${where.employmentStatus as string}`);
}
```

with:

```ts
if (where.employmentStatus) {
  const es = where.employmentStatus;
  if (typeof es === "string") {
    conditions.push(Prisma.sql`"employmentStatus"::text = ${es}`);
  } else if (typeof es === "object" && "in" in es && Array.isArray(es.in)) {
    conditions.push(
      Prisma.sql`"employmentStatus"::text IN (${Prisma.join(es.in as string[])})`,
    );
  }
}
if (where.jobNo) {
  const jn = where.jobNo;
  if (typeof jn === "string") {
    conditions.push(Prisma.sql`"jobNo" = ${jn}`);
  } else if (typeof jn === "object" && "in" in jn && Array.isArray(jn.in)) {
    conditions.push(
      Prisma.sql`"jobNo" IN (${Prisma.join(jn.in as string[])})`,
    );
  }
}
```

Add the `where.jobNo` block immediately after the `where.employmentStatus` block inside `buildSortedListQuery`. Leave the `where.OR` branch untouched.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Smoke-test the extended list endpoint**

Start the API (`pnpm dev:api`). Log in via existing Phase 0 flow, grab the access token (`$T`), then:

```bash
# Single status (back-compat)
curl -s "http://localhost:3000/api/employees?employmentStatus=FULL_TIME" -H "Authorization: Bearer $T" | jq '.items | length'

# Multi status
curl -s "http://localhost:3000/api/employees?employmentStatus=FULL_TIME,PART_TIME" -H "Authorization: Bearer $T" | jq '.items | length'

# jobNo exact (assumes an employee with jobNo 26001 exists; replace with one from your DB)
curl -s "http://localhost:3000/api/employees?jobNo=26001" -H "Authorization: Bearer $T" | jq '.items[0].jobNo'
```

Expected:
- Multi-status result is ≥ single-status result.
- `jobNo=` exact lookup returns exactly one row with that jobNo.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/employees/dto/query-employees.dto.ts apps/api/src/modules/employees/employees.service.ts
git commit -m "feat(phase-2)(api): extend employees query with jobNo + multi-value employmentStatus"
```

---

## Task 5: `students/utils/grade.ts` — grade calculation + SQL helpers

**Files:**
- Create: `apps/api/src/modules/students/utils/grade.ts`

- [ ] **Step 1: Create the file**

```ts
// apps/api/src/modules/students/utils/grade.ts

/**
 * spec §6: grade is derived from enrollmentYear / graduationYear / today.
 * Academic-year boundary: September 1. July 1 counts as graduation month.
 *
 * Returned value matches the GRADE_VALUES dictionary plus `null` for
 * "not-yet-enrolled" rows (e.g. 2026 enrollees queried in 2026-04).
 */
export function calculateGrade(
  enrollmentYear: number,
  graduationYear: number,
  now: Date = new Date(),
): string | null {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1..12

  // Graduation first — if the student's graduation year has passed (or is
  // the current year and we're past July), they are done.
  if (currentYear > graduationYear) return "已毕业";
  if (currentYear === graduationYear && currentMonth >= 7) return "已毕业";

  const academicYear =
    currentMonth >= 9
      ? currentYear - enrollmentYear + 1
      : currentYear - enrollmentYear;

  if (academicYear < 1) return null;
  if (academicYear >= 5) return "大五";
  if (academicYear === 4) return "大四";
  if (academicYear === 3) return "大三";
  if (academicYear === 2) return "大二";
  return "大一";
}

/**
 * SQL fragment that returns a string grade label given a Student row.
 * Identical logic to `calculateGrade`; used in `$queryRaw` CTEs so
 * filter (`WHERE s.grade_text = '大三'`) and display share one source.
 */
export const GRADE_TEXT_CASE_SQL = `
  CASE
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int > "graduationYear" THEN '已毕业'
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int = "graduationYear" AND EXTRACT(MONTH FROM CURRENT_DATE) >= 7 THEN '已毕业'
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) < 1 THEN NULL
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) >= 5 THEN '大五'
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 4 THEN '大四'
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 3 THEN '大三'
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 2 THEN '大二'
    ELSE '大一'
  END
`;

/**
 * SQL fragment that returns a numeric rank for ORDER BY.
 * spec §4.3 second priority: 大五(0) > 大四(1) > 大三(2) > 大二(3) > 大一(4); 已毕业(5)
 */
export const GRADE_SORT_SQL = `
  CASE
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int > "graduationYear" THEN 5
    WHEN EXTRACT(YEAR FROM CURRENT_DATE)::int = "graduationYear" AND EXTRACT(MONTH FROM CURRENT_DATE) >= 7 THEN 5
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) >= 5 THEN 0
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 4 THEN 1
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 3 THEN 2
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 2 THEN 3
    ELSE 4
  END
`;

/** Format: `YYNNNN` where YY = enrollmentYear % 100, NNNN zero-padded 4 digits. */
export function formatStudentNo(enrollmentYear: number, seq: number): string {
  const yy = String(enrollmentYear % 100).padStart(2, "0");
  const nnnn = String(seq).padStart(4, "0");
  return `${yy}${nnnn}`;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Manually sanity-check `calculateGrade` in a Node REPL**

```bash
pnpm --filter @yanlu/api exec node -e '
const { calculateGrade } = require("./src/modules/students/utils/grade.ts");
' 2>&1 | head -5
```

(The above will fail because Node cannot require TS directly — this is expected. Instead, eyeball-verify by reading the function: 2022/2026/2026-07 → 已毕业, 2023/2027/2026-04 → 大三, 2026/2030/2026-04 → null, 2026/2030/2026-09 → 大一. We'll end-to-end verify via the list endpoint in Task 7.)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/students/utils/grade.ts
git commit -m "feat(phase-2)(api): add grade calculation helpers (TS + SQL CASE)"
```

---

## Task 6: Students DTOs + shared types

**Files:**
- Create: `apps/api/src/modules/students/students.types.ts`
- Create: `apps/api/src/modules/students/dto/create-student.dto.ts`
- Create: `apps/api/src/modules/students/dto/update-student.dto.ts`
- Create: `apps/api/src/modules/students/dto/query-students.dto.ts`
- Create: `apps/api/src/modules/students/dto/import.dto.ts`

- [ ] **Step 1: Create `students.types.ts`**

```ts
// apps/api/src/modules/students/students.types.ts
import type { Student } from "@prisma/client";

export type StudentListItem = Pick<
  Student,
  | "id"
  | "studentNo"
  | "name"
  | "gender"
  | "school"
  | "major"
  | "enrollmentYear"
  | "graduationYear"
  | "remainingPublicCredits"
  | "remainingPrivateCredits"
  | "serviceStatus"
  | "servicePlatform"
  | "counselorJobNo"
  | "plannerJobNo"
> & {
  grade: string | null;
};

export type StudentListResponse = {
  items: StudentListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type StudentDetail = Student & {
  grade: string | null;
  relatedCourseCategories: string[];
};

export type ImportError = { row: number; field: string; message: string };

export type ImportReport = {
  totalRows: number;
  validRows: number;
  errors: ImportError[];
};

export type ImportCommitResult = { created: number; errors: ImportError[] };
```

- [ ] **Step 2: Create `dto/create-student.dto.ts`**

```ts
// apps/api/src/modules/students/dto/create-student.dto.ts
import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsDecimal,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  GENDER,
  type Gender,
  SERVICE_PLATFORM,
  type ServicePlatform,
  SERVICE_STATUS,
  type ServiceStatus,
  STUDENT_SOURCE,
  type StudentSource,
} from "../../../common/dictionaries";

export class CreateStudentDto {
  @IsString()
  @MaxLength(50)
  name!: string;

  @IsIn(GENDER)
  gender!: Gender;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  enrollmentYear!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  graduationYear!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  school?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  major?: string;

  @IsOptional()
  @IsString()
  counselorJobNo?: string;

  @IsOptional()
  @IsString()
  plannerJobNo?: string;

  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsIn(SERVICE_PLATFORM)
  servicePlatform!: ServicePlatform;

  @IsIn(STUDENT_SOURCE)
  source!: StudentSource;

  @IsIn(SERVICE_STATUS)
  serviceStatus!: ServiceStatus;

  @IsOptional()
  @IsDecimal({ decimal_digits: "0,2" })
  totalPublicCredits?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: "0,2" })
  totalPrivateCredits?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: "0,2" })
  remainingPublicCredits?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: "0,2" })
  remainingPrivateCredits?: string;

  @IsOptional()
  @IsString()
  serviceChecklistUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  serviceChecklistKeys?: string[];

  @IsOptional()
  @IsString()
  overallPlanUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  overallPlanText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  policyKeys?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  policyText?: string;

  @IsOptional()
  @IsObject()
  detailNotes?: unknown;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  scheduleKeys?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  transcriptKeys?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  attachmentKeys?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;
}
```

- [ ] **Step 3: Create `dto/update-student.dto.ts`**

```ts
// apps/api/src/modules/students/dto/update-student.dto.ts
import { OmitType, PartialType } from "@nestjs/mapped-types";
import { CreateStudentDto } from "./create-student.dto";

/**
 * Inherit all CreateStudentDto shape checks, drop enrollmentYear (spec §9
 * locks it after creation), and make every remaining field optional.
 */
export class UpdateStudentDto extends PartialType(
  OmitType(CreateStudentDto, ["enrollmentYear"] as const),
) {}
```

If `@nestjs/mapped-types` isn't already in `apps/api/package.json`, add it:

```bash
pnpm --filter @yanlu/api add @nestjs/mapped-types
```

(It ships as a peer of NestJS 10 and may already be installed; the `pnpm add` is a no-op in that case.)

- [ ] **Step 4: Create `dto/query-students.dto.ts`**

```ts
// apps/api/src/modules/students/dto/query-students.dto.ts
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import {
  GRADE_VALUES,
  type GradeValue,
  SERVICE_PLATFORM,
  type ServicePlatform,
  STUDENT_SOURCE,
  type StudentSource,
} from "../../../common/dictionaries";

export class QueryStudentsDto {
  /** Simple search (name | studentNo | phone ILIKE) */
  @IsOptional()
  @IsString()
  keyword?: string;

  /** Advanced search fields (spec §7) */
  @IsOptional()
  @IsString()
  studentNo?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(GRADE_VALUES)
  grade?: GradeValue;

  @IsOptional()
  @IsString()
  major?: string;

  @IsOptional()
  @IsIn(STUDENT_SOURCE)
  source?: StudentSource;

  @IsOptional()
  @IsIn(SERVICE_PLATFORM)
  servicePlatform?: ServicePlatform;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}
```

- [ ] **Step 5: Create `dto/import.dto.ts`**

```ts
// apps/api/src/modules/students/dto/import.dto.ts
import { IsString } from "class-validator";

export class ImportFileKeyDto {
  @IsString()
  fileKey!: string;
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/students/students.types.ts apps/api/src/modules/students/dto/
git commit -m "feat(phase-2)(api): add students DTOs and shared types"
```

---

## Task 7: `StudentsService` — list, findOne, create, update

**Files:**
- Create: `apps/api/src/modules/students/students.service.ts`

- [ ] **Step 1: Create the service**

```ts
// apps/api/src/modules/students/students.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Student } from "@prisma/client";
import { IdSequenceService } from "../../common/id-sequence/id-sequence.service";
import {
  SERVICE_STATUS_SORT,
  type ServiceStatus,
} from "../../common/dictionaries";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateStudentDto } from "./dto/create-student.dto";
import { QueryStudentsDto } from "./dto/query-students.dto";
import { UpdateStudentDto } from "./dto/update-student.dto";
import type {
  StudentDetail,
  StudentListItem,
  StudentListResponse,
} from "./students.types";
import {
  GRADE_SORT_SQL,
  GRADE_TEXT_CASE_SQL,
  calculateGrade,
  formatStudentNo,
} from "./utils/grade";

const DEFAULT_PAGE_SIZE = 50;

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idSequence: IdSequenceService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async list(query: QueryStudentsDto): Promise<StudentListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const conditions: Prisma.Sql[] = [];
    if (query.keyword && query.keyword.trim().length > 0) {
      const kw = `%${query.keyword.trim()}%`;
      conditions.push(
        Prisma.sql`("name" ILIKE ${kw} OR "studentNo" ILIKE ${kw} OR "phone" ILIKE ${kw})`,
      );
    }
    if (query.studentNo) {
      conditions.push(Prisma.sql`"studentNo" ILIKE ${`%${query.studentNo}%`}`);
    }
    if (query.name) {
      conditions.push(Prisma.sql`"name" ILIKE ${`%${query.name}%`}`);
    }
    if (query.major) {
      conditions.push(Prisma.sql`"major" ILIKE ${`%${query.major}%`}`);
    }
    if (query.source) {
      conditions.push(Prisma.sql`"source" = ${query.source}`);
    }
    if (query.servicePlatform) {
      conditions.push(Prisma.sql`"servicePlatform" = ${query.servicePlatform}`);
    }
    // grade is applied AFTER the CTE below so it can compare the computed text
    const preGradeWhere =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
        : Prisma.empty;
    const gradeWhere = query.grade
      ? Prisma.sql`WHERE grade_text = ${query.grade}`
      : Prisma.empty;

    const statusOrder = Prisma.sql`CASE "serviceStatus"::text
      ${Prisma.join(
        (Object.entries(SERVICE_STATUS_SORT) as [ServiceStatus, number][]).map(
          ([k, v]) => Prisma.sql`WHEN ${k} THEN ${v}`,
        ),
        " ",
      )}
      ELSE 999 END`;

    const itemsQuery = Prisma.sql`
      WITH s AS (
        SELECT *, ${Prisma.raw(GRADE_TEXT_CASE_SQL)} AS grade_text,
               ${Prisma.raw(GRADE_SORT_SQL)} AS grade_rank
        FROM "Student"
        ${preGradeWhere}
      )
      SELECT "id", "studentNo", "name", "gender", "school", "major",
             "enrollmentYear", "graduationYear",
             "remainingPublicCredits", "remainingPrivateCredits",
             "serviceStatus", "servicePlatform",
             "counselorJobNo", "plannerJobNo",
             grade_text AS grade
      FROM s
      ${gradeWhere}
      ORDER BY ${statusOrder} ASC, grade_rank ASC, "name" ASC
      LIMIT ${pageSize} OFFSET ${skip}
    `;

    const countQuery = Prisma.sql`
      WITH s AS (
        SELECT "id", ${Prisma.raw(GRADE_TEXT_CASE_SQL)} AS grade_text
        FROM "Student"
        ${preGradeWhere}
      )
      SELECT COUNT(*)::int AS count FROM s ${gradeWhere}
    `;

    const [rawItems, countRows] = await this.prisma.$transaction([
      this.prisma.$queryRaw<StudentListItem[]>(itemsQuery),
      this.prisma.$queryRaw<{ count: number }[]>(countQuery),
    ]);

    const items: StudentListItem[] = rawItems.map((r) => ({
      ...r,
      remainingPublicCredits: r.remainingPublicCredits ?? null,
      remainingPrivateCredits: r.remainingPrivateCredits ?? null,
    }));

    return {
      items,
      total: countRows[0]?.count ?? 0,
      page,
      pageSize,
    };
  }

  async findOne(id: string): Promise<StudentDetail> {
    const s = await this.prisma.student.findUnique({ where: { id } });
    if (!s) throw new NotFoundException("学生不存在");
    return {
      ...s,
      grade: calculateGrade(s.enrollmentYear, s.graduationYear),
      relatedCourseCategories: [],
    };
  }

  async create(dto: CreateStudentDto, operatorId: string): Promise<Student> {
    const seq = await this.idSequence.allocate("student", dto.enrollmentYear);
    const studentNo = formatStudentNo(dto.enrollmentYear, seq);
    const created = await this.prisma.student.create({
      data: { ...dto, studentNo, detailNotes: (dto.detailNotes ?? null) as Prisma.InputJsonValue },
    });
    await this.auditLogs.record({
      operatorId,
      action: "student.create",
      targetType: "student",
      targetId: created.id,
      before: null,
      after: created as unknown as Record<string, unknown>,
    });
    return created;
  }

  async update(
    id: string,
    dto: UpdateStudentDto,
    operatorId: string,
  ): Promise<Student> {
    const before = await this.prisma.student.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("学生不存在");

    // UpdateStudentDto already omits enrollmentYear; belt-and-braces strip
    // anything the caller might have snuck in via the raw payload.
    const payload = { ...dto };
    delete (payload as Record<string, unknown>).id;
    delete (payload as Record<string, unknown>).studentNo;
    delete (payload as Record<string, unknown>).enrollmentYear;
    delete (payload as Record<string, unknown>).createdAt;
    delete (payload as Record<string, unknown>).updatedAt;

    const after = await this.prisma.student.update({
      where: { id },
      data: payload as Prisma.StudentUpdateInput,
    });
    await this.auditLogs.record({
      operatorId,
      action: "student.update",
      targetType: "student",
      targetId: id,
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
    return after;
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/students/students.service.ts
git commit -m "feat(phase-2)(api): StudentsService list / findOne / create / update"
```

---

## Task 8: `StudentsService.remove` with Enrollment guard

**Files:**
- Modify: `apps/api/src/modules/students/students.service.ts`

- [ ] **Step 1: Extend the `@nestjs/common` import**

At the top of `apps/api/src/modules/students/students.service.ts`, change:

```ts
import { Injectable, NotFoundException } from "@nestjs/common";
```

to:

```ts
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
```

- [ ] **Step 2: Add the `remove` method**

At the bottom of the `StudentsService` class (after `update`), add:

```ts
  async remove(id: string, operatorId: string): Promise<void> {
    const before = await this.prisma.student.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("学生不存在");

    const enrolled = await this.prisma.enrollment.count({
      where: { studentId: id },
    });
    if (enrolled > 0) {
      throw new ConflictException(
        "该学生已有选课记录，不可删除。请将服务状态改为服务完成或取消/终止后保留档案。",
      );
    }

    await this.prisma.student.delete({ where: { id } });
    await this.auditLogs.record({
      operatorId,
      action: "student.delete",
      targetType: "student",
      targetId: id,
      before: before as unknown as Record<string, unknown>,
      after: null,
    });
  }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/students/students.service.ts
git commit -m "feat(phase-2)(api): StudentsService.remove with Enrollment guard"
```

---

## Task 9: `StudentsController` — CRUD endpoints

**Files:**
- Create: `apps/api/src/modules/students/students.controller.ts`

- [ ] **Step 1: Create the controller**

```ts
// apps/api/src/modules/students/students.controller.ts
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
  Query,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { CreateStudentDto } from "./dto/create-student.dto";
import { QueryStudentsDto } from "./dto/query-students.dto";
import { UpdateStudentDto } from "./dto/update-student.dto";
import { StudentsService } from "./students.service";

@Controller("students")
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  list(@Query() query: QueryStudentsDto) {
    return this.students.list(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.students.findOne(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateStudentDto, @CurrentUser() operator: AuthUser) {
    return this.students.create(dto, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Put(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.students.update(id, dto, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string, @CurrentUser() operator: AuthUser) {
    await this.students.remove(id, operator.id);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/students/students.controller.ts
git commit -m "feat(phase-2)(api): StudentsController CRUD endpoints"
```

---

## Task 10: `StudentsImportService` — template, dry-run, commit

**Files:**
- Create: `apps/api/src/modules/students/students-import.service.ts`

- [ ] **Step 1: Create the service**

```ts
// apps/api/src/modules/students/students-import.service.ts
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { IdSequenceService } from "../../common/id-sequence/id-sequence.service";
import {
  GENDER,
  SERVICE_PLATFORM,
  SERVICE_STATUS_BY_LABEL,
  STUDENT_SOURCE,
} from "../../common/dictionaries";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import type { ImportError, ImportReport, ImportCommitResult } from "./students.types";
import { formatStudentNo } from "./utils/grade";

/** Column order must match `generateTemplate` below. */
const COLUMNS = [
  "姓名",
  "性别",
  "入学年份",
  "毕业年份",
  "学校",
  "专业",
  "学管老师工号",
  "规划师工号",
  "服务平台",
  "学生来源",
  "服务状态",
  "电话",
  "邮箱",
  "公共课总课时",
  "1v1总课时",
  "公共课剩余",
  "1v1剩余",
  "备注",
] as const;

type ParsedRow = {
  row: number; // 1-based row in spreadsheet (header = row 1)
  name: string;
  gender: string;
  enrollmentYear: number;
  graduationYear: number;
  school?: string;
  major?: string;
  counselorJobNo?: string;
  plannerJobNo?: string;
  servicePlatform: string;
  source: string;
  serviceStatusLabel: string;
  phone?: string;
  email?: string;
  totalPublicCredits?: string;
  totalPrivateCredits?: string;
  remainingPublicCredits?: string;
  remainingPrivateCredits?: string;
  note?: string;
};

@Injectable()
export class StudentsImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly idSequence: IdSequenceService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async generateTemplate(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("学生导入");
    ws.columns = COLUMNS.map((header) => ({ header, key: header, width: 16 }));
    ws.getRow(1).font = { bold: true };
    // One example row demonstrating valid values; the user replaces or deletes it before upload.
    ws.addRow([
      "张三",
      "男",
      2023,
      2027,
      "清华大学",
      "计算机科学与技术",
      "",
      "",
      "研录保研",
      "转介绍",
      "未开始",
      "13800138000",
      "zhangsan@example.com",
      "",
      "",
      "",
      "",
      "",
    ]);
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async fetchFile(fileKey: string): Promise<Buffer> {
    const url = await this.storage.signDownload(fileKey, 60);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`读取导入文件失败: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  private async parse(buffer: Buffer): Promise<{ rows: ParsedRow[]; headerErrors: ImportError[] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    const headerErrors: ImportError[] = [];
    if (!ws) {
      return { rows: [], headerErrors: [{ row: 0, field: "sheet", message: "文件中没有工作表" }] };
    }

    const headerRow = ws.getRow(1);
    const headerValues = (headerRow.values as (string | undefined)[]).slice(1); // drop leading undefined
    for (let i = 0; i < COLUMNS.length; i++) {
      if ((headerValues[i] ?? "").toString().trim() !== COLUMNS[i]) {
        headerErrors.push({
          row: 1,
          field: `header[${i}]`,
          message: `列标题不匹配：期望 "${COLUMNS[i]}"，实际 "${headerValues[i] ?? ""}"`,
        });
      }
    }

    const rows: ParsedRow[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const v = (i: number) => {
        const cell = row.getCell(i + 1).value;
        if (cell == null) return undefined;
        if (typeof cell === "object" && "text" in cell) return String((cell as { text: unknown }).text ?? "").trim();
        return String(cell).trim();
      };

      rows.push({
        row: rowNumber,
        name: v(0) ?? "",
        gender: v(1) ?? "",
        enrollmentYear: Number(v(2)),
        graduationYear: Number(v(3)),
        school: v(4),
        major: v(5),
        counselorJobNo: v(6),
        plannerJobNo: v(7),
        servicePlatform: v(8) ?? "",
        source: v(9) ?? "",
        serviceStatusLabel: v(10) ?? "",
        phone: v(11),
        email: v(12),
        totalPublicCredits: v(13),
        totalPrivateCredits: v(14),
        remainingPublicCredits: v(15),
        remainingPrivateCredits: v(16),
        note: v(17),
      });
    });
    return { rows, headerErrors };
  }

  private async validateRow(r: ParsedRow): Promise<ImportError[]> {
    const errs: ImportError[] = [];
    const push = (field: string, message: string) => errs.push({ row: r.row, field, message });

    if (!r.name) push("姓名", "必填");
    if (!GENDER.includes(r.gender as typeof GENDER[number])) push("性别", `非法值 "${r.gender}"`);

    if (!Number.isInteger(r.enrollmentYear) || r.enrollmentYear < 2000 || r.enrollmentYear > 2100) {
      push("入学年份", `非法值 "${r.enrollmentYear}"`);
    }
    if (!Number.isInteger(r.graduationYear) || r.graduationYear < 2000 || r.graduationYear > 2100) {
      push("毕业年份", `非法值 "${r.graduationYear}"`);
    } else if (r.graduationYear < r.enrollmentYear) {
      push("毕业年份", `必须不早于入学年份 ${r.enrollmentYear}`);
    } else if (r.graduationYear > r.enrollmentYear + 10) {
      push("毕业年份", `学制过长（>10 年）：${r.enrollmentYear}-${r.graduationYear}`);
    }

    if (!SERVICE_PLATFORM.includes(r.servicePlatform as typeof SERVICE_PLATFORM[number])) {
      push("服务平台", `非法值 "${r.servicePlatform}"`);
    }
    if (!STUDENT_SOURCE.includes(r.source as typeof STUDENT_SOURCE[number])) {
      push("学生来源", `非法值 "${r.source}"`);
    }
    if (!SERVICE_STATUS_BY_LABEL[r.serviceStatusLabel]) {
      push(
        "服务状态",
        `非法值 "${r.serviceStatusLabel}"；允许值：${Object.keys(SERVICE_STATUS_BY_LABEL).join(" / ")}`,
      );
    }

    if (r.phone && !/^1[3-9]\d{9}$/.test(r.phone)) push("电话", `格式非法：${r.phone}`);
    if (r.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) push("邮箱", `格式非法：${r.email}`);

    const jobNos = [r.counselorJobNo, r.plannerJobNo].filter(Boolean) as string[];
    if (jobNos.length > 0) {
      const found = await this.prisma.employee.findMany({
        where: { jobNo: { in: jobNos } },
        select: { jobNo: true },
      });
      const foundSet = new Set(found.map((f) => f.jobNo));
      if (r.counselorJobNo && !foundSet.has(r.counselorJobNo)) {
        push("学管老师工号", `员工不存在：${r.counselorJobNo}`);
      }
      if (r.plannerJobNo && !foundSet.has(r.plannerJobNo)) {
        push("规划师工号", `员工不存在：${r.plannerJobNo}`);
      }
    }

    const num = (s?: string) => (s == null || s === "" ? undefined : Number(s));
    const checkNonNeg = (label: string, val?: number) => {
      if (val !== undefined && (!Number.isFinite(val) || val < 0)) {
        push(label, `必须是非负数：${val}`);
      }
    };
    const tpub = num(r.totalPublicCredits);
    const tprv = num(r.totalPrivateCredits);
    const rpub = num(r.remainingPublicCredits);
    const rprv = num(r.remainingPrivateCredits);
    checkNonNeg("公共课总课时", tpub);
    checkNonNeg("1v1总课时", tprv);
    checkNonNeg("公共课剩余", rpub);
    checkNonNeg("1v1剩余", rprv);
    if (tpub !== undefined && rpub !== undefined && rpub > tpub) {
      push("公共课剩余", `剩余课时（${rpub}）大于总课时（${tpub}）`);
    }
    if (tprv !== undefined && rprv !== undefined && rprv > tprv) {
      push("1v1剩余", `剩余课时（${rprv}）大于总课时（${tprv}）`);
    }

    return errs;
  }

  async dryRun(fileKey: string): Promise<ImportReport> {
    const buf = await this.fetchFile(fileKey);
    const { rows, headerErrors } = await this.parse(buf);
    if (headerErrors.length > 0) {
      return { totalRows: rows.length, validRows: 0, errors: headerErrors };
    }
    const errors: ImportError[] = [];
    for (const r of rows) errors.push(...(await this.validateRow(r)));
    const badRows = new Set(errors.map((e) => e.row));
    const validRows = rows.filter((r) => !badRows.has(r.row)).length;
    return { totalRows: rows.length, validRows, errors };
  }

  async commit(fileKey: string, operatorId: string): Promise<ImportCommitResult> {
    const buf = await this.fetchFile(fileKey);
    const { rows, headerErrors } = await this.parse(buf);
    if (headerErrors.length > 0) {
      return { created: 0, errors: headerErrors };
    }
    const errors: ImportError[] = [];
    for (const r of rows) errors.push(...(await this.validateRow(r)));
    if (errors.length > 0) {
      return { created: 0, errors };
    }

    // Group rows by enrollmentYear and allocate sequence blocks.
    const byYear = new Map<number, ParsedRow[]>();
    for (const r of rows) {
      const arr = byYear.get(r.enrollmentYear) ?? [];
      arr.push(r);
      byYear.set(r.enrollmentYear, arr);
    }
    const rowToSeq = new Map<number, number>();
    for (const [year, group] of byYear.entries()) {
      const seqs = await this.idSequence.allocateBatch("student", year, group.length);
      group.forEach((r, idx) => rowToSeq.set(r.row, seqs[idx]));
    }

    const dataRows: Prisma.StudentCreateManyInput[] = rows.map((r) => {
      const seq = rowToSeq.get(r.row)!;
      const studentNo = formatStudentNo(r.enrollmentYear, seq);
      return {
        studentNo,
        name: r.name,
        gender: r.gender,
        enrollmentYear: r.enrollmentYear,
        graduationYear: r.graduationYear,
        school: r.school || null,
        major: r.major || null,
        counselorJobNo: r.counselorJobNo || null,
        plannerJobNo: r.plannerJobNo || null,
        phone: r.phone || null,
        email: r.email || null,
        servicePlatform: r.servicePlatform,
        source: r.source,
        serviceStatus: SERVICE_STATUS_BY_LABEL[r.serviceStatusLabel]!,
        totalPublicCredits: r.totalPublicCredits ? new Prisma.Decimal(r.totalPublicCredits) : null,
        totalPrivateCredits: r.totalPrivateCredits ? new Prisma.Decimal(r.totalPrivateCredits) : null,
        remainingPublicCredits: r.remainingPublicCredits ? new Prisma.Decimal(r.remainingPublicCredits) : null,
        remainingPrivateCredits: r.remainingPrivateCredits ? new Prisma.Decimal(r.remainingPrivateCredits) : null,
        note: r.note || null,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.student.createMany({ data: dataRows });
    });

    // Audit per-row AFTER the transaction (same trade-off as Phase 1A); fetch
    // back created rows by studentNo to include ids in the audit payload.
    const createdStudents = await this.prisma.student.findMany({
      where: { studentNo: { in: dataRows.map((d) => d.studentNo) } },
    });
    for (const s of createdStudents) {
      await this.auditLogs.record({
        operatorId,
        action: "student.create",
        targetType: "student",
        targetId: s.id,
        before: null,
        after: { ...s, __importBatchKey: fileKey } as unknown as Record<string, unknown>,
      });
    }

    return { created: dataRows.length, errors: [] };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

If TS complains about `fetch` not existing, confirm `apps/api/tsconfig.json` has `"lib": ["ES2022", "DOM"]` (Node 18+ provides global fetch; Phase 1A landed this — no change expected).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/students/students-import.service.ts
git commit -m "feat(phase-2)(api): StudentsImportService (template + dryRun + commit)"
```

---

## Task 11: Wire import endpoints + register `StudentsModule`

**Files:**
- Modify: `apps/api/src/modules/students/students.controller.ts`
- Create: `apps/api/src/modules/students/students.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Add import endpoints to the controller**

Open `apps/api/src/modules/students/students.controller.ts`. Add import-related imports at the top (alongside existing imports):

```ts
import { Res } from "@nestjs/common";
import type { Response } from "express";
import { ImportFileKeyDto } from "./dto/import.dto";
import { StudentsImportService } from "./students-import.service";
```

Update the class constructor:

```ts
  constructor(
    private readonly students: StudentsService,
    private readonly imports: StudentsImportService,
  ) {}
```

Append these three methods immediately after `remove`:

```ts
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get("import/template")
  async downloadTemplate(@Res() res: Response) {
    try {
      const buf = await this.imports.generateTemplate();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="student-import-template.xlsx"',
      );
      res.send(buf);
    } catch (err) {
      res.status(500).json({ message: "模板生成失败" });
    }
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("import/dry-run")
  importDryRun(@Body() dto: ImportFileKeyDto) {
    return this.imports.dryRun(dto.fileKey);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("import/commit")
  importCommit(
    @Body() dto: ImportFileKeyDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.imports.commit(dto.fileKey, operator.id);
  }
```

- [ ] **Step 2: Create `students.module.ts`**

```ts
// apps/api/src/modules/students/students.module.ts
import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { StudentsController } from "./students.controller";
import { StudentsImportService } from "./students-import.service";
import { StudentsService } from "./students.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentsImportService],
})
export class StudentsModule {}
```

- [ ] **Step 3: Register in the root module**

Open `apps/api/src/app.module.ts`. Add the import at the top:

```ts
import { StudentsModule } from "./modules/students/students.module";
```

Add `StudentsModule` to the `imports` array (after `EmployeesModule`).

- [ ] **Step 4: Verify TypeScript compiles and server boots**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
pnpm dev:api &
sleep 5
curl -s http://localhost:3000/api/health
```

Expected: health endpoint returns `{"status":"ok"}`. If the server logs a Nest bootstrap error about missing providers, confirm `StudentsImportService` is in the `providers` array and `StorageModule` / `IdSequenceModule` are global (they are, from Phase 1A).

Stop the dev server (Ctrl-C) before the next step.

- [ ] **Step 5: Smoke-test an anonymous GET**

```bash
pnpm dev:api &
sleep 5
curl -s -i http://localhost:3000/api/students | head -5
```

Expected: `HTTP/1.1 401 Unauthorized` (Phase 0 JWT guard is global). Stop the server.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/students/students.controller.ts apps/api/src/modules/students/students.module.ts apps/api/src/app.module.ts
git commit -m "feat(phase-2)(api): wire students import endpoints and register StudentsModule"
```

---

## Task 12: Frontend dictionaries mirror

**Files:**
- Modify: `apps/web/src/constants/dictionaries.ts`

- [ ] **Step 1: Append the Phase 2 exports**

Append the following block at the end of `apps/web/src/constants/dictionaries.ts`, below existing Phase 1A exports:

```ts
// ---------------------------------------------------------------------------
// Phase 2: Student dictionaries (mirror of apps/api/src/common/dictionaries.ts)
// ---------------------------------------------------------------------------

export const SERVICE_STATUS = [
  "NOT_STARTED",
  "IN_SERVICE",
  "PAUSED",
  "TERMINATED",
  "COMPLETED",
] as const;
export type ServiceStatus = (typeof SERVICE_STATUS)[number];

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  NOT_STARTED: "未开始",
  IN_SERVICE: "正常服务中",
  PAUSED: "服务暂缓",
  TERMINATED: "取消或终止",
  COMPLETED: "服务完成",
};

export const SERVICE_STATUS_COLORS: Record<ServiceStatus, string> = {
  NOT_STARTED: "default",
  IN_SERVICE: "success",
  PAUSED: "warning",
  TERMINATED: "error",
  COMPLETED: "blue",
};

export const SERVICE_STATUS_OPTIONS = SERVICE_STATUS.map((code) => ({
  value: code,
  label: SERVICE_STATUS_LABELS[code],
}));

export const SERVICE_PLATFORM = ["研录保研", "研录考研", "高途", "其他"] as const;
export type ServicePlatform = (typeof SERVICE_PLATFORM)[number];
export const SERVICE_PLATFORM_OPTIONS = SERVICE_PLATFORM.map((v) => ({ value: v, label: v }));

export const STUDENT_SOURCE = [
  "自有流量",
  "研录考研",
  "高途",
  "转介绍",
  "其他",
] as const;
export type StudentSource = (typeof STUDENT_SOURCE)[number];
export const STUDENT_SOURCE_OPTIONS = STUDENT_SOURCE.map((v) => ({ value: v, label: v }));

export const GRADE_VALUES = [
  "大一",
  "大二",
  "大三",
  "大四",
  "大五",
  "已毕业",
] as const;
export type GradeValue = (typeof GRADE_VALUES)[number];
export const GRADE_OPTIONS = GRADE_VALUES.map((v) => ({ value: v, label: v }));
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/constants/dictionaries.ts
git commit -m "feat(phase-2)(web): mirror student dictionaries on the frontend"
```

---

## Task 13: Frontend services — `students.ts` + extend `employees.ts`

**Files:**
- Create: `apps/web/src/services/students.ts`
- Modify: `apps/web/src/services/employees.ts`

- [ ] **Step 1: Add `findByJobNo` / `listByJobNos` to `employees.ts`**

Open `apps/web/src/services/employees.ts`. Inside the `employeesApi` object, append two helpers (reuse whatever import / types the file already exposes for list responses):

```ts
  findByJobNo: async (jobNo: string) => {
    const resp = await employeesApi.list({ jobNo, pageSize: 1 });
    return resp.items[0] ?? null;
  },

  listByJobNos: async (jobNos: string[]) => {
    if (jobNos.length === 0) return [];
    const resp = await employeesApi.list({
      jobNo: jobNos.join(","),
      pageSize: jobNos.length,
    });
    return resp.items;
  },
```

If the existing `EmployeeQueryParams` type does not include `jobNo`, add:

```ts
export type EmployeeQueryParams = {
  keyword?: string;
  employmentStatus?: string;   // comma-separated or single
  jobNo?: string;              // comma-separated or single
  page?: number;
  pageSize?: number;
};
```

(Replace the existing type definition rather than adding a second one.)

- [ ] **Step 2: Create `services/students.ts`**

```ts
// apps/web/src/services/students.ts
import { api, downloadAuthed } from "./http";

export type StudentListItem = {
  id: string;
  studentNo: string;
  name: string;
  gender: string;
  school: string | null;
  major: string | null;
  enrollmentYear: number;
  graduationYear: number;
  counselorJobNo: string | null;
  plannerJobNo: string | null;
  remainingPublicCredits: string | null;
  remainingPrivateCredits: string | null;
  serviceStatus:
    | "NOT_STARTED"
    | "IN_SERVICE"
    | "PAUSED"
    | "TERMINATED"
    | "COMPLETED";
  servicePlatform: string;
  grade: string | null;
};

export type StudentListResponse = {
  items: StudentListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type StudentDetail = StudentListItem & {
  phone: string | null;
  email: string | null;
  source: string;
  totalPublicCredits: string | null;
  totalPrivateCredits: string | null;
  serviceChecklistUrl: string | null;
  serviceChecklistKeys: string[];
  overallPlanUrl: string | null;
  overallPlanText: string | null;
  policyKeys: string[];
  policyText: string | null;
  detailNotes: unknown;
  scheduleKeys: string[];
  transcriptKeys: string[];
  attachmentKeys: string[];
  note: string | null;
  createdAt: string;
  updatedAt: string;
  relatedCourseCategories: string[];
};

export type StudentQueryParams = {
  keyword?: string;
  studentNo?: string;
  name?: string;
  grade?: string;
  major?: string;
  source?: string;
  servicePlatform?: string;
  page?: number;
  pageSize?: number;
};

export type CreateStudentBody = Omit<
  StudentDetail,
  | "id"
  | "studentNo"
  | "createdAt"
  | "updatedAt"
  | "grade"
  | "relatedCourseCategories"
>;

export type UpdateStudentBody = Partial<Omit<CreateStudentBody, "enrollmentYear">>;

export type ImportReport = {
  totalRows: number;
  validRows: number;
  errors: Array<{ row: number; field: string; message: string }>;
};

export type ImportCommitResult = {
  created: number;
  errors: ImportReport["errors"];
};

export const studentsApi = {
  list: (params: StudentQueryParams) =>
    api.get<StudentListResponse>("/students", { params }),
  detail: (id: string) => api.get<StudentDetail>(`/students/${id}`),
  create: (body: CreateStudentBody) => api.post<StudentDetail>("/students", body),
  update: (id: string, body: UpdateStudentBody) =>
    api.put<StudentDetail>(`/students/${id}`, body),
  remove: (id: string) => api.delete<void>(`/students/${id}`),
  importDryRun: (fileKey: string) =>
    api.post<ImportReport>("/students/import/dry-run", { fileKey }),
  importCommit: (fileKey: string) =>
    api.post<ImportCommitResult>("/students/import/commit", { fileKey }),
  downloadTemplate: () =>
    downloadAuthed("/students/import/template", "学生导入模板.xlsx"),
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

If TS complains about `api.get` signatures not accepting `{ params }`, open `apps/web/src/services/http.ts` to confirm the axios wrapper already supports that shape (Phase 1A landed it). If it doesn't, use `/students?${qs(params)}` with a `qs` helper — but the existing `employees.ts` should already demonstrate the pattern.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/services/students.ts apps/web/src/services/employees.ts
git commit -m "feat(phase-2)(web): students service wrappers and employees.findByJobNo helpers"
```

---

## Task 14: TanStack Query hooks

**Files:**
- Create: `apps/web/src/features/students/hooks/useStudents.ts`
- Create: `apps/web/src/features/students/hooks/useStudentMutations.ts`

- [ ] **Step 1: Create `useStudents.ts`**

```ts
// apps/web/src/features/students/hooks/useStudents.ts
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { studentsApi, type StudentQueryParams } from "../../../services/students";

export function useStudents(params: StudentQueryParams) {
  return useQuery({
    queryKey: ["students", params],
    queryFn: () => studentsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: ["students", "detail", id],
    queryFn: () => studentsApi.detail(id!),
    enabled: !!id,
  });
}
```

- [ ] **Step 2: Create `useStudentMutations.ts`**

```ts
// apps/web/src/features/students/hooks/useStudentMutations.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "antd";
import type { AxiosError } from "axios";
import {
  studentsApi,
  type CreateStudentBody,
  type UpdateStudentBody,
} from "../../../services/students";

type HttpError = AxiosError<{ message?: string }>;

export function useStudentMutations() {
  const qc = useQueryClient();
  const invalidateList = () =>
    qc.invalidateQueries({ queryKey: ["students"] });

  const createMutation = useMutation({
    mutationFn: (body: CreateStudentBody) => studentsApi.create(body),
    onSuccess: () => message.success("学生已添加"),
    onSettled: invalidateList,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateStudentBody }) =>
      studentsApi.update(id, body),
    onSuccess: () => message.success("学生信息已更新"),
    onSettled: invalidateList,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => studentsApi.remove(id),
    onSuccess: () => message.success("学生已删除"),
    onError: (err: HttpError) => {
      const msg = err.response?.data?.message;
      if (err.response?.status === 409 && msg) {
        message.error(msg);
      } else {
        message.error("删除失败，请稍后重试");
      }
    },
    onSettled: invalidateList,
  });

  return { createMutation, updateMutation, removeMutation };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/students/hooks/
git commit -m "feat(phase-2)(web): TanStack Query hooks for students"
```

---

## Task 15: Shared `<EmployeePicker>` component

**Files:**
- Create: `apps/web/src/components/EmployeePicker.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/components/EmployeePicker.tsx
import { Select, type SelectProps } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { employeesApi, type EmployeeListItem } from "../services/employees";

export interface EmployeePickerProps {
  value?: string | null;
  onChange?: (jobNo: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  excludeResigned?: boolean;
  allowClear?: boolean;
  style?: React.CSSProperties;
}

function formatOption(e: EmployeeListItem | { jobNo: string; name?: string; employmentStatus?: string }) {
  const suffix = e.employmentStatus === "RESIGNED" ? " (已离职)" : "";
  const name = "name" in e && e.name ? `- ${e.name}` : "";
  return { value: e.jobNo, label: `${e.jobNo} ${name}${suffix}`.trim() };
}

export function EmployeePicker({
  value,
  onChange,
  placeholder = "选择员工",
  disabled,
  excludeResigned = true,
  allowClear = true,
  style,
}: EmployeePickerProps) {
  const [options, setOptions] = useState<NonNullable<SelectProps["options"]>>([]);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef<number | undefined>(undefined);

  // Backfill current value on mount / value change
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!value) return;
      if (options.some((o) => o.value === value)) return;
      setLoading(true);
      try {
        const found = await employeesApi.findByJobNo(value);
        if (cancelled) return;
        setOptions((prev) => {
          const next = [...prev];
          if (found) next.unshift(formatOption(found));
          else next.unshift({ value, label: `${value} (未找到)` });
          return next;
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleSearch = (keyword: string) => {
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const resp = await employeesApi.list({
          keyword,
          pageSize: 20,
          ...(excludeResigned ? { employmentStatus: "FULL_TIME,PART_TIME" } : {}),
        });
        setOptions(resp.items.map(formatOption));
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const mergedOptions = useMemo(() => options, [options]);

  return (
    <Select
      value={value ?? undefined}
      onChange={(v) => onChange?.(v ?? null)}
      showSearch
      filterOption={false}
      onSearch={handleSearch}
      options={mergedOptions}
      loading={loading}
      placeholder={placeholder}
      disabled={disabled}
      allowClear={allowClear}
      style={{ width: "100%", ...style }}
      notFoundContent={loading ? "搜索中…" : "无匹配员工"}
    />
  );
}
```

If the `employees.ts` service does not export `EmployeeListItem`, open that file and add:

```ts
export type EmployeeListItem = {
  id: string;
  jobNo: string;
  name: string;
  gender: string;
  employmentStatus: "FULL_TIME" | "PART_TIME" | "RESIGNED";
  jobTitle: string;
  phone: string | null;
  source: string | null;
  servingFor: string[];
  hireDate: string | null;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/EmployeePicker.tsx apps/web/src/services/employees.ts
git commit -m "feat(phase-2)(web): shared EmployeePicker component (remote search + backfill)"
```

---

## Task 16: `StudentAttachmentUpload` + `DetailNotesEditor`

**Files:**
- Create: `apps/web/src/features/students/StudentAttachmentUpload.tsx`
- Create: `apps/web/src/features/students/DetailNotesEditor.tsx`

- [ ] **Step 1: Create `StudentAttachmentUpload.tsx`**

```tsx
// apps/web/src/features/students/StudentAttachmentUpload.tsx
import { InboxOutlined } from "@ant-design/icons";
import { Upload, message } from "antd";
import { storageApi, uploadToStorage } from "../../services/storage";

interface Props {
  value?: string[];
  onChange?: (keys: string[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
}

export function StudentAttachmentUpload({
  value = [],
  onChange,
  accept,
  multiple = true,
  disabled,
}: Props) {
  const fileList = value.map((key) => ({
    uid: key,
    name: key.split("/").pop() ?? key,
    status: "done" as const,
    url: undefined, // filled on-demand below via preview
  }));

  return (
    <Upload.Dragger
      fileList={fileList}
      multiple={multiple}
      disabled={disabled}
      accept={accept}
      customRequest={async ({ file, onSuccess, onError }) => {
        try {
          const key = await uploadToStorage("students/attachments", file as File);
          onChange?.([...value, key]);
          onSuccess?.(null, file as unknown as XMLHttpRequest);
        } catch (e) {
          message.error("文件上传失败");
          onError?.(e as Error);
        }
      }}
      onRemove={(file) => {
        onChange?.(value.filter((k) => k !== file.uid));
        return true;
      }}
      onPreview={async (file) => {
        try {
          const { url } = await storageApi.signDownload(file.uid);
          window.open(url, "_blank", "noopener");
        } catch {
          message.error("生成下载链接失败");
        }
      }}
    >
      <p className="ant-upload-drag-icon">
        <InboxOutlined />
      </p>
      <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
      <p className="ant-upload-hint">支持单次或批量上传</p>
    </Upload.Dragger>
  );
}
```

- [ ] **Step 2: Create `DetailNotesEditor.tsx`**

```tsx
// apps/web/src/features/students/DetailNotesEditor.tsx
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Input, Space } from "antd";

type Section = { title: string; content: string };

interface Props {
  value?: Section[] | null;
  onChange?: (sections: Section[]) => void;
  disabled?: boolean;
}

function normalize(raw: unknown): Section[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s) => ({
      title: typeof s.title === "string" ? s.title : "",
      content: typeof s.content === "string" ? s.content : "",
    }));
}

export function DetailNotesEditor({ value, onChange, disabled }: Props) {
  const sections = normalize(value);

  const emit = (next: Section[]) => onChange?.(next);

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      {sections.map((sec, idx) => (
        <div
          key={idx}
          style={{
            border: "1px solid #eee",
            borderRadius: 8,
            padding: 12,
            background: "#fafafa",
          }}
        >
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Input
              placeholder="段落标题（如：服务清单 / 总规划 / 加分政策）"
              value={sec.title}
              disabled={disabled}
              onChange={(e) => {
                const next = [...sections];
                next[idx] = { ...sec, title: e.target.value };
                emit(next);
              }}
              style={{ flex: 1, marginRight: 12 }}
            />
            <Button
              type="text"
              icon={<DeleteOutlined />}
              disabled={disabled}
              onClick={() => emit(sections.filter((_, i) => i !== idx))}
            />
          </Space>
          <Input.TextArea
            rows={4}
            placeholder="段落正文（可粘贴链接 / 文件路径说明）"
            value={sec.content}
            disabled={disabled}
            onChange={(e) => {
              const next = [...sections];
              next[idx] = { ...sec, content: e.target.value };
              emit(next);
            }}
            style={{ marginTop: 8 }}
          />
        </div>
      ))}
      <Button
        block
        icon={<PlusOutlined />}
        disabled={disabled}
        onClick={() => emit([...sections, { title: "", content: "" }])}
      >
        添加段落
      </Button>
    </Space>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/students/StudentAttachmentUpload.tsx apps/web/src/features/students/DetailNotesEditor.tsx
git commit -m "feat(phase-2)(web): StudentAttachmentUpload and DetailNotesEditor"
```

---

## Task 17: `StudentFormModal` (create / view / edit)

**Files:**
- Create: `apps/web/src/features/students/StudentFormModal.tsx`

- [ ] **Step 1: Create the modal**

```tsx
// apps/web/src/features/students/StudentFormModal.tsx
import {
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  type FormInstance,
} from "antd";
import { useEffect, useMemo } from "react";
import { EmployeePicker } from "../../components/EmployeePicker";
import {
  GRADE_OPTIONS,
  SERVICE_PLATFORM_OPTIONS,
  SERVICE_STATUS_OPTIONS,
  STUDENT_SOURCE_OPTIONS,
} from "../../constants/dictionaries";
import type { StudentDetail } from "../../services/students";
import { DetailNotesEditor } from "./DetailNotesEditor";
import { StudentAttachmentUpload } from "./StudentAttachmentUpload";
import { useStudentMutations } from "./hooks/useStudentMutations";

export type StudentFormMode = "create" | "view" | "edit";

interface Props {
  open: boolean;
  mode: StudentFormMode;
  initial: StudentDetail | null;
  onClose: () => void;
  onModeChange: (m: StudentFormMode) => void;
}

type FormValues = Record<string, unknown>;

function toFormValues(s: StudentDetail | null): FormValues {
  if (!s) {
    return { serviceStatus: "NOT_STARTED" };
  }
  return {
    ...s,
    detailNotes: Array.isArray(s.detailNotes) ? s.detailNotes : [],
  };
}

export function StudentFormModal({ open, mode, initial, onClose, onModeChange }: Props) {
  const [form] = Form.useForm<FormValues>();
  const { createMutation, updateMutation } = useStudentMutations();

  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue(toFormValues(initial));
    }
  }, [open, initial, form]);

  const disabled = mode === "view";

  const handleOk = async () => {
    const values = await form.validateFields();
    if (mode === "create") {
      await createMutation.mutateAsync(values as never);
    } else if (mode === "edit" && initial) {
      const { enrollmentYear: _ignored, ...body } = values;
      await updateMutation.mutateAsync({ id: initial.id, body: body as never });
    }
    onClose();
  };

  const title =
    mode === "create" ? "添加学生" : mode === "edit" ? "编辑学生" : "查看学生";

  const footer = useMemo(() => {
    if (mode === "view") {
      return [
        <a key="cancel" onClick={onClose} style={{ marginRight: 12 }}>
          取消
        </a>,
        <a key="edit" onClick={() => onModeChange("edit")}>
          编辑
        </a>,
      ];
    }
    return undefined; // default [Cancel, OK]
  }, [mode, onClose, onModeChange]);

  return (
    <Modal
      open={open}
      title={title}
      width={1040}
      onCancel={onClose}
      onOk={handleOk}
      okText="确定"
      cancelText="取消"
      footer={mode === "view" ? footer : undefined}
      confirmLoading={createMutation.isPending || updateMutation.isPending}
      styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
      destroyOnClose
    >
      <Form form={form} layout="vertical" disabled={disabled}>
        <SectionTitle>基础档案</SectionTitle>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="学号">
              <Input value={initial?.studentNo ?? "保存后生成"} disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="姓名" name="name" rules={[{ required: true, max: 50 }]}>
              <Input placeholder="请输入学生姓名" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="性别" name="gender" rules={[{ required: true }]}>
              <Select options={[{ value: "男", label: "男" }, { value: "女", label: "女" }]} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="电话" name="phone" rules={[{ pattern: /^1[3-9]\d{9}$/, message: "手机号格式不正确" }]}>
              <Input placeholder="11 位手机号" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="邮箱" name="email" rules={[{ type: "email" }]}>
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="当前年级">
              <Input value={initial?.grade ?? (mode === "create" ? "保存后自动计算" : "-")} disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="入学年份"
              name="enrollmentYear"
              rules={[{ required: true, type: "integer", min: 2000, max: 2100 }]}
              tooltip={mode !== "create" ? "入学年份创建后不可修改，如需修正请删除后重建" : undefined}
            >
              <InputNumber
                min={2000}
                max={2100}
                style={{ width: "100%" }}
                disabled={mode !== "create"}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="毕业年份"
              name="graduationYear"
              rules={[{ required: true, type: "integer", min: 2000, max: 2100 }]}
            >
              <InputNumber min={2000} max={2100} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="学校" name="school">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="专业" name="major">
              <Input />
            </Form.Item>
          </Col>
        </Row>

        <SectionTitle>服务归属</SectionTitle>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="学管老师" name="counselorJobNo">
              <EmployeePicker disabled={disabled} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="规划师" name="plannerJobNo">
              <EmployeePicker disabled={disabled} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="服务状态" name="serviceStatus" rules={[{ required: true }]}>
              <Select options={SERVICE_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="服务平台" name="servicePlatform" rules={[{ required: true }]}>
              <Select options={SERVICE_PLATFORM_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="学生来源" name="source" rules={[{ required: true }]}>
              <Select options={STUDENT_SOURCE_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>

        <SectionTitle>课时</SectionTitle>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="公共课总课时" name="totalPublicCredits">
              <InputNumber min={0} step={0.5} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="公共课剩余" name="remainingPublicCredits">
              <InputNumber min={0} step={0.5} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="1v1 总课时" name="totalPrivateCredits">
              <InputNumber min={0} step={0.5} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="1v1 剩余" name="remainingPrivateCredits">
              <InputNumber min={0} step={0.5} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
        </Row>

        <SectionTitle>服务字段</SectionTitle>
        <Form.Item label="服务清单链接" name="serviceChecklistUrl">
          <Input placeholder="可选" />
        </Form.Item>
        <Form.Item label="服务清单附件" name="serviceChecklistKeys">
          <StudentAttachmentUpload disabled={disabled} />
        </Form.Item>
        <Form.Item label="总规划链接" name="overallPlanUrl">
          <Input />
        </Form.Item>
        <Form.Item label="总规划说明" name="overallPlanText">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item label="加分政策附件" name="policyKeys">
          <StudentAttachmentUpload disabled={disabled} />
        </Form.Item>
        <Form.Item label="加分政策说明" name="policyText">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item label="本学期课表" name="scheduleKeys">
          <StudentAttachmentUpload disabled={disabled} />
        </Form.Item>
        <Form.Item label="成绩单" name="transcriptKeys">
          <StudentAttachmentUpload disabled={disabled} />
        </Form.Item>
        <Form.Item label="通用附件 / 图片" name="attachmentKeys">
          <StudentAttachmentUpload disabled={disabled} />
        </Form.Item>
        <Form.Item label="各类服务项详情" name="detailNotes">
          <DetailNotesEditor disabled={disabled} />
        </Form.Item>
        <Form.Item label="备注" name="note">
          <Input.TextArea rows={3} />
        </Form.Item>

        <SectionTitle>已上课程的二级课程类别</SectionTitle>
        <div className="related-course-categories-placeholder">
          待课程模块上线后自动同步
        </div>
      </Form>
    </Modal>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="student-detail-section-title">{children}</div>
  );
}
```

Note: the AntD `Form.Item` for `grade` is hard-coded read-only; AntD will not emit `enrollmentYear` when disabled in edit mode because `<InputNumber disabled>` still keeps the value. That's fine — the service-side `UpdateStudentDto` strips it anyway; we only hide it from the UI.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/students/StudentFormModal.tsx
git commit -m "feat(phase-2)(web): StudentFormModal (create / view / edit)"
```

---

## Task 18: `StudentDeleteConfirm` helper

**Files:**
- Create: `apps/web/src/features/students/StudentDeleteConfirm.tsx`

- [ ] **Step 1: Create the helper**

```tsx
// apps/web/src/features/students/StudentDeleteConfirm.tsx
import { ExclamationCircleFilled } from "@ant-design/icons";
import { Modal, theme } from "antd";

export function openStudentDeleteConfirm(opts: {
  studentName: string;
  studentNo: string;
  onConfirm: () => Promise<void> | void;
}) {
  const { token } = theme.getDesignToken();
  Modal.confirm({
    title: "确认删除该学生？",
    icon: <ExclamationCircleFilled style={{ color: token.colorError }} />,
    content: (
      <div>
        <p>
          即将删除：<b>{opts.studentNo} {opts.studentName}</b>
        </p>
        <p>
          删除操作不可恢复。若学生服务结束，建议改为 <b>服务完成</b> 或 <b>取消或终止</b> 状态保留档案。学号删除后不回收。
        </p>
      </div>
    ),
    okText: "确认删除",
    okButtonProps: { danger: true },
    cancelText: "取消",
    onOk: async () => opts.onConfirm(),
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/students/StudentDeleteConfirm.tsx
git commit -m "feat(phase-2)(web): StudentDeleteConfirm helper"
```

---

## Task 19: `StudentImportDrawer`

**Files:**
- Create: `apps/web/src/features/students/StudentImportDrawer.tsx`

- [ ] **Step 1: Create the drawer**

```tsx
// apps/web/src/features/students/StudentImportDrawer.tsx
import { DownloadOutlined, InboxOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Drawer,
  Space,
  Statistic,
  Table,
  Upload,
  message,
} from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { studentsApi, type ImportReport } from "../../services/students";
import { uploadToStorage } from "../../services/storage";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function StudentImportDrawer({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setFileKey(null);
    setReport(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleTemplate = async () => {
    try {
      await studentsApi.downloadTemplate();
    } catch {
      message.error("模板下载失败");
    }
  };

  const handleUpload = async (file: File) => {
    setLoading(true);
    try {
      const key = await uploadToStorage("students/import-batches", file);
      setFileKey(key);
      const r = await studentsApi.importDryRun(key);
      setReport(r);
    } catch {
      message.error("文件解析失败");
      reset();
    } finally {
      setLoading(false);
    }
    return false; // prevent AntD default upload
  };

  const handleCommit = async () => {
    if (!fileKey) return;
    setLoading(true);
    try {
      const result = await studentsApi.importCommit(fileKey);
      if (result.errors.length === 0) {
        message.success(`成功导入 ${result.created} 名学生`);
        qc.invalidateQueries({ queryKey: ["students"] });
        handleClose();
      } else {
        setReport((prev) =>
          prev
            ? { ...prev, errors: result.errors, validRows: 0 }
            : { totalRows: 0, validRows: 0, errors: result.errors },
        );
      }
    } catch {
      message.error("导入失败");
    } finally {
      setLoading(false);
    }
  };

  const canCommit = !!report && report.errors.length === 0 && report.validRows > 0;

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="从 Excel 导入学生"
      width={720}
      footer={
        <Space>
          <Button onClick={handleClose}>取消</Button>
          <Button type="primary" onClick={handleCommit} disabled={!canCommit} loading={loading}>
            确认导入
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Button icon={<DownloadOutlined />} onClick={handleTemplate}>
          下载导入模板
        </Button>
        <Upload.Dragger
          beforeUpload={(file) => handleUpload(file)}
          accept=".xlsx"
          showUploadList={false}
          disabled={loading}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽 .xlsx 文件上传</p>
          <p className="ant-upload-hint">上传后自动预校验</p>
        </Upload.Dragger>

        {report && (
          <>
            <Space size="large">
              <Statistic title="总行数" value={report.totalRows} />
              <Statistic title="有效行" value={report.validRows} />
              <Statistic title="错误行" value={report.errors.length} />
            </Space>
            {report.errors.length > 0 && (
              <Alert
                type="error"
                message="发现错误，请修正后重新上传"
                showIcon
              />
            )}
            <Table
              size="small"
              rowKey={(r) => `${r.row}-${r.field}`}
              dataSource={report.errors}
              pagination={{ pageSize: 10 }}
              columns={[
                { title: "行号", dataIndex: "row", width: 80 },
                { title: "字段", dataIndex: "field", width: 140 },
                { title: "错误信息", dataIndex: "message" },
              ]}
            />
          </>
        )}
      </Space>
    </Drawer>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/students/StudentImportDrawer.tsx
git commit -m "feat(phase-2)(web): StudentImportDrawer (template + dry-run + commit)"
```

---

## Task 20: `AdvancedSearchDrawer` + `ActiveFilterTags` (URL sync)

**Files:**
- Create: `apps/web/src/features/students/AdvancedSearchDrawer.tsx`
- Create: `apps/web/src/features/students/ActiveFilterTags.tsx`

- [ ] **Step 1: Create `AdvancedSearchDrawer.tsx`**

```tsx
// apps/web/src/features/students/AdvancedSearchDrawer.tsx
import { Button, Drawer, Form, Input, Select, Space } from "antd";
import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  GRADE_OPTIONS,
  SERVICE_PLATFORM_OPTIONS,
  STUDENT_SOURCE_OPTIONS,
} from "../../constants/dictionaries";

interface Props {
  open: boolean;
  onClose: () => void;
}

const FIELDS = [
  "studentNo",
  "name",
  "grade",
  "major",
  "source",
  "servicePlatform",
] as const;

type FieldKey = (typeof FIELDS)[number];
type Values = Partial<Record<FieldKey, string>>;

export function AdvancedSearchDrawer({ open, onClose }: Props) {
  const [params, setParams] = useSearchParams();
  const [form] = Form.useForm<Values>();

  useEffect(() => {
    if (!open) return;
    const initial: Values = {};
    for (const k of FIELDS) {
      const v = params.get(k);
      if (v) initial[k] = v;
    }
    form.resetFields();
    form.setFieldsValue(initial);
  }, [open, params, form]);

  const handleConfirm = async () => {
    const values = await form.validateFields();
    const next = new URLSearchParams(params);
    for (const k of FIELDS) {
      const v = values[k];
      if (v && v.length > 0) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page"); // reset pagination on filter change
    setParams(next);
    onClose();
  };

  const handleReset = () => {
    const next = new URLSearchParams(params);
    for (const k of FIELDS) next.delete(k);
    setParams(next);
    form.resetFields();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="高级搜索"
      width={420}
      footer={
        <Space style={{ width: "100%", justifyContent: "flex-end" }}>
          <Button onClick={handleReset}>重置</Button>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleConfirm}>
            确定
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical">
        <Form.Item label="学号" name="studentNo">
          <Input allowClear />
        </Form.Item>
        <Form.Item label="姓名" name="name">
          <Input allowClear />
        </Form.Item>
        <Form.Item label="年级" name="grade">
          <Select allowClear options={GRADE_OPTIONS} />
        </Form.Item>
        <Form.Item label="专业" name="major">
          <Input allowClear />
        </Form.Item>
        <Form.Item label="学生来源" name="source">
          <Select allowClear options={STUDENT_SOURCE_OPTIONS} />
        </Form.Item>
        <Form.Item label="服务群所在平台" name="servicePlatform">
          <Select allowClear options={SERVICE_PLATFORM_OPTIONS} />
        </Form.Item>
      </Form>
    </Drawer>
  );
}

export const ADVANCED_SEARCH_FIELDS = FIELDS;
```

- [ ] **Step 2: Create `ActiveFilterTags.tsx`**

```tsx
// apps/web/src/features/students/ActiveFilterTags.tsx
import { Tag } from "antd";
import { useSearchParams } from "react-router-dom";
import { ADVANCED_SEARCH_FIELDS } from "./AdvancedSearchDrawer";

const LABELS: Record<string, string> = {
  studentNo: "学号",
  name: "姓名",
  grade: "年级",
  major: "专业",
  source: "学生来源",
  servicePlatform: "服务平台",
};

export function ActiveFilterTags() {
  const [params, setParams] = useSearchParams();
  const active = ADVANCED_SEARCH_FIELDS.flatMap((k) => {
    const v = params.get(k);
    return v ? [[k, v] as const] : [];
  });
  if (active.length === 0) return null;

  const removeOne = (key: string) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    setParams(next);
  };

  return (
    <div className="active-filter-tag-row" style={{ margin: "8px 0" }}>
      {active.map(([k, v]) => (
        <Tag
          key={k}
          closable
          onClose={() => removeOne(k)}
          color="blue"
          style={{ marginRight: 8 }}
        >
          {LABELS[k] ?? k}: {v}
        </Tag>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/students/AdvancedSearchDrawer.tsx apps/web/src/features/students/ActiveFilterTags.tsx
git commit -m "feat(phase-2)(web): AdvancedSearchDrawer + ActiveFilterTags (URL sync)"
```

---

## Task 21: `StudentListPage` + router + styles

**Files:**
- Create: `apps/web/src/features/students/StudentListPage.tsx`
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Create `StudentListPage.tsx`**

```tsx
// apps/web/src/features/students/StudentListPage.tsx
import { Button, Input, Space, Table, Tag, Typography } from "antd";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  SERVICE_STATUS_COLORS,
  SERVICE_STATUS_LABELS,
  type ServiceStatus,
} from "../../constants/dictionaries";
import { RequireRole } from "../auth/RequireRole";
import type { StudentDetail, StudentListItem } from "../../services/students";
import { studentsApi } from "../../services/students";
import { ActiveFilterTags } from "./ActiveFilterTags";
import { AdvancedSearchDrawer } from "./AdvancedSearchDrawer";
import { openStudentDeleteConfirm } from "./StudentDeleteConfirm";
import { StudentFormModal, type StudentFormMode } from "./StudentFormModal";
import { StudentImportDrawer } from "./StudentImportDrawer";
import { useStudents } from "./hooks/useStudents";
import { useStudentMutations } from "./hooks/useStudentMutations";

const PAGE_SIZE = 50;

export function StudentListPage() {
  const [params, setParams] = useSearchParams();
  const keyword = params.get("keyword") ?? "";
  const page = Number(params.get("page") ?? "1");

  const queryParams = useMemo(
    () => ({
      keyword: keyword || undefined,
      studentNo: params.get("studentNo") ?? undefined,
      name: params.get("name") ?? undefined,
      grade: params.get("grade") ?? undefined,
      major: params.get("major") ?? undefined,
      source: params.get("source") ?? undefined,
      servicePlatform: params.get("servicePlatform") ?? undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [params, keyword, page],
  );

  const { data, isLoading } = useStudents(queryParams);
  const { removeMutation } = useStudentMutations();

  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [modalState, setModalState] = useState<{ open: boolean; mode: StudentFormMode; initial: StudentDetail | null }>(
    { open: false, mode: "create", initial: null },
  );
  const [advOpen, setAdvOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const openDetail = async (mode: StudentFormMode, row?: StudentListItem) => {
    if (mode === "create") {
      setModalState({ open: true, mode: "create", initial: null });
      return;
    }
    if (!row) return;
    const detail = await studentsApi.detail(row.id);
    setModalState({ open: true, mode, initial: detail });
  };

  const canView = selectedKeys.length === 1;
  const canEdit = selectedKeys.length === 1;
  const canDelete = selectedKeys.length >= 1;

  const handleKeywordChange = (v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set("keyword", v);
    else next.delete("keyword");
    next.delete("page");
    setParams(next);
  };

  const handlePageChange = (p: number) => {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    setParams(next);
  };

  const handleDelete = () => {
    const row = data?.items.find((i) => i.id === selectedKeys[0]);
    if (!row) return;
    openStudentDeleteConfirm({
      studentName: row.name,
      studentNo: row.studentNo,
      onConfirm: async () => {
        await removeMutation.mutateAsync(row.id);
        setSelectedKeys([]);
      },
    });
  };

  return (
    <div>
      <Typography.Title level={3}>学生信息管理</Typography.Title>
      <Space style={{ width: "100%", marginBottom: 12 }} wrap>
        <Button disabled={!canView} onClick={() => openDetail("view", data?.items.find((i) => i.id === selectedKeys[0]))}>
          查看
        </Button>
        <RequireRole roles={["SUPER_ADMIN", "ADMIN"]} fallback={null}>
          <Button disabled={!canEdit} onClick={() => openDetail("edit", data?.items.find((i) => i.id === selectedKeys[0]))}>
            编辑
          </Button>
          <Button type="primary" onClick={() => openDetail("create")}>
            添加学生
          </Button>
          <Button danger disabled={!canDelete} onClick={handleDelete}>
            删除学生
          </Button>
          <Button onClick={() => setImportOpen(true)}>从 Excel 导入</Button>
        </RequireRole>
        <div style={{ flex: 1 }} />
        <Input.Search
          placeholder="搜索姓名 / 学号 / 电话"
          allowClear
          defaultValue={keyword}
          onSearch={handleKeywordChange}
          style={{ width: 280 }}
        />
        <Button onClick={() => setAdvOpen(true)}>高级搜索</Button>
      </Space>

      <ActiveFilterTags />

      <Table<StudentListItem>
        rowKey="id"
        size="middle"
        loading={isLoading}
        dataSource={data?.items ?? []}
        rowSelection={{
          type: "checkbox",
          selectedRowKeys: selectedKeys,
          onChange: setSelectedKeys,
        }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          onChange: handlePageChange,
          showSizeChanger: false,
        }}
        columns={[
          { title: "学号", dataIndex: "studentNo", width: 100 },
          { title: "学生姓名", dataIndex: "name", width: 120 },
          { title: "性别", dataIndex: "gender", width: 60 },
          { title: "学校", dataIndex: "school", width: 160, render: (v) => v ?? "-" },
          { title: "专业", dataIndex: "major", width: 160, render: (v) => v ?? "-" },
          {
            title: "当前年级",
            dataIndex: "grade",
            width: 100,
            render: (v) => v ?? "-",
          },
          {
            title: "公共课剩余",
            dataIndex: "remainingPublicCredits",
            width: 110,
            render: (v) => (v == null ? "-" : v),
          },
          {
            title: "1v1 剩余",
            dataIndex: "remainingPrivateCredits",
            width: 100,
            render: (v) => (v == null ? "-" : v),
          },
          {
            title: "服务状态",
            dataIndex: "serviceStatus",
            width: 120,
            render: (v: ServiceStatus) => (
              <Tag color={SERVICE_STATUS_COLORS[v]}>{SERVICE_STATUS_LABELS[v]}</Tag>
            ),
          },
        ]}
      />

      <StudentFormModal
        open={modalState.open}
        mode={modalState.mode}
        initial={modalState.initial}
        onClose={() => setModalState((s) => ({ ...s, open: false }))}
        onModeChange={(mode) => setModalState((s) => ({ ...s, mode }))}
      />
      <AdvancedSearchDrawer open={advOpen} onClose={() => setAdvOpen(false)} />
      <StudentImportDrawer open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Replace the `/students` placeholder in `router.tsx`**

Open `apps/web/src/router.tsx`. Find the existing `{ path: "students", element: ...<ModulePage .../>... }` block and replace it with:

```tsx
      {
        path: "students",
        element: (
          <RequireAuth>
            <StudentListPage />
          </RequireAuth>
        ),
      },
```

Add the import at the top of the file (next to existing feature imports):

```tsx
import { StudentListPage } from "./features/students/StudentListPage";
```

- [ ] **Step 3: Append styles to `styles.css`**

Append to `apps/web/src/styles.css`:

```css
.related-course-categories-placeholder {
  padding: 12px 16px;
  border: 1px dashed #d9d9d9;
  border-radius: 8px;
  color: #8c8c8c;
  background: #fafafa;
  font-size: 13px;
}

.student-detail-section-title {
  font-size: 14px;
  font-weight: 600;
  color: #1d8cff;
  margin: 16px 0 8px;
  border-left: 3px solid #1d8cff;
  padding-left: 8px;
}

.active-filter-tag-row .ant-tag {
  margin-bottom: 4px;
}
```

- [ ] **Step 4: Verify TypeScript + dev build**

```bash
pnpm --filter @yanlu/web exec tsc --noEmit
pnpm --filter @yanlu/web build
```

Expected: `vite build` ends with `✓ built in …`; no TS errors.

- [ ] **Step 5: Browser smoke test**

Start both apps:

```bash
pnpm dev:api &
sleep 5
pnpm dev:web &
sleep 3
```

Open `http://localhost:5173/students` in the browser after logging in. Expected:
- Page header "学生信息管理"
- Toolbar buttons as per spec §4.1
- Search box and "高级搜索" button on the right
- Empty table (no students yet) with the expected column headers
- `Add student` modal opens with all sections; `学号` read-only and shows "保存后生成"

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/students/StudentListPage.tsx apps/web/src/router.tsx apps/web/src/styles.css
git commit -m "feat(phase-2)(web): StudentListPage + /students route + styles"
```

---

## Task 22: Documentation updates

**Files:**
- Modify: `docs/technical/frontend-components.md` (append student section)
- Modify: `docs/technical/deployment.md` (add student storage folders)
- Modify: `README.md` (mention students module in the milestone list)

- [ ] **Step 1: Append a "Students (Phase 2)" section to `docs/technical/frontend-components.md`**

Add after the last Phase 1B section:

```markdown
## Students (Phase 2)

Implemented in `apps/web/src/features/students/` and the shared
`apps/web/src/components/EmployeePicker.tsx`.

Routes:
- `GET /students` — `StudentListPage` wraps the `<Table>`, toolbar, search and
  advanced-search Drawer; route is inside `<AppShell>` and requires auth.

Key components:
- `StudentListPage` — master list with toolbar-driven state, 50-per-page
  pagination, row selection dictating which toolbar buttons are enabled.
- `StudentFormModal` — single modal for create / view / edit. View mode
  switches to edit via footer button; `enrollmentYear` is locked after create.
- `StudentImportDrawer` — template download → MinIO presign upload → dry-run →
  commit.
- `AdvancedSearchDrawer` + `ActiveFilterTags` — URL-synced filter state
  (`?studentNo=&grade=&major=…`), tags row under the toolbar lets users remove
  filters one by one.
- `EmployeePicker` — shared Select with remote search, excludes RESIGNED by
  default; backfills via `employeesApi.findByJobNo` when a value is set.
- `StudentAttachmentUpload` — wraps AntD `Upload.Dragger` over the MinIO
  presign path (`students/attachments` prefix).
- `DetailNotesEditor` — edits the `detailNotes` JSON array as a list of
  `{title, content}` sections.

Permissions:
- Read (`GET`) endpoints: any authenticated user.
- Write endpoints: `@Roles(SUPER_ADMIN, ADMIN)`; buttons behind
  `<RequireRole roles={['SUPER_ADMIN', 'ADMIN']}>`.
```

- [ ] **Step 2: Append MinIO prefixes to `docs/technical/deployment.md`**

Find the section that lists MinIO bucket folders (created in Phase 1A). Append to that list:

```markdown
- `students/attachments/` — student form attachments (transcripts, schedules,
  policy PDFs, general files / images)
- `students/import-batches/` — raw uploaded Excel files used by the dry-run /
  commit import flow; retained for audit traceability (set a bucket lifecycle
  rule to clean old batches if disk pressure becomes an issue)
```

- [ ] **Step 3: Update the module summary in `README.md`**

Open `README.md` and find the list of implemented modules (likely near a "已完成 Phase" section added in Phase 1A/1B). Add:

```markdown
- **Phase 2 — 学生模块**：学生 CRUD、Excel 导入、高级搜索（URL 可分享）、学管老师/规划师选择器、附件上传。入口：`/students`。
```

- [ ] **Step 4: Commit**

```bash
git add docs/technical/frontend-components.md docs/technical/deployment.md README.md
git commit -m "docs(phase-2): document students module, import flow, MinIO prefixes"
```

---

## Task 23: End-to-end acceptance walkthrough

Run this as a final verification pass. No code changes; verify each bullet against a live stack and fix regressions if you find any. Small follow-up commits are fine.

**Pre-req:** `pnpm dev:api` + `pnpm dev:web` + `docker compose up -d db minio` all running.

- [ ] **Step 1: Auth / guard**

```bash
curl -i http://localhost:3000/api/students
```

Expected: `HTTP/1.1 401 Unauthorized`.

- [ ] **Step 2: Seed two employees via the existing UI** (or curl) so the counselor/planner picker has options.

Log in as SUPER_ADMIN (the bootstrap account from Phase 1A). Navigate to `/employees`, add two employees (one FULL_TIME, one PART_TIME). Note their jobNos for the next step.

- [ ] **Step 3: Create 3 students via UI**

Navigate to `/students`. Add three students:
- 张三 — 2023 enrollment, 2027 graduation, counselor = employee A
- 李四 — 2024 enrollment, 2028 graduation, counselor = employee A, planner = employee B, service status = IN_SERVICE
- 王五 — 2022 enrollment, 2026 graduation, service status = COMPLETED

Verify after each add:
- Student appears in the table.
- `学号` follows `YYNNNN` with correct YY: `230001`, `240001`, `220001`.
- `当前年级` renders per `calculateGrade`:
  - 张三 2023/2027 (today) → per current month
  - 王五 2022/2026 (today) → 已毕业 iff current is on/after July 2026

- [ ] **Step 4: Sort order check**

Default list order should match spec §4.3:

1. 未开始 > 正常服务中 > 服务暂缓 > 取消或终止 > 服务完成 — so 张三/王五 (NOT_STARTED) above 李四 (IN_SERVICE) above COMPLETED.
2. Within same status, higher grade first (大五 first).
3. Within same grade, name ASC.

Visually confirm the three rows appear in the expected order. Edit one to PAUSED to watch it move.

- [ ] **Step 5: Selection → button enable matrix (spec §4.2)**

- 0 rows selected: 查看 / 编辑 / 删除 all disabled.
- 1 row: all three enabled.
- 2+ rows: 查看 / 编辑 disabled, 删除 enabled.

- [ ] **Step 6: enrollmentYear lock**

Open 张三 in edit mode. `入学年份` is disabled; tooltip reads "入学年份创建后不可修改…". Change `毕业年份` to 2028. Save. Reload list: 张三 still has `230001` as studentNo (unchanged).

- [ ] **Step 7: Delete guard**

Open pgsql:

```bash
docker compose exec -T db psql -U yanlu -d yanluzhongtai -c "INSERT INTO \"Enrollment\" (\"studentId\", \"courseId\") VALUES ((SELECT id FROM \"Student\" WHERE \"studentNo\" = '230001'), 'fake-course-id')" 2>&1 | head
```

(The insert will fail because `courseId` has no matching Course row — that's fine. To actually seed an enrollment, create a dummy course first via `INSERT INTO "Course" (id, "courseNo", name, "sectionCode", "categorySequenceNo") VALUES ('fake', 'FAKE', 'fake', '', '')` then retry. If seeding feels too involved, skip this step and mark it verified via unit inspection of `remove()` logic.)

With one enrollment present, try to delete 张三 via UI. Expected: red toast "该学生已有选课记录，不可删除…".

Then delete the fake `Enrollment` row and retry the delete — it should succeed.

- [ ] **Step 8: Advanced search + URL share**

Click "高级搜索". Filter `年级=大三` + `学生来源=转介绍`. Confirm. URL updates to `…?grade=大三&source=转介绍`. Tags row shows two tags; click the × on `来源` tag and it removes from URL + table refreshes.

Copy the full URL, open in an incognito tab (after login), confirm the filters apply immediately.

- [ ] **Step 9: Excel import happy path**

Click "从 Excel 导入". Download template, open in Excel, fill 2 more rows (e.g. 赵六/2024/2028, 钱七/2025/2029). Save, upload. Dry-run report shows `总行数 2 / 有效行 2 / 错误行 0`. Click "确认导入". Toast "成功导入 2 名学生". Table refreshes; two new students with studentNos `240002` and `250001`.

- [ ] **Step 10: Excel import error path**

Upload the same file again (so the server sees duplicate phones if any / or intentionally break a field). Better: open template, set `服务状态` to "不存在的状态". Upload → dry-run report shows one error with `row=2, field=服务状态, message=非法值 "不存在的状态"; 允许值：未开始 / 正常服务中 / ...`. 确认导入 button remains disabled.

- [ ] **Step 11: EmployeePicker behavior**

In a student form, open the counselor picker. Type part of an employee's name. After 300ms debounce, options appear. Select one. Save. Reload the detail — the name is backfilled via `findByJobNo`.

Mark employee A as RESIGNED via `/employees`. Reopen the 张三 detail — EmployeePicker shows `260001 - XX (已离职)` for the counselor field, does not error.

- [ ] **Step 12: Audit log entries**

```bash
docker compose exec -T db psql -U yanlu -d yanluzhongtai -c "SELECT action, \"targetType\", \"fieldName\", LEFT(\"afterValue\", 60) FROM \"AuditLog\" WHERE \"targetType\" = 'student' ORDER BY \"createdAt\" DESC LIMIT 20"
```

Expected rows:
- `student.create` / `student.delete` — `fieldName` NULL, `afterValue` / `beforeValue` JSON blob.
- `student.update` — one row per changed field, `fieldName` populated (e.g. `graduationYear`).

- [ ] **Step 13: MustChangePasswordGuard regression**

Reset a user via the Phase 1B flow, log in as that user, open `/students`. Expected: the frontend axios interceptor catches `403 {code: "MUST_CHANGE_PASSWORD"}` and redirects to `/force-password-change` — the student route never renders.

- [ ] **Step 14: MEMBER role**

Demote a test user to MEMBER. Log in. Navigate to `/students`. Expected: list visible, but 添加 / 编辑 / 删除 / 从 Excel 导入 buttons are hidden (wrapped in `<RequireRole>`); 查看 still works.

- [ ] **Step 15: Commit the Phase 2 milestone marker**

If any small fixes landed during Steps 1-14, commit them. Then tag the walkthrough as complete:

```bash
git commit --allow-empty -m "chore(phase-2): end-to-end acceptance walkthrough complete"
```

(Empty commit is a lightweight marker — Phase 1A used the same convention.)

---

## Post-plan checks

- All 23 tasks' commits form a clean linear history on the `claude/elastic-roentgen-c6e9ba` branch.
- `git status` is clean.
- `docs/superpowers/specs/2026-04-22-phase-2-students-design.md` is the source of truth; this plan's every task maps back to at least one §4 / §5 / §6 design decision.
- No TODOs or `FIXME` comments were added to the codebase by this plan.
