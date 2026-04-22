# Phase 1A — 员工模块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the full employee CRUD slice (list / view / add / edit / delete + Excel import + MinIO attachment upload) plus the supporting backend infrastructure (atomic ID sequence, MinIO presign, audit log service, dictionaries) called out in the Phase 1A design doc.

**Architecture:** Backend Nest modules grow incrementally — `common/dictionaries.ts` and `common/id-sequence/` first, then `modules/storage/` + `modules/audit-logs/`, then the `modules/employees/` slice that wires them together. Frontend mirrors the same dictionaries, exposes `services/employees.ts` + `services/storage.ts`, and renders one `EmployeeListPage` that opens `EmployeeFormModal` / `EmployeeImportDrawer` / delete confirm. Excel import uploads via the same MinIO presign path as attachments.

**Tech Stack:** NestJS 10 + Prisma 5 + class-validator + `minio` ^8 + `exceljs` ^4 on the backend; React 18 + Vite + AntD 5 + TanStack Query 5 + Zustand on the frontend; PostgreSQL + MinIO via docker-compose.

**Source spec:** [`docs/superpowers/specs/2026-04-22-phase-1a-employees-design.md`](../specs/2026-04-22-phase-1a-employees-design.md)
**Phase requirement:** [`docs/spec/02-Phase1-员工与用户管理.md`](../../spec/02-Phase1-员工与用户管理.md) §4–§7 (1A scope; §8–§10 are 1B and out of scope here)

## Testing posture

The repo intentionally has **no** automated test runner (per `CLAUDE.md`: "No test or lint scripts are configured yet. Do not invent `pnpm test`."). The Phase 1A design §8 also defers automated test infra. Each task therefore swaps the usual TDD cycle for an explicit **Verify** step with runnable shell / curl / psql / browser commands, run before the commit. Adopt the discipline of "specify expected behavior → implement → verify → commit"; do not ship a task whose Verify step did not pass.

## Pre-flight (run once before Task 1)

```bash
# Make sure infra is up
pnpm install
docker compose up -d db minio
pnpm prisma:generate

# Sanity: env files exist with the MinIO + DB vars Phase 0 already added
test -f .env || cp .env.example .env
test -f apps/api/.env || cp apps/api/.env.example apps/api/.env
test -f apps/web/.env || cp apps/web/.env.example apps/web/.env
```

You should be on a clean git tree (`git status` empty) before starting Task 1. If you are not in a git worktree, consider creating one with `git worktree add ../yanlu-phase-1a -b feature/phase-1a-employees`.

---

## Task 1: Prisma schema — add `EmploymentStatus` enum + `IdSequence` table

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Open the schema and add the enum + new model**

Edit `apps/api/prisma/schema.prisma`. Above the `model User` block, add:

```prisma
enum EmploymentStatus {
  FULL_TIME
  PART_TIME
  RESIGNED
}
```

Replace the existing `Employee` block with:

```prisma
model Employee {
  id               String           @id @default(cuid())
  jobNo            String           @unique
  name             String
  gender           String
  employmentStatus EmploymentStatus @default(FULL_TIME)
  jobTitle         String
  hireDate         DateTime?
  phone            String?
  bankCardNo       String?
  bankName         String?
  source           String?
  servingFor       String[]
  resumeText       String?
  attachmentKeys   String[]
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([name])
}
```

At the bottom of the file (after `model AuditLog`), append:

```prisma
model IdSequence {
  kind      String
  year      Int
  lastSeq   Int      @default(0)
  updatedAt DateTime @updatedAt

  @@id([kind, year])
}
```

- [ ] **Step 2: Regenerate the Prisma client**

```bash
pnpm prisma:generate
```

Expected: prints "Generated Prisma Client (vX.Y.Z) ... in NNN ms".

- [ ] **Step 3: Push the schema to the dev database**

```bash
pnpm prisma:push
```

If Postgres complains that the existing `employmentStatus String` column does not match the new enum on a non-empty `Employee` table, rerun with `pnpm --filter @yanlu/api prisma db push --schema prisma/schema.prisma --accept-data-loss`. The Phase 0 `Employee` table is empty, so `--accept-data-loss` only drops zero rows.

Expected output ends with "Your database is now in sync with your Prisma schema."

- [ ] **Step 4: Verify the new table exists and the enum is wired**

```bash
docker compose exec -T db psql -U yanlu -d yanluzhongtai -c "\dT+ \"EmploymentStatus\"" -c "\d \"IdSequence\"" -c "\d \"Employee\""
```

Expected: `EmploymentStatus` lists three labels (`FULL_TIME`, `PART_TIME`, `RESIGNED`); `IdSequence` shows composite PK `(kind, year)`; `Employee.employmentStatus` shows type `EmploymentStatus` with default `FULL_TIME`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(prisma): add EmploymentStatus enum and IdSequence table"
```

---

## Task 2: Backend dictionaries (`common/dictionaries.ts`)

**Files:**
- Create: `apps/api/src/common/dictionaries.ts`

- [ ] **Step 1: Create the file**

```ts
// apps/api/src/common/dictionaries.ts

export const EMPLOYMENT_STATUS = ["FULL_TIME", "PART_TIME", "RESIGNED"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUS)[number];

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  FULL_TIME: "全职",
  PART_TIME: "兼职",
  RESIGNED: "已离职",
};

/** spec §4.3: 全职 + 兼职 排在前 (sort=0); 已离职 在后 (sort=1) */
export const EMPLOYMENT_STATUS_SORT: Record<EmploymentStatus, number> = {
  FULL_TIME: 0,
  PART_TIME: 0,
  RESIGNED: 1,
};

export const GENDER = ["男", "女"] as const;
export type Gender = (typeof GENDER)[number];

export const EMPLOYEE_SOURCE = ["研录", "招聘/临时", "渠道合作", "其他"] as const;
export type EmployeeSource = (typeof EMPLOYEE_SOURCE)[number];

export const EMPLOYEE_SERVING_FOR = [
  "研录保研",
  "研录考研",
  "高途",
  "内部管理",
  "其他",
] as const;
export type EmployeeServingFor = (typeof EMPLOYEE_SERVING_FOR)[number];

/** Whitelist of allowed presign upload prefixes; see Task 4. */
export const STORAGE_FOLDERS = [
  "employees/attachments",
  "employees/import-batches",
] as const;
export type StorageFolder = (typeof STORAGE_FOLDERS)[number];
```

- [ ] **Step 2: Verify it compiles**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output (success). If you see errors, re-read the file for typos.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/dictionaries.ts
git commit -m "feat(api): add backend dictionaries for employment, gender, source, serving-for"
```

---

## Task 3: `IdSequenceService` (atomic 工号 / 学号 / 课程编号 allocator)

**Files:**
- Create: `apps/api/src/common/id-sequence/id-sequence.service.ts`
- Create: `apps/api/src/common/id-sequence/id-sequence.module.ts`

- [ ] **Step 1: Create the service**

```ts
// apps/api/src/common/id-sequence/id-sequence.service.ts
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export type IdSequenceKind = "employee" | "student" | "course";

@Injectable()
export class IdSequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** 单次分配，返回 lastSeq 对应的下一个序号（即递增后的那个值） */
  async allocate(kind: IdSequenceKind, year: number): Promise<number> {
    const [first] = await this.allocateBatch(kind, year, 1);
    return first;
  }

  /** 批量分配，返回 N 个连续序号；count<1 时返回空数组 */
  async allocateBatch(
    kind: IdSequenceKind,
    year: number,
    count: number,
  ): Promise<number[]> {
    if (count < 1) return [];
    const rows = await this.prisma.$queryRaw<{ lastSeq: number }[]>(
      Prisma.sql`
        INSERT INTO "IdSequence" ("kind", "year", "lastSeq", "updatedAt")
        VALUES (${kind}, ${year}, ${count}, now())
        ON CONFLICT ("kind", "year")
        DO UPDATE SET "lastSeq" = "IdSequence"."lastSeq" + ${count}, "updatedAt" = now()
        RETURNING "lastSeq"
      `,
    );
    const lastSeq = Number(rows[0].lastSeq);
    const start = lastSeq - count + 1;
    return Array.from({ length: count }, (_, i) => start + i);
  }

  /** 工号格式化：YY (2位) + NNN (3位) */
  static formatEmployeeJobNo(year: number, seq: number): string {
    const yy = String(year).slice(-2).padStart(2, "0");
    return `${yy}${String(seq).padStart(3, "0")}`;
  }
}
```

- [ ] **Step 2: Create the module (global so any module can inject without re-importing)**

```ts
// apps/api/src/common/id-sequence/id-sequence.module.ts
import { Global, Module } from "@nestjs/common";
import { IdSequenceService } from "./id-sequence.service";

@Global()
@Module({
  providers: [IdSequenceService],
  exports: [IdSequenceService],
})
export class IdSequenceModule {}
```

- [ ] **Step 3: Wire it into `AppModule`**

Edit `apps/api/src/app.module.ts`. Add the import next to the existing imports:

```ts
import { IdSequenceModule } from "./common/id-sequence/id-sequence.module";
```

Then add `IdSequenceModule` to the `imports` array (anywhere after `PrismaModule`, before `HealthModule`).

- [ ] **Step 4: Verify compilation**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Verify the SQL allocator end-to-end**

Start the API in one terminal: `pnpm dev:api`. In another terminal:

```bash
docker compose exec -T db psql -U yanlu -d yanluzhongtai -c \
  "TRUNCATE \"IdSequence\";" -c "SELECT * FROM \"IdSequence\";"
```

Then write a tiny one-off probe to exercise the service. Create a temporary file `apps/api/src/__probes__/id-sequence-probe.ts` and run it with ts-node. Skip if you would rather verify only via the employee `POST` endpoint in Task 9 — both paths exercise the same code. The simplest in-place verification is to run a SQL upsert by hand:

```bash
docker compose exec -T db psql -U yanlu -d yanluzhongtai -c \
  "INSERT INTO \"IdSequence\" (kind, year, \"lastSeq\", \"updatedAt\") VALUES ('employee', 2026, 1, now())
   ON CONFLICT (kind, year) DO UPDATE SET \"lastSeq\" = \"IdSequence\".\"lastSeq\" + 1, \"updatedAt\" = now() RETURNING \"lastSeq\";"
```

Run the same statement three times. Expected `lastSeq` outputs: `1`, then `2`, then `3`. Then clean up: `TRUNCATE "IdSequence";`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/id-sequence apps/api/src/app.module.ts
git commit -m "feat(api): add IdSequenceService for atomic, no-recycle ID allocation"
```

---

## Task 4: `StorageService` + `StorageController` (MinIO presign)

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/modules/storage/storage.service.ts`
- Create: `apps/api/src/modules/storage/storage.module.ts`
- Create: `apps/api/src/modules/storage/storage.controller.ts`
- Create: `apps/api/src/modules/storage/dto/sign-upload.dto.ts`

- [ ] **Step 1: Add the `minio` dependency**

```bash
pnpm --filter @yanlu/api add minio@^8
```

- [ ] **Step 2: Create the DTO**

```ts
// apps/api/src/modules/storage/dto/sign-upload.dto.ts
import { IsIn, IsString, MaxLength } from "class-validator";
import { STORAGE_FOLDERS, StorageFolder } from "../../../common/dictionaries";

export class SignUploadDto {
  @IsIn(STORAGE_FOLDERS as unknown as string[])
  folder!: StorageFolder;

  @IsString()
  @MaxLength(200)
  filename!: string;

  @IsString()
  @MaxLength(200)
  contentType!: string;
}
```

- [ ] **Step 3: Create the service (bucket bootstrap on module init + presign helpers)**

```ts
// apps/api/src/modules/storage/storage.service.ts
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { Client as MinioClient } from "minio";

/** Strip path traversal characters, keep CJK/ASCII alphanumerics, '-', '_', '.', spaces */
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f]/g, "").slice(0, 120);
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: MinioClient;
  private bucket!: string;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.client = new MinioClient({
      endPoint: this.config.getOrThrow<string>("MINIO_ENDPOINT"),
      port: Number(this.config.get<string>("MINIO_PORT", "9000")),
      useSSL: this.config.get<string>("MINIO_USE_SSL", "false") === "true",
      accessKey: this.config.getOrThrow<string>("MINIO_ACCESS_KEY"),
      secretKey: this.config.getOrThrow<string>("MINIO_SECRET_KEY"),
    });
    this.bucket = this.config.getOrThrow<string>("MINIO_BUCKET");

    const exists = await this.client.bucketExists(this.bucket).catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Created MinIO bucket "${this.bucket}"`);
    }
  }

  async signUpload(folder: string, originalName: string, contentType: string) {
    const key = `${folder}/${randomUUID()}-${sanitizeFilename(originalName)}`;
    const putUrl = await this.client.presignedPutObject(this.bucket, key, 60 * 5);
    return { key, putUrl, contentType };
  }

  async signDownload(key: string, ttlSeconds = 60 * 10): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, ttlSeconds);
  }

  /** Stream object as Buffer; used by Excel import service to fetch uploaded files. */
  async readObject(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }
}
```

- [ ] **Step 4: Create the controller**

```ts
// apps/api/src/modules/storage/storage.controller.ts
import { BadRequestException, Body, Controller, Get, Post, Query } from "@nestjs/common";
import { STORAGE_FOLDERS } from "../../common/dictionaries";
import { SignUploadDto } from "./dto/sign-upload.dto";
import { StorageService } from "./storage.service";

@Controller("storage")
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post("uploads/sign")
  async signUpload(@Body() dto: SignUploadDto) {
    return this.storage.signUpload(dto.folder, dto.filename, dto.contentType);
  }

  @Get("downloads/sign")
  async signDownload(@Query("key") key: string) {
    if (!key) {
      throw new BadRequestException("缺少 key");
    }
    const allowed = STORAGE_FOLDERS.some((folder) => key.startsWith(`${folder}/`));
    if (!allowed) {
      throw new BadRequestException("非法的对象 key");
    }
    return { url: await this.storage.signDownload(key) };
  }
}
```

- [ ] **Step 5: Create the module (global so EmployeesImportService can inject it)**

```ts
// apps/api/src/modules/storage/storage.module.ts
import { Global, Module } from "@nestjs/common";
import { StorageController } from "./storage.controller";
import { StorageService } from "./storage.service";

@Global()
@Module({
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
```

- [ ] **Step 6: Wire `StorageModule` into `AppModule`**

Edit `apps/api/src/app.module.ts`:

```ts
import { StorageModule } from "./modules/storage/storage.module";
```

Add `StorageModule` to the `imports` array (after `IdSequenceModule`).

- [ ] **Step 7: Verify the API boots and creates the bucket**

```bash
pnpm dev:api
```

Expected log on startup contains either `Created MinIO bucket "yanlu-assets"` (first run) or simply no error and `Nest application successfully started`. If you see `Connection refused`, MinIO is not running — check `docker compose ps`.

Then verify the bucket exists in MinIO:

```bash
docker compose exec -T minio mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" 2>/dev/null
docker compose exec -T minio mc ls local
```

Expected: a line containing the bucket name (matches `MINIO_BUCKET` from `.env`, default `yanlu-assets`).

- [ ] **Step 8: Verify presign endpoints (need a logged-in token)**

In one terminal keep `pnpm dev:api` running. In another:

```bash
# Login to grab an access token (replace phone/password with your seeded super admin)
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800000000","password":"replace-with-a-strong-password","rememberMe":false}' \
  | jq -r .accessToken)

# Sign an upload
curl -s -X POST http://localhost:3000/api/storage/uploads/sign \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"folder":"employees/attachments","filename":"test.pdf","contentType":"application/pdf"}' | jq
```

Expected: JSON `{ "key": "employees/attachments/<uuid>-test.pdf", "putUrl": "http://...", "contentType": "application/pdf" }`.

Try an invalid folder to confirm the whitelist works:

```bash
curl -s -X POST http://localhost:3000/api/storage/uploads/sign \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"folder":"users/secret","filename":"x.txt","contentType":"text/plain"}'
```

Expected: HTTP 400 with `"folder must be one of the following values: employees/attachments, employees/import-batches"`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/package.json apps/api/src/modules/storage apps/api/src/app.module.ts pnpm-lock.yaml
git commit -m "feat(api): add MinIO storage module with presign upload/download endpoints"
```

---

## Task 5: `AuditLogsService` (hybrid action-level + field-level recorder)

**Files:**
- Create: `apps/api/src/modules/audit-logs/audit-logs.service.ts`
- Create: `apps/api/src/modules/audit-logs/audit-logs.module.ts`
- Create: `apps/api/src/modules/audit-logs/audit-logs.types.ts`

- [ ] **Step 1: Create the types file**

```ts
// apps/api/src/modules/audit-logs/audit-logs.types.ts

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "reset_password"
  | "deactivate"
  | "register"
  | "settle";

export type AuditTargetType = "employee" | "user" | "course" | "payroll";

export type AuditRecordInput = {
  operatorId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};
```

- [ ] **Step 2: Create the service**

```ts
// apps/api/src/modules/audit-logs/audit-logs.service.ts
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuditRecordInput } from "./audit-logs.types";

function safeStringify(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function diffKeys(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (safeStringify(before[key]) !== safeStringify(after[key])) {
      changed.push(key);
    }
  }
  return changed;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput): Promise<void> {
    const { action, before, after, ...rest } = input;

    // Behaviour-level row for create / delete / updates without a diff payload
    if (action !== "update" || !before || !after) {
      await this.prisma.auditLog.create({
        data: {
          ...rest,
          action,
          fieldName: null,
          beforeValue: safeStringify(before ?? null),
          afterValue: safeStringify(after ?? null),
        },
      });
      return;
    }

    // Field-level rows for updates — one row per changed field
    const changed = diffKeys(before, after);
    if (changed.length === 0) return;
    await this.prisma.auditLog.createMany({
      data: changed.map((field) => ({
        ...rest,
        action,
        fieldName: field,
        beforeValue: safeStringify(before[field]),
        afterValue: safeStringify(after[field]),
      })),
    });
  }
}
```

- [ ] **Step 3: Create the module**

```ts
// apps/api/src/modules/audit-logs/audit-logs.module.ts
import { Global, Module } from "@nestjs/common";
import { AuditLogsService } from "./audit-logs.service";

@Global()
@Module({
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
```

- [ ] **Step 4: Wire into `AppModule`**

Edit `apps/api/src/app.module.ts`:

```ts
import { AuditLogsModule } from "./modules/audit-logs/audit-logs.module";
```

Add `AuditLogsModule` to the `imports` array (after `StorageModule`).

- [ ] **Step 5: Verify compilation**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/audit-logs apps/api/src/app.module.ts
git commit -m "feat(api): add AuditLogsService with hybrid action/field-level recording"
```

---

## Task 6: Make `RolesGuard` global so `@Roles()` actually enforces

**Files:**
- Modify: `apps/api/src/app.module.ts`

The Phase 0 scaffold defined `RolesGuard` and `@Roles()` but never registered the guard globally — only `JwtAuthGuard` is in `APP_GUARD`. Without this step, `@Roles('SUPER_ADMIN', 'ADMIN')` decorators silently no-op.

- [ ] **Step 1: Edit `app.module.ts`**

Add the import:

```ts
import { RolesGuard } from "./modules/auth/guards/roles.guard";
```

Add a second `APP_GUARD` provider in the `providers` array (order matters — Jwt first so `req.user` is populated before RolesGuard reads it):

```ts
providers: [
  {
    provide: APP_GUARD,
    useClass: JwtAuthGuard,
  },
  {
    provide: APP_GUARD,
    useClass: RolesGuard,
  },
],
```

- [ ] **Step 2: Smoke-test that public + me endpoints still work**

```bash
pnpm dev:api
# In another shell:
curl -s http://localhost:3000/api/health | jq
# Expected: { "status": "ok", ... }

TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800000000","password":"replace-with-a-strong-password","rememberMe":false}' | jq -r .accessToken)
curl -s http://localhost:3000/api/auth/me -H "Authorization: Bearer $TOKEN" | jq
# Expected: { "user": { "role": "SUPER_ADMIN", ... } }
```

Both calls should still succeed (no `@Roles` is set on these endpoints, so the guard returns true).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "feat(api): register RolesGuard as a global guard so @Roles enforces"
```

---

## Task 7: Employees module — DTOs and shared types

**Files:**
- Create: `apps/api/src/modules/employees/employees.types.ts`
- Create: `apps/api/src/modules/employees/dto/create-employee.dto.ts`
- Create: `apps/api/src/modules/employees/dto/update-employee.dto.ts`
- Create: `apps/api/src/modules/employees/dto/query-employees.dto.ts`
- Create: `apps/api/src/modules/employees/dto/import.dto.ts`

- [ ] **Step 1: Create the shared types file**

```ts
// apps/api/src/modules/employees/employees.types.ts
import type { Employee, EmploymentStatus } from "@prisma/client";

export type EmployeeListItem = Pick<
  Employee,
  | "id"
  | "jobNo"
  | "name"
  | "gender"
  | "employmentStatus"
  | "jobTitle"
  | "phone"
  | "source"
  | "servingFor"
  | "hireDate"
>;

export type EmployeeDetail = Employee & {
  /** Phase 1A 占位；Phase 3 切真实查询。 */
  relatedCourses: string[];
};

export type EmployeeListResponse = {
  items: EmployeeListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ImportRowError = {
  row: number;
  field: string;
  message: string;
};

export type ImportReport = {
  totalRows: number;
  validRows: number;
  errors: ImportRowError[];
};

export type ImportCommitResult = {
  created: number;
  errors: ImportRowError[];
};

export type { EmploymentStatus };
```

- [ ] **Step 2: Create `CreateEmployeeDto`**

```ts
// apps/api/src/modules/employees/dto/create-employee.dto.ts
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import {
  EMPLOYEE_SERVING_FOR,
  EMPLOYEE_SOURCE,
  EMPLOYMENT_STATUS,
  EmployeeServingFor,
  EmployeeSource,
  EmploymentStatus,
  GENDER,
  Gender,
} from "../../../common/dictionaries";

export class CreateEmployeeDto {
  @IsString() @MaxLength(50)
  name!: string;

  @IsIn(GENDER as unknown as string[])
  gender!: Gender;

  @IsIn(EMPLOYMENT_STATUS as unknown as string[])
  employmentStatus!: EmploymentStatus;

  @IsString() @MaxLength(100)
  jobTitle!: string;

  @IsOptional() @IsDateString()
  hireDate?: string;

  @IsOptional() @IsString() @Matches(/^1[3-9]\d{9}$/, { message: "phone must be a valid Chinese mobile number" })
  phone?: string;

  @IsOptional() @IsString() @MaxLength(64)
  bankCardNo?: string;

  @IsOptional() @IsString() @MaxLength(64)
  bankName?: string;

  @IsOptional() @IsIn(EMPLOYEE_SOURCE as unknown as string[])
  source?: EmployeeSource;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(EMPLOYEE_SERVING_FOR as unknown as string[], { each: true })
  servingFor?: EmployeeServingFor[];

  @IsOptional() @IsString() @MaxLength(5000)
  resumeText?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  attachmentKeys?: string[];
}
```

- [ ] **Step 3: Create `UpdateEmployeeDto` (every field optional, otherwise identical)**

```ts
// apps/api/src/modules/employees/dto/update-employee.dto.ts
import { PartialType } from "@nestjs/mapped-types";
import { CreateEmployeeDto } from "./create-employee.dto";

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}
```

If `@nestjs/mapped-types` is not installed yet, add it:

```bash
pnpm --filter @yanlu/api add @nestjs/mapped-types
```

- [ ] **Step 4: Create `QueryEmployeesDto`**

```ts
// apps/api/src/modules/employees/dto/query-employees.dto.ts
import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
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
}
```

- [ ] **Step 5: Create the import DTOs**

```ts
// apps/api/src/modules/employees/dto/import.dto.ts
import { IsString, MaxLength } from "class-validator";

export class ImportFileKeyDto {
  @IsString() @MaxLength(300)
  fileKey!: string;
}
```

- [ ] **Step 6: Verify compilation**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/employees apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add employees DTOs and shared types"
```

---

## Task 8: `EmployeesService` — list / findOne / create / update

**Files:**
- Create: `apps/api/src/modules/employees/employees.service.ts`

- [ ] **Step 1: Create the service skeleton with CRUD core (delete will be added in Task 9, import in Task 11)**

```ts
// apps/api/src/modules/employees/employees.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { Employee, EmploymentStatus, Prisma } from "@prisma/client";
import { IdSequenceService } from "../../common/id-sequence/id-sequence.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import { QueryEmployeesDto } from "./dto/query-employees.dto";
import {
  EmployeeDetail,
  EmployeeListItem,
  EmployeeListResponse,
} from "./employees.types";

const DEFAULT_PAGE_SIZE = 50;

const LIST_SELECT = {
  id: true,
  jobNo: true,
  name: true,
  gender: true,
  employmentStatus: true,
  jobTitle: true,
  phone: true,
  source: true,
  servingFor: true,
  hireDate: true,
} as const;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idSequence: IdSequenceService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async list(query: QueryEmployeesDto): Promise<EmployeeListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const where: Prisma.EmployeeWhereInput = {};
    if (query.employmentStatus) {
      where.employmentStatus = query.employmentStatus as EmploymentStatus;
    }
    if (query.keyword && query.keyword.trim().length > 0) {
      const keyword = query.keyword.trim();
      where.OR = [
        { name: { contains: keyword, mode: "insensitive" } },
        { jobNo: { contains: keyword, mode: "insensitive" } },
        { phone: { contains: keyword, mode: "insensitive" } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.$queryRaw<EmployeeListItem[]>(this.buildSortedListQuery(where, skip, pageSize)),
      this.prisma.employee.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * spec §4.3 排序：'已离职' 排在最后，其它按姓名升序。
   * 用 raw SQL 因为 Prisma 不支持 CASE WHEN ORDER BY。
   */
  private buildSortedListQuery(
    where: Prisma.EmployeeWhereInput,
    skip: number,
    take: number,
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];
    if (where.employmentStatus) {
      conditions.push(Prisma.sql`"employmentStatus"::text = ${where.employmentStatus as string}`);
    }
    if (where.OR) {
      const ors = (where.OR as Prisma.EmployeeWhereInput[])
        .map((clause) => {
          if (clause.name && typeof clause.name === "object" && "contains" in clause.name) {
            const k = clause.name.contains as string;
            return Prisma.sql`"name" ILIKE ${"%" + k + "%"}`;
          }
          if (clause.jobNo && typeof clause.jobNo === "object" && "contains" in clause.jobNo) {
            const k = clause.jobNo.contains as string;
            return Prisma.sql`"jobNo" ILIKE ${"%" + k + "%"}`;
          }
          if (clause.phone && typeof clause.phone === "object" && "contains" in clause.phone) {
            const k = clause.phone.contains as string;
            return Prisma.sql`"phone" ILIKE ${"%" + k + "%"}`;
          }
          return Prisma.sql`TRUE`;
        });
      conditions.push(Prisma.sql`(${Prisma.join(ors, " OR ")})`);
    }
    const whereSql =
      conditions.length === 0
        ? Prisma.sql`TRUE`
        : Prisma.join(conditions, " AND ");

    return Prisma.sql`
      SELECT
        "id", "jobNo", "name", "gender", "employmentStatus", "jobTitle",
        "phone", "source", "servingFor", "hireDate"
      FROM "Employee"
      WHERE ${whereSql}
      ORDER BY
        CASE WHEN "employmentStatus" = 'RESIGNED' THEN 1 ELSE 0 END ASC,
        "name" ASC
      LIMIT ${take} OFFSET ${skip}
    `;
  }

  async findOne(id: string): Promise<EmployeeDetail> {
    const emp = await this.prisma.employee.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException("员工不存在");
    return { ...emp, relatedCourses: [] };
  }

  async create(dto: CreateEmployeeDto, operatorId: string): Promise<Employee> {
    const hireDate = dto.hireDate ? new Date(dto.hireDate) : new Date();
    const year = hireDate.getFullYear();
    const seq = await this.idSequence.allocate("employee", year);
    const jobNo = IdSequenceService.formatEmployeeJobNo(year, seq);

    const created = await this.prisma.employee.create({
      data: {
        jobNo,
        name: dto.name,
        gender: dto.gender,
        employmentStatus: dto.employmentStatus as EmploymentStatus,
        jobTitle: dto.jobTitle,
        hireDate,
        phone: dto.phone ?? null,
        bankCardNo: dto.bankCardNo ?? null,
        bankName: dto.bankName ?? null,
        source: dto.source ?? null,
        servingFor: dto.servingFor ?? [],
        resumeText: dto.resumeText ?? null,
        attachmentKeys: dto.attachmentKeys ?? [],
      },
    });

    await this.auditLogs.record({
      operatorId,
      action: "create",
      targetType: "employee",
      targetId: created.id,
      after: this.snapshot(created),
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdateEmployeeDto,
    operatorId: string,
  ): Promise<Employee> {
    const before = await this.prisma.employee.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("员工不存在");

    const data: Prisma.EmployeeUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.employmentStatus !== undefined) {
      data.employmentStatus = dto.employmentStatus as EmploymentStatus;
    }
    if (dto.jobTitle !== undefined) data.jobTitle = dto.jobTitle;
    if (dto.hireDate !== undefined) data.hireDate = new Date(dto.hireDate);
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.bankCardNo !== undefined) data.bankCardNo = dto.bankCardNo || null;
    if (dto.bankName !== undefined) data.bankName = dto.bankName || null;
    if (dto.source !== undefined) data.source = dto.source || null;
    if (dto.servingFor !== undefined) data.servingFor = dto.servingFor;
    if (dto.resumeText !== undefined) data.resumeText = dto.resumeText || null;
    if (dto.attachmentKeys !== undefined) data.attachmentKeys = dto.attachmentKeys;

    const after = await this.prisma.employee.update({ where: { id }, data });

    await this.auditLogs.record({
      operatorId,
      action: "update",
      targetType: "employee",
      targetId: id,
      before: this.snapshot(before),
      after: this.snapshot(after),
    });

    return after;
  }

  /** Strip volatile / internal columns before audit-log diff. */
  private snapshot(emp: Employee): Record<string, unknown> {
    const { id, createdAt, updatedAt, ...rest } = emp;
    void id;
    void createdAt;
    void updatedAt;
    return rest as unknown as Record<string, unknown>;
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
git add apps/api/src/modules/employees/employees.service.ts
git commit -m "feat(api): add EmployeesService CRUD core (list/findOne/create/update)"
```

---

## Task 9: `EmployeesService.remove` with relational guard

**Files:**
- Modify: `apps/api/src/modules/employees/employees.service.ts`

- [ ] **Step 1: Append `remove` to the service**

Add this method just below `update` (and add `ConflictException` to the `@nestjs/common` import at the top of the file):

```ts
import { ConflictException } from "@nestjs/common"; // add to existing imports
```

```ts
  async remove(id: string, operatorId: string): Promise<void> {
    const before = await this.prisma.employee.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("员工不存在");

    const [payrollCount, courseCount, counselorCount, plannerCount] =
      await this.prisma.$transaction([
        this.prisma.payrollSettlement.count({ where: { employeeJobNo: before.jobNo } }),
        this.prisma.course.count({ where: { actualTeacherJobNo: before.jobNo } }),
        this.prisma.student.count({ where: { counselorJobNo: before.jobNo } }),
        this.prisma.student.count({ where: { plannerJobNo: before.jobNo } }),
      ]);

    if (payrollCount + courseCount + counselorCount + plannerCount > 0) {
      throw new ConflictException(
        "该员工有关联学生/薪酬/课程，不可删除，请将状态改为已离职",
      );
    }

    await this.prisma.employee.delete({ where: { id } });
    await this.auditLogs.record({
      operatorId,
      action: "delete",
      targetType: "employee",
      targetId: id,
      before: this.snapshot(before),
    });
  }
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/employees/employees.service.ts
git commit -m "feat(api): add EmployeesService.remove with relational guard against payroll/course/student"
```

---

## Task 10: `EmployeesController` — CRUD endpoints

**Files:**
- Create: `apps/api/src/modules/employees/employees.controller.ts`
- Create: `apps/api/src/modules/employees/employees.module.ts`

- [ ] **Step 1: Create the controller**

```ts
// apps/api/src/modules/employees/employees.controller.ts
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
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { QueryEmployeesDto } from "./dto/query-employees.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import { EmployeesService } from "./employees.service";

@Controller("employees")
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(@Query() query: QueryEmployeesDto) {
    return this.employees.list(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.employees.findOne(id);
  }

  @Roles("SUPER_ADMIN", "ADMIN")
  @Post()
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() operator: AuthUser) {
    return this.employees.create(dto, operator.id);
  }

  @Roles("SUPER_ADMIN", "ADMIN")
  @Put(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.employees.update(id, dto, operator.id);
  }

  @Roles("SUPER_ADMIN", "ADMIN")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("id") id: string,
    @CurrentUser() operator: AuthUser,
  ) {
    await this.employees.remove(id, operator.id);
  }
}
```

- [ ] **Step 2: Create the module**

```ts
// apps/api/src/modules/employees/employees.module.ts
import { Module } from "@nestjs/common";
import { EmployeesController } from "./employees.controller";
import { EmployeesService } from "./employees.service";

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
```

- [ ] **Step 3: Wire into `AppModule`**

Edit `apps/api/src/app.module.ts`:

```ts
import { EmployeesModule } from "./modules/employees/employees.module";
```

Add `EmployeesModule` to the `imports` array (after `AuditLogsModule`).

- [ ] **Step 4: Smoke-test the endpoints**

```bash
pnpm dev:api
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800000000","password":"replace-with-a-strong-password","rememberMe":false}' | jq -r .accessToken)

# Empty list
curl -s "http://localhost:3000/api/employees" -H "Authorization: Bearer $TOKEN" | jq
# Expected: { "items": [], "total": 0, "page": 1, "pageSize": 50 }

# Create one
curl -s -X POST http://localhost:3000/api/employees \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"张三","gender":"男","employmentStatus":"FULL_TIME","jobTitle":"考研规划师","hireDate":"2026-03-01","phone":"13800001111","source":"研录","servingFor":["研录考研"]}' | jq
# Expected: object with "jobNo": "26001"

# List again
curl -s "http://localhost:3000/api/employees" -H "Authorization: Bearer $TOKEN" | jq '.items[].jobNo'
# Expected: "26001"

# Verify field-level audit log on update
EMP_ID=$(curl -s "http://localhost:3000/api/employees" -H "Authorization: Bearer $TOKEN" | jq -r '.items[0].id')
curl -s -X PUT "http://localhost:3000/api/employees/$EMP_ID" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"phone":"13900002222","jobTitle":"高级规划师"}' | jq
docker compose exec -T db psql -U yanlu -d yanluzhongtai -c \
  "SELECT action, \"fieldName\", \"beforeValue\", \"afterValue\" FROM \"AuditLog\" WHERE \"targetType\" = 'employee' ORDER BY \"createdAt\";"
# Expected: 1 'create' (fieldName NULL) + 2 'update' rows (fieldName='phone' and 'jobTitle')

# Delete (should succeed because no payroll/course/student references it yet)
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE \
  "http://localhost:3000/api/employees/$EMP_ID" -H "Authorization: Bearer $TOKEN"
# Expected: 204

# Verify the next created employee gets jobNo 26002, not 26001 (no recycling)
curl -s -X POST http://localhost:3000/api/employees \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"李四","gender":"女","employmentStatus":"FULL_TIME","jobTitle":"老师","hireDate":"2026-03-15"}' \
  | jq -r .jobNo
# Expected: "26002"
```

- [ ] **Step 5: Smoke-test relational guard**

```bash
# Insert a fake course pointing at the new employee to force a 409 on delete
EMP_NO=$(curl -s "http://localhost:3000/api/employees" -H "Authorization: Bearer $TOKEN" | jq -r '.items[0].jobNo')
EMP_ID=$(curl -s "http://localhost:3000/api/employees" -H "Authorization: Bearer $TOKEN" | jq -r '.items[0].id')
docker compose exec -T db psql -U yanlu -d yanluzhongtai -c \
  "INSERT INTO \"Course\" (id, \"courseNo\", name, \"sectionCode\", \"categorySequenceNo\", \"actualTeacherJobNo\", \"createdAt\", \"updatedAt\")
   VALUES ('test-course', 'TEST', '测试课程', 'A', '01', '$EMP_NO', now(), now());"

curl -s -X DELETE "http://localhost:3000/api/employees/$EMP_ID" \
  -H "Authorization: Bearer $TOKEN" | jq
# Expected: { "statusCode": 409, "message": "该员工有关联学生/薪酬/课程，不可删除，请将状态改为已离职", ... }

# Cleanup
docker compose exec -T db psql -U yanlu -d yanluzhongtai -c "DELETE FROM \"Course\" WHERE id = 'test-course';"
```

- [ ] **Step 6: Smoke-test role guard (一般成员 should get 403)**

```bash
# Create a MEMBER user via psql (no UI yet)
docker compose exec -T db psql -U yanlu -d yanluzhongtai -c \
  "INSERT INTO \"User\" (id, phone, \"passwordHash\", username, role, \"createdAt\")
   VALUES ('test-member', '13900000000', '\$2b\$12\$qjzyq.kS/9OuDzwGmnG0dOjV0CdF2Kw3LK1.G/QmWZ6/T2DqE3w/G', '测试成员', 'MEMBER', now());"
# That bcrypt hash decodes to "memberpass". Adjust if you prefer.

MEMBER_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13900000000","password":"memberpass","rememberMe":false}' | jq -r .accessToken)

# Read works (logged in is enough)
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/employees" \
  -H "Authorization: Bearer $MEMBER_TOKEN"
# Expected: 200

# Write does not
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:3000/api/employees" \
  -H "Authorization: Bearer $MEMBER_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"x","gender":"男","employmentStatus":"FULL_TIME","jobTitle":"x"}'
# Expected: 403

# Cleanup
docker compose exec -T db psql -U yanlu -d yanluzhongtai -c "DELETE FROM \"User\" WHERE id = 'test-member';"
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/employees/employees.controller.ts \
        apps/api/src/modules/employees/employees.module.ts \
        apps/api/src/app.module.ts
git commit -m "feat(api): expose employees CRUD endpoints with role-guarded writes"
```

---

## Task 11: `EmployeesImportService` — template, dry-run, commit

**Files:**
- Modify: `apps/api/package.json` (add `exceljs`)
- Create: `apps/api/src/modules/employees/employees-import.service.ts`

- [ ] **Step 1: Install `exceljs`**

```bash
pnpm --filter @yanlu/api add exceljs@^4
```

- [ ] **Step 2: Create the import service**

```ts
// apps/api/src/modules/employees/employees-import.service.ts
import { Injectable, Logger } from "@nestjs/common";
import { EmploymentStatus, Prisma } from "@prisma/client";
import * as ExcelJS from "exceljs";
import {
  EMPLOYEE_SERVING_FOR,
  EMPLOYEE_SOURCE,
  EMPLOYMENT_STATUS,
  EMPLOYMENT_STATUS_LABELS,
  EmployeeServingFor,
  EmployeeSource,
  GENDER,
  Gender,
} from "../../common/dictionaries";
import { IdSequenceService } from "../../common/id-sequence/id-sequence.service";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import {
  ImportCommitResult,
  ImportReport,
  ImportRowError,
} from "./employees.types";

const COLUMNS = [
  "name", "gender", "employmentStatus", "jobTitle", "hireDate",
  "phone", "bankCardNo", "bankName", "source", "servingFor", "resumeText",
] as const;

const COLUMN_HEADERS: Record<(typeof COLUMNS)[number], string> = {
  name: "姓名",
  gender: "性别",
  employmentStatus: "雇佣状态(FULL_TIME/PART_TIME/RESIGNED)",
  jobTitle: "具体工作职责",
  hireDate: "入职日期(YYYY-MM-DD)",
  phone: "电话",
  bankCardNo: "银行卡号",
  bankName: "开户行",
  source: "员工来源",
  servingFor: "正服务于(分号分隔)",
  resumeText: "简历(文字)",
};

type ParsedRow = {
  rowNumber: number;
  raw: Partial<Record<(typeof COLUMNS)[number], string>>;
};

type ValidatedRow = {
  rowNumber: number;
  hireYear: number;
  data: Prisma.EmployeeCreateManyInput;
};

@Injectable()
export class EmployeesImportService {
  private readonly logger = new Logger(EmployeesImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly idSequence: IdSequenceService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  /** Generate the .xlsx template; returned as a Buffer so the controller can stream it. */
  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("员工导入");
    sheet.columns = COLUMNS.map((key) => ({
      header: COLUMN_HEADERS[key],
      key,
      width: 24,
    }));

    // One example row to make the format obvious
    sheet.addRow({
      name: "张三",
      gender: "男",
      employmentStatus: "FULL_TIME",
      jobTitle: "考研规划师",
      hireDate: "2026-03-01",
      phone: "13800001111",
      bankCardNo: "",
      bankName: "",
      source: "研录",
      servingFor: "研录考研;内部管理",
      resumeText: "",
    });

    // Headers in bold + freeze first row
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async dryRun(fileKey: string): Promise<ImportReport> {
    const buffer = await this.storage.readObject(fileKey);
    const { rows, errors: parseErrors } = await this.parse(buffer);
    const validated = this.validate(rows);
    const errors = [...parseErrors, ...validated.errors];
    return {
      totalRows: rows.length,
      validRows: validated.rows.length,
      errors,
    };
  }

  async commit(fileKey: string, operatorId: string): Promise<ImportCommitResult> {
    const buffer = await this.storage.readObject(fileKey);
    const { rows, errors: parseErrors } = await this.parse(buffer);
    const validated = this.validate(rows);
    const errors = [...parseErrors, ...validated.errors];
    if (errors.length > 0) {
      // Refuse the whole batch on any error — the UI should never call commit when errors exist
      return { created: 0, errors };
    }

    // Group by year so we ask IdSequence only once per year
    const groupedByYear = new Map<number, ValidatedRow[]>();
    for (const row of validated.rows) {
      const list = groupedByYear.get(row.hireYear) ?? [];
      list.push(row);
      groupedByYear.set(row.hireYear, list);
    }

    // Allocate sequence numbers, then build CreateMany payload preserving sheet order
    const idMap = new Map<ValidatedRow, string>();
    for (const [year, group] of groupedByYear) {
      const seqs = await this.idSequence.allocateBatch("employee", year, group.length);
      group.forEach((row, idx) => {
        idMap.set(row, IdSequenceService.formatEmployeeJobNo(year, seqs[idx]));
      });
    }

    const data = validated.rows.map((row) => ({
      ...row.data,
      jobNo: idMap.get(row)!,
    }));

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.createMany({ data });
      // Re-fetch to obtain ids for audit logs
      const inserted = await tx.employee.findMany({
        where: { jobNo: { in: data.map((d) => d.jobNo!) } },
      });
      for (const emp of inserted) {
        await tx.auditLog.create({
          data: {
            operatorId,
            action: "create",
            targetType: "employee",
            targetId: emp.id,
            fieldName: null,
            beforeValue: null,
            afterValue: JSON.stringify({
              ...emp,
              source: emp.source,
              servingFor: emp.servingFor,
            }),
          },
        });
      }
    });

    return { created: data.length, errors: [] };
  }

  // ------------------------------- internals ------------------------------- //

  private async parse(buffer: Buffer): Promise<{ rows: ParsedRow[]; errors: ImportRowError[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { rows: [], errors: [{ row: 0, field: "header", message: "未找到任何工作表" }] };
    }

    // Match headers to expected COLUMNS
    const headerRow = sheet.getRow(1);
    const headerMap = new Map<number, (typeof COLUMNS)[number]>();
    headerRow.eachCell((cell, colNumber) => {
      const headerText = String(cell.value ?? "").trim();
      const matched = COLUMNS.find((key) => COLUMN_HEADERS[key] === headerText);
      if (matched) headerMap.set(colNumber, matched);
    });
    const missing = COLUMNS.filter((key) => ![...headerMap.values()].includes(key));
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

  private validate(rows: ParsedRow[]): { rows: ValidatedRow[]; errors: ImportRowError[] } {
    const validated: ValidatedRow[] = [];
    const errors: ImportRowError[] = [];

    for (const { rowNumber, raw } of rows) {
      const rowErrors: ImportRowError[] = [];

      const required: Array<[keyof typeof raw, string]> = [
        ["name", "姓名"],
        ["gender", "性别"],
        ["employmentStatus", "雇佣状态"],
        ["jobTitle", "具体工作职责"],
      ];
      for (const [key, label] of required) {
        if (!raw[key]) rowErrors.push({ row: rowNumber, field: label, message: "必填" });
      }

      if (raw.gender && !(GENDER as readonly string[]).includes(raw.gender)) {
        rowErrors.push({ row: rowNumber, field: "性别", message: `非法值，仅支持 ${GENDER.join("/")}` });
      }
      if (
        raw.employmentStatus &&
        !(EMPLOYMENT_STATUS as readonly string[]).includes(raw.employmentStatus)
      ) {
        rowErrors.push({
          row: rowNumber,
          field: "雇佣状态",
          message: `非法值，仅支持 ${EMPLOYMENT_STATUS.join("/")}（即 ${Object.values(EMPLOYMENT_STATUS_LABELS).join("/")}）`,
        });
      }
      if (raw.source && !(EMPLOYEE_SOURCE as readonly string[]).includes(raw.source)) {
        rowErrors.push({ row: rowNumber, field: "员工来源", message: `非法值，仅支持 ${EMPLOYEE_SOURCE.join("/")}` });
      }
      if (raw.phone && !/^1[3-9]\d{9}$/.test(raw.phone)) {
        rowErrors.push({ row: rowNumber, field: "电话", message: "格式不正确" });
      }

      let hireDate: Date | null = null;
      if (raw.hireDate) {
        const parsed = new Date(raw.hireDate);
        if (Number.isNaN(parsed.getTime())) {
          rowErrors.push({ row: rowNumber, field: "入职日期", message: "无法解析为日期" });
        } else {
          hireDate = parsed;
        }
      }

      let servingFor: EmployeeServingFor[] = [];
      if (raw.servingFor) {
        const items = raw.servingFor.split(/[;；,，]/).map((s) => s.trim()).filter(Boolean);
        for (const item of items) {
          if (!(EMPLOYEE_SERVING_FOR as readonly string[]).includes(item)) {
            rowErrors.push({
              row: rowNumber,
              field: "正服务于",
              message: `非法值 "${item}"，仅支持 ${EMPLOYEE_SERVING_FOR.join("/")}`,
            });
          }
        }
        servingFor = items as EmployeeServingFor[];
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      const hireYear = hireDate ? hireDate.getFullYear() : new Date().getFullYear();
      validated.push({
        rowNumber,
        hireYear,
        data: {
          jobNo: "PLACEHOLDER", // overwritten in commit() after IdSequence allocation
          name: raw.name!,
          gender: raw.gender!,
          employmentStatus: raw.employmentStatus as EmploymentStatus,
          jobTitle: raw.jobTitle!,
          hireDate: hireDate ?? undefined,
          phone: raw.phone ?? null,
          bankCardNo: raw.bankCardNo ?? null,
          bankName: raw.bankName ?? null,
          source: (raw.source as EmployeeSource | undefined) ?? null,
          servingFor,
          resumeText: raw.resumeText ?? null,
          attachmentKeys: [],
        },
      });
    }

    return { rows: validated, errors };
  }
}
```

- [ ] **Step 3: Register the service in `EmployeesModule`**

Edit `apps/api/src/modules/employees/employees.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { EmployeesController } from "./employees.controller";
import { EmployeesImportService } from "./employees-import.service";
import { EmployeesService } from "./employees.service";

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeesImportService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
```

- [ ] **Step 4: Verify compilation**

```bash
pnpm --filter @yanlu/api exec tsc --noEmit
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/employees/employees-import.service.ts \
        apps/api/src/modules/employees/employees.module.ts \
        apps/api/package.json pnpm-lock.yaml
git commit -m "feat(api): add EmployeesImportService with template/dry-run/commit pipeline"
```

---

## Task 12: Wire import endpoints onto `EmployeesController`

**Files:**
- Modify: `apps/api/src/modules/employees/employees.controller.ts`

- [ ] **Step 1: Extend the controller**

Add these imports at the top:

```ts
import { Header, Res } from "@nestjs/common";
import type { Response } from "express";
import { EmployeesImportService } from "./employees-import.service";
import { ImportFileKeyDto } from "./dto/import.dto";
```

Inject the import service in the constructor:

```ts
constructor(
  private readonly employees: EmployeesService,
  private readonly imports: EmployeesImportService,
) {}
```

Append three endpoints (mind the route order — `:id` must remain after `import/...`; with the literal `import` segment the conflict is avoided automatically because `:id` matches single segments only):

```ts
  @Roles("SUPER_ADMIN", "ADMIN")
  @Get("import/template")
  @Header(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  )
  @Header("Content-Disposition", 'attachment; filename="employee-import-template.xlsx"')
  async downloadTemplate(@Res({ passthrough: true }) _res: Response) {
    return this.imports.generateTemplate();
  }

  @Roles("SUPER_ADMIN", "ADMIN")
  @Post("import/dry-run")
  importDryRun(@Body() dto: ImportFileKeyDto) {
    return this.imports.dryRun(dto.fileKey);
  }

  @Roles("SUPER_ADMIN", "ADMIN")
  @Post("import/commit")
  importCommit(
    @Body() dto: ImportFileKeyDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.imports.commit(dto.fileKey, operator.id);
  }
```

NestJS's `@Res({ passthrough: true })` lets us return the buffer while still using `@Header()` decorators. Returning a `Buffer` makes Nest stream it as the body.

- [ ] **Step 2: Smoke-test the import flow end-to-end**

```bash
pnpm dev:api
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800000000","password":"replace-with-a-strong-password","rememberMe":false}' | jq -r .accessToken)

# 1. Download the template
curl -sS "http://localhost:3000/api/employees/import/template" \
  -H "Authorization: Bearer $TOKEN" -o /tmp/employee-template.xlsx
file /tmp/employee-template.xlsx
# Expected: ".xlsx ... Microsoft Excel" or "Zip archive"

# 2. Hand-edit /tmp/employee-template.xlsx to add 2-3 rows (or use Python/Node script)
#    For a fully scripted verification, generate a tiny xlsx via node:
node -e '
const ExcelJS = require("/path/to/your/repo/apps/api/node_modules/exceljs");
(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("员工导入");
  const headers = ["姓名","性别","雇佣状态(FULL_TIME/PART_TIME/RESIGNED)","具体工作职责","入职日期(YYYY-MM-DD)","电话","银行卡号","开户行","员工来源","正服务于(分号分隔)","简历(文字)"];
  ws.addRow(headers);
  ws.addRow(["王五","男","FULL_TIME","老师","2026-04-01","13800002222","","","研录","研录考研",""]);
  ws.addRow(["赵六","女","PART_TIME","助教","2026-04-02","","","","招聘/临时","研录保研;高途",""]);
  await wb.xlsx.writeFile("/tmp/employees-import-test.xlsx");
})();
'

# 3. Sign an upload URL and PUT the file to MinIO
SIGN=$(curl -s -X POST http://localhost:3000/api/storage/uploads/sign \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"folder":"employees/import-batches","filename":"test.xlsx","contentType":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}')
KEY=$(echo "$SIGN" | jq -r .key)
PUTURL=$(echo "$SIGN" | jq -r .putUrl)
curl -sS -X PUT "$PUTURL" --data-binary @/tmp/employees-import-test.xlsx \
  -H "Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# 4. Dry-run
curl -sS -X POST "http://localhost:3000/api/employees/import/dry-run" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"fileKey\":\"$KEY\"}" | jq
# Expected: { "totalRows": 2, "validRows": 2, "errors": [] }

# 5. Commit
curl -sS -X POST "http://localhost:3000/api/employees/import/commit" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"fileKey\":\"$KEY\"}" | jq
# Expected: { "created": 2, "errors": [] }

# 6. Confirm rows landed with consecutive jobNos for the same year
docker compose exec -T db psql -U yanlu -d yanluzhongtai -c \
  "SELECT \"jobNo\", name FROM \"Employee\" ORDER BY \"jobNo\";"
# Expected: 26002 王五, 26003 赵六 (assumes 26001 was created earlier)
```

- [ ] **Step 3: Smoke-test the dry-run error path**

Reuse a malformed file (e.g. delete the "性别" header in /tmp/employees-import-test.xlsx, re-upload as a new key):

```bash
curl -sS -X POST "http://localhost:3000/api/employees/import/dry-run" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"fileKey\":\"$BAD_KEY\"}" | jq
# Expected: errors array contains a "缺少列：性别" message; validRows = 0
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/employees/employees.controller.ts
git commit -m "feat(api): expose employees Excel import endpoints (template/dry-run/commit)"
```

---

## Task 13: Frontend dictionaries

**Files:**
- Create: `apps/web/src/constants/dictionaries.ts`

- [ ] **Step 1: Create the file (mirror of backend `common/dictionaries.ts`)**

```ts
// apps/web/src/constants/dictionaries.ts

export const EMPLOYMENT_STATUS = ["FULL_TIME", "PART_TIME", "RESIGNED"] as const;
export type EmploymentStatus = (typeof EMPLOYMENT_STATUS)[number];

export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  FULL_TIME: "全职",
  PART_TIME: "兼职",
  RESIGNED: "已离职",
};

export const EMPLOYMENT_STATUS_OPTIONS = EMPLOYMENT_STATUS.map((value) => ({
  value,
  label: EMPLOYMENT_STATUS_LABELS[value],
}));

export const GENDER = ["男", "女"] as const;
export type Gender = (typeof GENDER)[number];
export const GENDER_OPTIONS = GENDER.map((value) => ({ value, label: value }));

export const EMPLOYEE_SOURCE = ["研录", "招聘/临时", "渠道合作", "其他"] as const;
export type EmployeeSource = (typeof EMPLOYEE_SOURCE)[number];
export const EMPLOYEE_SOURCE_OPTIONS = EMPLOYEE_SOURCE.map((value) => ({
  value,
  label: value,
}));

export const EMPLOYEE_SERVING_FOR = [
  "研录保研",
  "研录考研",
  "高途",
  "内部管理",
  "其他",
] as const;
export type EmployeeServingFor = (typeof EMPLOYEE_SERVING_FOR)[number];
export const EMPLOYEE_SERVING_FOR_OPTIONS = EMPLOYEE_SERVING_FOR.map((value) => ({
  value,
  label: value,
}));

export const EMPLOYMENT_STATUS_TAG_COLOR: Record<EmploymentStatus, string> = {
  FULL_TIME: "blue",
  PART_TIME: "geekblue",
  RESIGNED: "default",
};
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc -b
```

Expected: no output. (`tsc -b` is the same compiler used by `pnpm build`'s frontend step.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/constants/dictionaries.ts
git commit -m "feat(web): add frontend dictionaries mirroring backend Phase 1A enums"
```

---

## Task 14: HTTP helper — `downloadAuthed` for binary downloads

**Files:**
- Modify: `apps/web/src/services/http.ts`

- [ ] **Step 1: Append a `downloadAuthed` helper**

At the bottom of `apps/web/src/services/http.ts`, just before the final `export const api = ...` block, add:

```ts
/**
 * Fetch a binary response with the access token attached, then trigger a
 * browser download. Useful for endpoints that require auth but should land
 * as a file (e.g. Excel templates).
 */
export async function downloadAuthed(path: string, filename: string): Promise<void> {
  const send = (token: string | null) =>
    fetch(`${baseUrl}${path}`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

  let res = await send(useAuthStore.getState().accessToken);
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken();
    if (!refreshed) throw new HttpError(401, "未登录或登录已过期");
    res = await send(useAuthStore.getState().accessToken);
  }
  if (!res.ok) {
    throw new HttpError(res.status, res.statusText);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc -b
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/services/http.ts
git commit -m "feat(web): add downloadAuthed helper for token-authenticated binary downloads"
```

---

## Task 15: Frontend services — `services/employees.ts` + `services/storage.ts`

**Files:**
- Create: `apps/web/src/services/storage.ts`
- Create: `apps/web/src/services/employees.ts`
- Create: `apps/web/src/features/employees/types.ts`

- [ ] **Step 1: Create `features/employees/types.ts`**

```ts
// apps/web/src/features/employees/types.ts
import type {
  EmployeeServingFor,
  EmployeeSource,
  EmploymentStatus,
  Gender,
} from "../../constants/dictionaries";

export type EmployeeListItem = {
  id: string;
  jobNo: string;
  name: string;
  gender: Gender | string;
  employmentStatus: EmploymentStatus;
  jobTitle: string;
  phone: string | null;
  source: EmployeeSource | string | null;
  servingFor: string[];
  hireDate: string | null;
};

export type EmployeeDetail = EmployeeListItem & {
  bankCardNo: string | null;
  bankName: string | null;
  resumeText: string | null;
  attachmentKeys: string[];
  createdAt: string;
  updatedAt: string;
  relatedCourses: string[];
};

export type EmployeeListResponse = {
  items: EmployeeListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type EmployeeQueryParams = {
  keyword?: string;
  page?: number;
  pageSize?: number;
  employmentStatus?: EmploymentStatus;
};

export type CreateEmployeeBody = {
  name: string;
  gender: Gender;
  employmentStatus: EmploymentStatus;
  jobTitle: string;
  hireDate?: string;
  phone?: string;
  bankCardNo?: string;
  bankName?: string;
  source?: EmployeeSource;
  servingFor?: EmployeeServingFor[];
  resumeText?: string;
  attachmentKeys?: string[];
};

export type UpdateEmployeeBody = Partial<CreateEmployeeBody>;

export type ImportRowError = { row: number; field: string; message: string };
export type ImportReport = {
  totalRows: number;
  validRows: number;
  errors: ImportRowError[];
};
export type ImportCommitResult = { created: number; errors: ImportRowError[] };
```

- [ ] **Step 2: Create `services/storage.ts`**

```ts
// apps/web/src/services/storage.ts
import { api } from "./http";

export type StorageFolder = "employees/attachments" | "employees/import-batches";

export const storageApi = {
  signUpload: (folder: StorageFolder, filename: string, contentType: string) =>
    api.post<{ key: string; putUrl: string; contentType: string }>(
      "/storage/uploads/sign",
      { folder, filename, contentType },
    ),
  signDownload: (key: string) =>
    api.get<{ url: string }>(
      `/storage/downloads/sign?key=${encodeURIComponent(key)}`,
    ),
};

/** Sign a presigned PUT URL and upload the File directly to MinIO. */
export async function uploadToStorage(folder: StorageFolder, file: File): Promise<string> {
  const { key, putUrl } = await storageApi.signUpload(folder, file.name, file.type || "application/octet-stream");
  const res = await fetch(putUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  if (!res.ok) {
    throw new Error(`文件上传失败 (${res.status})`);
  }
  return key;
}
```

- [ ] **Step 3: Create `services/employees.ts`**

```ts
// apps/web/src/services/employees.ts
import { api, downloadAuthed } from "./http";
import type {
  CreateEmployeeBody,
  EmployeeDetail,
  EmployeeListResponse,
  EmployeeQueryParams,
  ImportCommitResult,
  ImportReport,
  UpdateEmployeeBody,
} from "../features/employees/types";

function toQuery(params: EmployeeQueryParams): string {
  const search = new URLSearchParams();
  if (params.keyword) search.set("keyword", params.keyword);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.employmentStatus) search.set("employmentStatus", params.employmentStatus);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const employeesApi = {
  list: (params: EmployeeQueryParams = {}) =>
    api.get<EmployeeListResponse>(`/employees${toQuery(params)}`),
  detail: (id: string) => api.get<EmployeeDetail>(`/employees/${id}`),
  create: (body: CreateEmployeeBody) => api.post<EmployeeDetail>("/employees", body),
  update: (id: string, body: UpdateEmployeeBody) =>
    api.put<EmployeeDetail>(`/employees/${id}`, body),
  remove: (id: string) => api.delete<void>(`/employees/${id}`),
  importDryRun: (fileKey: string) =>
    api.post<ImportReport>("/employees/import/dry-run", { fileKey }),
  importCommit: (fileKey: string) =>
    api.post<ImportCommitResult>("/employees/import/commit", { fileKey }),
  downloadTemplate: () =>
    downloadAuthed("/employees/import/template", "员工导入模板.xlsx"),
};
```

- [ ] **Step 4: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc -b
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/services/employees.ts \
        apps/web/src/services/storage.ts \
        apps/web/src/features/employees/types.ts
git commit -m "feat(web): add employees + storage HTTP services and shared types"
```

---

## Task 16: TanStack Query hooks

**Files:**
- Create: `apps/web/src/features/employees/hooks/useEmployees.ts`
- Create: `apps/web/src/features/employees/hooks/useEmployeeMutations.ts`

- [ ] **Step 1: Create `useEmployees`**

```ts
// apps/web/src/features/employees/hooks/useEmployees.ts
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { employeesApi } from "../../../services/employees";
import type { EmployeeQueryParams } from "../types";

export function useEmployees(params: EmployeeQueryParams) {
  return useQuery({
    queryKey: ["employees", params],
    queryFn: () => employeesApi.list(params),
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 2: Create `useEmployeeMutations`**

```ts
// apps/web/src/features/employees/hooks/useEmployeeMutations.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "antd";
import { employeesApi } from "../../../services/employees";
import { HttpError } from "../../../services/http";
import type { CreateEmployeeBody, UpdateEmployeeBody } from "../types";

export function useEmployeeMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["employees"] });

  const createMutation = useMutation({
    mutationFn: (body: CreateEmployeeBody) => employeesApi.create(body),
    onSuccess: () => {
      message.success("员工已添加");
      invalidate();
    },
    onError: (err: unknown) => {
      message.error(err instanceof HttpError ? err.message : "添加失败，请稍后重试");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateEmployeeBody }) =>
      employeesApi.update(id, body),
    onSuccess: () => {
      message.success("员工信息已更新");
      invalidate();
    },
    onError: (err: unknown) => {
      message.error(err instanceof HttpError ? err.message : "更新失败，请稍后重试");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => employeesApi.remove(id),
    onSuccess: () => {
      message.success("员工已删除");
      invalidate();
    },
    onError: (err: unknown) => {
      if (err instanceof HttpError && err.status === 409) {
        message.error(err.message);
      } else {
        message.error("删除失败，请稍后重试");
      }
    },
  });

  return { createMutation, updateMutation, removeMutation };
}
```

- [ ] **Step 3: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc -b
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/employees/hooks
git commit -m "feat(web): add TanStack Query hooks for employees CRUD"
```

---

## Task 17: `EmployeeAttachmentUpload` component

**Files:**
- Create: `apps/web/src/features/employees/EmployeeAttachmentUpload.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/features/employees/EmployeeAttachmentUpload.tsx
import { UploadOutlined } from "@ant-design/icons";
import { Button, List, Space, Typography, message } from "antd";
import type { UploadProps } from "antd";
import { Upload } from "antd";
import { storageApi, uploadToStorage } from "../../services/storage";

type Props = {
  value?: string[];
  onChange?: (keys: string[]) => void;
  disabled?: boolean;
};

function basenameOf(key: string): string {
  // key form: "employees/attachments/<uuid>-<originalname>"
  const last = key.split("/").pop() ?? key;
  const dashIdx = last.indexOf("-");
  return dashIdx > 0 ? last.slice(dashIdx + 1) : last;
}

export function EmployeeAttachmentUpload({ value = [], onChange, disabled }: Props) {
  const customRequest: UploadProps["customRequest"] = async ({ file, onSuccess, onError }) => {
    try {
      const key = await uploadToStorage("employees/attachments", file as File);
      onChange?.([...value, key]);
      onSuccess?.({ key });
    } catch (err) {
      onError?.(err as Error);
      message.error("上传失败");
    }
  };

  const removeKey = (key: string) => {
    onChange?.(value.filter((k) => k !== key));
  };

  const openDownload = async (key: string) => {
    try {
      const { url } = await storageApi.signDownload(key);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      message.error("无法打开附件");
    }
  };

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      <Upload disabled={disabled} customRequest={customRequest} showUploadList={false}>
        <Button icon={<UploadOutlined />} disabled={disabled}>
          选择附件
        </Button>
      </Upload>
      <List
        size="small"
        bordered={value.length > 0}
        dataSource={value}
        locale={{ emptyText: "暂无附件" }}
        renderItem={(key) => (
          <List.Item
            actions={
              disabled
                ? []
                : [
                    <Typography.Link key="dl" onClick={() => openDownload(key)}>
                      下载
                    </Typography.Link>,
                    <Typography.Link key="rm" onClick={() => removeKey(key)} type="danger">
                      移除
                    </Typography.Link>,
                  ]
            }
          >
            <Typography.Link onClick={() => openDownload(key)}>{basenameOf(key)}</Typography.Link>
          </List.Item>
        )}
      />
    </Space>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc -b
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/employees/EmployeeAttachmentUpload.tsx
git commit -m "feat(web): add EmployeeAttachmentUpload using MinIO presign direct upload"
```

---

## Task 18: `EmployeeFormModal` (create / view / edit)

**Files:**
- Create: `apps/web/src/features/employees/EmployeeFormModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/features/employees/EmployeeFormModal.tsx
import {
  Button,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import {
  EMPLOYEE_SERVING_FOR_OPTIONS,
  EMPLOYEE_SOURCE_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  GENDER_OPTIONS,
} from "../../constants/dictionaries";
import { EmployeeAttachmentUpload } from "./EmployeeAttachmentUpload";
import { useEmployeeMutations } from "./hooks/useEmployeeMutations";
import type {
  CreateEmployeeBody,
  EmployeeDetail,
  UpdateEmployeeBody,
} from "./types";

export type EmployeeFormMode = "create" | "view" | "edit";

type Props = {
  open: boolean;
  mode: EmployeeFormMode;
  employee?: EmployeeDetail | null;
  onClose: () => void;
  onModeChange?: (next: EmployeeFormMode) => void;
};

type FormValues = Omit<CreateEmployeeBody, "hireDate"> & {
  hireDate?: dayjs.Dayjs | null;
};

function toFormValues(emp?: EmployeeDetail | null): FormValues {
  if (!emp) {
    return {
      name: "",
      gender: "男",
      employmentStatus: "FULL_TIME",
      jobTitle: "",
      hireDate: null,
      servingFor: [],
      attachmentKeys: [],
    } as unknown as FormValues;
  }
  return {
    name: emp.name,
    gender: (emp.gender as "男" | "女") ?? "男",
    employmentStatus: emp.employmentStatus,
    jobTitle: emp.jobTitle,
    hireDate: emp.hireDate ? dayjs(emp.hireDate) : null,
    phone: emp.phone ?? undefined,
    bankCardNo: emp.bankCardNo ?? undefined,
    bankName: emp.bankName ?? undefined,
    source: (emp.source ?? undefined) as CreateEmployeeBody["source"],
    servingFor: (emp.servingFor ?? []) as CreateEmployeeBody["servingFor"],
    resumeText: emp.resumeText ?? undefined,
    attachmentKeys: emp.attachmentKeys ?? [],
  };
}

export function EmployeeFormModal({ open, mode, employee, onClose, onModeChange }: Props) {
  const [form] = Form.useForm<FormValues>();
  const { createMutation, updateMutation } = useEmployeeMutations();
  const [submitting, setSubmitting] = useState(false);

  const readOnly = mode === "view";
  const title = useMemo(() => {
    if (mode === "create") return "添加员工";
    if (mode === "view") return "查看员工";
    return "编辑员工";
  }, [mode]);

  useEffect(() => {
    if (open) {
      form.setFieldsValue(toFormValues(employee));
    } else {
      form.resetFields();
    }
  }, [open, employee, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const payload: CreateEmployeeBody | UpdateEmployeeBody = {
        ...values,
        hireDate: values.hireDate ? values.hireDate.toISOString() : undefined,
      };
      if (mode === "create") {
        await createMutation.mutateAsync(payload as CreateEmployeeBody);
      } else if (mode === "edit" && employee) {
        await updateMutation.mutateAsync({ id: employee.id, body: payload });
      }
      onClose();
    } catch (err) {
      // form validation errors are surfaced inline; mutation errors handled by hook
    } finally {
      setSubmitting(false);
    }
  };

  const footer =
    mode === "view" ? (
      <Space>
        <Button onClick={onClose}>取消</Button>
        <Button type="primary" onClick={() => onModeChange?.("edit")}>
          编辑
        </Button>
      </Space>
    ) : (
      <Space>
        <Button onClick={onClose} disabled={submitting}>
          取消
        </Button>
        <Button type="primary" loading={submitting} onClick={handleSubmit}>
          确定
        </Button>
      </Space>
    );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title}
      width={920}
      destroyOnClose
      maskClosable={!submitting}
      bodyStyle={{ maxHeight: "70vh", overflowY: "auto" }}
      footer={footer}
    >
      <Form<FormValues> form={form} layout="vertical" disabled={readOnly}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="工号">
              <Input value={employee?.jobNo ?? "保存后生成"} disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="员工姓名"
              name="name"
              rules={[{ required: true, message: "请输入姓名" }, { max: 50 }]}
            >
              <Input placeholder="例：张三" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="性别"
              name="gender"
              rules={[{ required: true, message: "请选择性别" }]}
            >
              <Select options={GENDER_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="雇佣状态"
              name="employmentStatus"
              rules={[{ required: true, message: "请选择雇佣状态" }]}
            >
              <Select options={EMPLOYMENT_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="具体工作职责"
              name="jobTitle"
              rules={[{ required: true, message: "请输入工作职责" }, { max: 100 }]}
            >
              <Input placeholder="例：考研规划师" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="入职日期" name="hireDate">
              <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="电话号码"
              name="phone"
              rules={[
                {
                  pattern: /^1[3-9]\d{9}$/,
                  message: "请输入合法手机号",
                  validateTrigger: "onBlur",
                },
              ]}
            >
              <Input placeholder="例：13800000000" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="员工来源" name="source">
              <Select allowClear options={EMPLOYEE_SOURCE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="正服务于" name="servingFor">
              <Select mode="multiple" allowClear options={EMPLOYEE_SERVING_FOR_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="银行卡号" name="bankCardNo">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="开户行" name="bankName">
              <Input />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="负责的课程">
              <Typography.Text type="secondary">
                （待课程模块上线后自动同步）
              </Typography.Text>
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="简历（文字版）" name="resumeText">
              <Input.TextArea rows={5} maxLength={5000} showCount />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="附件简历" name="attachmentKeys" valuePropName="value" trigger="onChange">
              <EmployeeAttachmentUpload disabled={readOnly} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc -b
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/employees/EmployeeFormModal.tsx
git commit -m "feat(web): add EmployeeFormModal supporting create/view/edit modes"
```

---

## Task 19: `EmployeeDeleteConfirm` helper

**Files:**
- Create: `apps/web/src/features/employees/EmployeeDeleteConfirm.tsx`

- [ ] **Step 1: Create the helper**

```tsx
// apps/web/src/features/employees/EmployeeDeleteConfirm.tsx
import { ExclamationCircleFilled } from "@ant-design/icons";
import { Modal, Typography } from "antd";
import type { useEmployeeMutations } from "./hooks/useEmployeeMutations";

type Mutations = ReturnType<typeof useEmployeeMutations>;

export function confirmDeleteEmployee(
  employee: { id: string; name: string; jobNo: string },
  mutations: Mutations,
): void {
  Modal.confirm({
    title: `确认删除员工 ${employee.name}（工号 ${employee.jobNo}）？`,
    icon: <ExclamationCircleFilled style={{ color: "#ff4d4f" }} />,
    content: (
      <div>
        <Typography.Paragraph style={{ marginBottom: 8 }}>
          员工离职建议优先在编辑里改状态为"已离职"，不要直接删除。
        </Typography.Paragraph>
        <Typography.Paragraph type="warning" style={{ marginBottom: 0 }}>
          删除会影响关联数据（薪酬记录、历史课程、所带学生等），且无法恢复。
        </Typography.Paragraph>
      </div>
    ),
    okText: "确认删除",
    okButtonProps: { danger: true },
    cancelText: "取消",
    onOk: () => mutations.removeMutation.mutateAsync(employee.id),
  });
}
```

- [ ] **Step 2: Verify compilation**

```bash
pnpm --filter @yanlu/web exec tsc -b
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/employees/EmployeeDeleteConfirm.tsx
git commit -m "feat(web): add confirmDeleteEmployee with spec-mandated strong warning"
```

---

## Task 20: `EmployeeImportDrawer`

**Files:**
- Create: `apps/web/src/features/employees/EmployeeImportDrawer.tsx`

- [ ] **Step 1: Create the drawer**

```tsx
// apps/web/src/features/employees/EmployeeImportDrawer.tsx
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
import { useQueryClient } from "@tanstack/react-query";
import { employeesApi } from "../../services/employees";
import { uploadToStorage } from "../../services/storage";
import type { ImportReport, ImportRowError } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function EmployeeImportDrawer({ open, onClose }: Props) {
  const qc = useQueryClient();
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

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
      const key = await uploadToStorage("employees/import-batches", file as File);
      setFileKey(key);
      const dryRun = await employeesApi.importDryRun(key);
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
    setSubmitting(true);
    try {
      const result = await employeesApi.importCommit(fileKey);
      message.success(`成功导入 ${result.created} 名员工`);
      qc.invalidateQueries({ queryKey: ["employees"] });
      handleClose();
    } catch (err) {
      message.error("导入失败，请检查后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const errorColumns = [
    { title: "行号", dataIndex: "row", key: "row", width: 80 },
    { title: "字段", dataIndex: "field", key: "field", width: 160 },
    { title: "问题", dataIndex: "message", key: "message" },
  ];

  return (
    <Drawer
      title="从 Excel 导入员工"
      width={720}
      open={open}
      onClose={handleClose}
      destroyOnClose
      extra={
        <Button icon={<DownloadOutlined />} onClick={() => employeesApi.downloadTemplate()}>
          下载模板
        </Button>
      }
    >
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Typography.Paragraph type="secondary">
          1. 下载模板，按列填充员工信息（必填：姓名、性别、雇佣状态、具体工作职责）。
          <br />
          2. 上传后系统会预校验所有行；只有零错误时才允许"确认导入"。
          <br />
          3. 工号会按入职年份自动连续分配，删除不会回收。
        </Typography.Paragraph>

        <Upload.Dragger
          accept=".xlsx"
          multiple={false}
          showUploadList={false}
          customRequest={customRequest}
          disabled={uploading || submitting}
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
                message="检测到错误，请修正模板后重新上传"
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
              <Alert type="success" message="校验通过，可以导入" />
            )}

            <Button
              type="primary"
              size="large"
              block
              loading={submitting}
              disabled={report.errors.length > 0 || report.validRows === 0}
              onClick={handleCommit}
            >
              确认导入
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
pnpm --filter @yanlu/web exec tsc -b
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/employees/EmployeeImportDrawer.tsx
git commit -m "feat(web): add EmployeeImportDrawer with template/dry-run/commit flow"
```

---

## Task 21: `EmployeeListPage` + router wire-up

**Files:**
- Create: `apps/web/src/features/employees/EmployeeListPage.tsx`
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/styles.css` (small additions)

- [ ] **Step 1: Create the list page**

```tsx
// apps/web/src/features/employees/EmployeeListPage.tsx
import {
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  ImportOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  Button,
  Input,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { RequireRole } from "../auth/RequireRole";
import {
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUS_TAG_COLOR,
} from "../../constants/dictionaries";
import { confirmDeleteEmployee } from "./EmployeeDeleteConfirm";
import { EmployeeFormModal, type EmployeeFormMode } from "./EmployeeFormModal";
import { EmployeeImportDrawer } from "./EmployeeImportDrawer";
import { useEmployees } from "./hooks/useEmployees";
import { useEmployeeMutations } from "./hooks/useEmployeeMutations";
import { employeesApi } from "../../services/employees";
import type { EmployeeDetail, EmployeeListItem } from "./types";

const PAGE_SIZE = 50;

export function EmployeeListPage() {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<EmployeeFormMode>("create");
  const [activeEmployee, setActiveEmployee] = useState<EmployeeDetail | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const queryParams = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, keyword: keyword || undefined }),
    [page, keyword],
  );

  const { data, isLoading, isFetching } = useEmployees(queryParams);
  const mutations = useEmployeeMutations();

  const selectedCount = selectedRowKeys.length;
  const canViewOrEdit = selectedCount === 1;
  const canDelete = selectedCount >= 1;

  const openModalForRow = async (mode: EmployeeFormMode) => {
    if (selectedRowKeys.length !== 1) return;
    try {
      const detail = await employeesApi.detail(selectedRowKeys[0]);
      setActiveEmployee(detail);
      setModalMode(mode);
      setModalOpen(true);
    } catch (err) {
      message.error("无法加载员工详情");
    }
  };

  const openCreate = () => {
    setActiveEmployee(null);
    setModalMode("create");
    setModalOpen(true);
  };

  const handleDelete = () => {
    const target = (data?.items ?? []).find((row) => row.id === selectedRowKeys[0]);
    if (!target) return;
    confirmDeleteEmployee(
      { id: target.id, name: target.name, jobNo: target.jobNo },
      mutations,
    );
  };

  const columns = [
    { title: "工号", dataIndex: "jobNo", key: "jobNo", width: 100 },
    { title: "姓名", dataIndex: "name", key: "name", width: 120 },
    { title: "性别", dataIndex: "gender", key: "gender", width: 80 },
    { title: "具体工作职责", dataIndex: "jobTitle", key: "jobTitle", width: 180 },
    { title: "电话号码", dataIndex: "phone", key: "phone", width: 140 },
    { title: "员工来源", dataIndex: "source", key: "source", width: 120 },
    {
      title: "正服务于",
      dataIndex: "servingFor",
      key: "servingFor",
      width: 220,
      render: (items: string[]) =>
        items?.length ? items.map((it) => <Tag key={it}>{it}</Tag>) : <span>—</span>,
    },
    {
      title: "状态",
      dataIndex: "employmentStatus",
      key: "employmentStatus",
      width: 100,
      render: (value: keyof typeof EMPLOYMENT_STATUS_LABELS) => (
        <Tag color={EMPLOYMENT_STATUS_TAG_COLOR[value]}>
          {EMPLOYMENT_STATUS_LABELS[value]}
        </Tag>
      ),
    },
    {
      title: "入职日期",
      dataIndex: "hireDate",
      key: "hireDate",
      width: 120,
      render: (value: string | null) => (value ? dayjs(value).format("YYYY-MM-DD") : "—"),
    },
  ];

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        员工信息管理
      </Typography.Title>

      <div className="employees-toolbar">
        <Space wrap>
          <Button icon={<EyeOutlined />} disabled={!canViewOrEdit} onClick={() => openModalForRow("view")}>
            查看
          </Button>
          <RequireRole roles={["SUPER_ADMIN", "ADMIN"]} fallback={null}>
            <Button icon={<EditOutlined />} disabled={!canViewOrEdit} onClick={() => openModalForRow("edit")}>
              编辑
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              添加员工
            </Button>
            <Button danger icon={<DeleteOutlined />} disabled={!canDelete} onClick={handleDelete}>
              删除员工
            </Button>
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
              从 Excel 导入
            </Button>
          </RequireRole>
        </Space>
        <div style={{ flex: 1 }} />
        <Input.Search
          allowClear
          placeholder="搜索 工号 / 姓名 / 电话"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onSearch={(value) => {
            setKeyword(value.trim());
            setPage(1);
          }}
          style={{ width: 280 }}
        />
      </div>

      <Table<EmployeeListItem>
        rowKey="id"
        loading={isLoading || isFetching}
        dataSource={data?.items ?? []}
        columns={columns}
        scroll={{ x: 1200 }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        }}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />

      <EmployeeFormModal
        open={modalOpen}
        mode={modalMode}
        employee={activeEmployee}
        onClose={() => {
          setModalOpen(false);
          setActiveEmployee(null);
        }}
        onModeChange={setModalMode}
      />

      <EmployeeImportDrawer open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 2: Add toolbar styles**

Append to `apps/web/src/styles.css`:

```css
.employees-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.related-courses-placeholder {
  padding: 8px 12px;
  background: #f5f7fa;
  border-radius: 8px;
  color: #6b7280;
}
```

- [ ] **Step 3: Wire `EmployeeListPage` into the router**

Edit `apps/web/src/router.tsx`. At the top, replace the `ModulePage` import for the employees route by adding:

```ts
import { EmployeeListPage } from "./features/employees/EmployeeListPage";
```

Then replace the `path: "employees"` route entry with:

```tsx
{
  path: "employees",
  element: (
    <RequireAuth>
      <EmployeeListPage />
    </RequireAuth>
  ),
},
```

Leave every other route untouched — they still render `<ModulePage>` as Phase 0 left them.

- [ ] **Step 4: Verify the frontend builds**

```bash
pnpm --filter @yanlu/web exec tsc -b
pnpm --filter @yanlu/web build
```

Expected: both finish with no errors. Vite outputs `dist/` artifacts.

- [ ] **Step 5: Smoke-test in the browser**

```bash
# Both API and infra still up from earlier tasks
pnpm dev:web
```

Open http://localhost:5173 → log in as the seeded super admin → navigate to "员工信息":

- The page header reads "员工信息管理"
- Toolbar order: 查看 / 编辑 / 添加员工 / 删除员工 / 从 Excel 导入 / (gap) / 搜索框
- 查看 / 编辑 / 删除 are disabled with no rows checked
- Check 1 row → 查看 + 编辑 enable; check 2 rows → 查看 + 编辑 disable, 删除 stays enabled
- Click 添加员工 → modal opens, 工号 shows "保存后生成"
- Submit a new row → modal closes, table refreshes, 工号 starts with `26` (or current YY)

Log out and log back in as the MEMBER user from Task 10 (or create another) → 添加员工 / 编辑 / 删除 / 从 Excel 导入 buttons should not render.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/employees/EmployeeListPage.tsx \
        apps/web/src/router.tsx \
        apps/web/src/styles.css
git commit -m "feat(web): wire EmployeeListPage with toolbar/role gating into /employees route"
```

---

## Task 22: Documentation updates

**Files:**
- Modify: `docs/technical/deployment.md`
- Modify: `README.md`
- Modify: `docs/technical/frontend-components.md`

- [ ] **Step 1: Document the new endpoints in `deployment.md`**

Open `docs/technical/deployment.md` and append a new section:

```markdown
## Phase 1A — 员工与对象存储

### 首次启动后

1. 确认环境变量包含 `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_USE_SSL` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET`（默认在 `.env.example`）。
2. API 启动时会自动创建 `MINIO_BUCKET`（默认 `yanlu-assets`）。如果 MinIO 不可达，员工模块、附件简历、Excel 导入都会 fallback 到 500。
3. Excel 导入流程：浏览器先 `POST /api/storage/uploads/sign` 拿 presign URL → 直接 `PUT` 到 MinIO → 调 `/api/employees/import/dry-run` 校验 → `/api/employees/import/commit` 入库。

### 删除员工的关联保护

`DELETE /api/employees/:id` 在以下任一字段引用该员工的 `jobNo` 时返回 `409`：

- `PayrollSettlement.employeeJobNo`
- `Course.actualTeacherJobNo`
- `Student.counselorJobNo`
- `Student.plannerJobNo`

错误文案："该员工有关联学生/薪酬/课程，不可删除，请将状态改为已离职"。

### 工号 / 学号 / 课程编号生成

由 `IdSequenceService` 统一管理；`IdSequence` 表按 `(kind, year)` 复合主键累加，删除不回收序号。Phase 1A 只使用 `kind = 'employee'`。
```

- [ ] **Step 2: Append to `frontend-components.md`**

Add a section:

```markdown
## 员工模块（Phase 1A）

- 列表页：`features/employees/EmployeeListPage.tsx`，工具按钮顺序固定为 查看 / 编辑 / 添加员工 / 删除员工 / 从 Excel 导入；搜索框右侧分离。
- 弹窗：`EmployeeFormModal.tsx` 双列布局，view / edit / create 三模式共用一个 form；底部按钮按 spec §5.2 切换。
- 删除：`confirmDeleteEmployee()` 弹强提醒；后端 409 时 `useEmployeeMutations` 的 `removeMutation.onError` 直接 `message.error` 后端文案。
- 上传：`EmployeeAttachmentUpload.tsx` 与 `EmployeeImportDrawer.tsx` 共用 `services/storage.ts` 的 `uploadToStorage()`，全部 presign 直传 MinIO，不走后端中转。
- 字典：`constants/dictionaries.ts` 是后端 `common/dictionaries.ts` 的镜像；任何枚举改动两边都要改。
```

- [ ] **Step 3: Add a one-liner to `README.md`**

Under the "本地开发" / "首次开发" 段落，append:

```markdown
- 员工 / Excel 导入功能依赖 MinIO；保证 `docker compose up -d minio` 已运行，并在 `.env` 配置 `MINIO_*`（默认值已在 `.env.example`）。首次访问员工模块时 API 会自动创建 bucket。
```

- [ ] **Step 4: Commit**

```bash
git add docs/technical/deployment.md docs/technical/frontend-components.md README.md
git commit -m "docs: document Phase 1A employees + MinIO + ID sequence behavior"
```

---

## Task 23: End-to-end acceptance walkthrough

This task does not change code — it runs through the spec §11 acceptance checklist with a clean database to make sure the slice is shippable.

**Files:** none modified.

- [ ] **Step 1: Reset to a clean state**

```bash
docker compose exec -T db psql -U yanlu -d yanluzhongtai -c \
  "TRUNCATE \"Employee\", \"IdSequence\", \"AuditLog\" RESTART IDENTITY CASCADE;"
```

- [ ] **Step 2: Walk through each spec §11 item**

Against the running stack (`pnpm dev:api` + `pnpm dev:web`), confirm each line from the design's §8 acceptance list:

1. Visit `/employees` while logged out → "无访问权限" page (Phase 0).
2. Log in → header reads "员工信息管理"; toolbar order matches fig06.
3. Add 3 全职 + 1 兼职 + 1 已离职 employees with mixed names. Sort: 已离职 last; the rest by姓名升序.
4. Page size 50; pagination component shows but only one page if total < 50.
5. Uncheck all rows → 查看 / 编辑 / 删除 all disabled.
6. Check 1 row → all three enabled.
7. Check 2 rows → 查看 / 编辑 disabled, 删除 enabled.
8. Add an employee whose hire date is 2026-04-15 → 工号 starts `26` and increments from prior `26` rows.
9. Delete a 工号 `26002` employee, then add a new one → new row gets `26006` (or whatever next-after-max is) — never `26002` again. Confirm by `psql` query: `SELECT "lastSeq" FROM "IdSequence" WHERE kind='employee' AND year=2026;` should equal the most recent allocation.
10. Open an existing row in 查看 → footer shows 取消 / 编辑; click 编辑 → footer flips to 取消 / 确定.
11. Hit 删除员工 → modal text matches spec §7 wording.
12. Insert a fake `Course` row referencing an employee `jobNo` (psql) → 删除 returns 409 + spec文案. Cleanup the row.
13. Use the form's 附件简历 upload to attach a small PDF → entry appears in the list; click 下载 → file opens in a new tab. Re-open the row in 查看 mode → attachment is read-only and still downloadable.
14. Open Excel 导入 → 下载模板 → fill 3 rows → upload → dry-run shows `validRows: 3, errors: []` → 确认导入 → table picks up 3 new consecutive 工号.
15. Submit a malformed template (delete a header column) → dry-run returns the missing-header error; "确认导入" stays disabled.
16. Run `SELECT action, "fieldName" FROM "AuditLog" WHERE "targetType"='employee' ORDER BY "createdAt";` → see one `create` per row + per-field `update` rows for any edits.

- [ ] **Step 3: If anything fails, file a follow-up task before merging**

Do not push fixes inline at this stage; capture the broken behavior as a new task and rerun this walkthrough after each fix.

- [ ] **Step 4: Final tidy commit (only if anything was tweaked during the walkthrough)**

If the walkthrough revealed a doc or comment fix, commit it now as a small follow-up; otherwise skip the commit.

```bash
git status
# If clean, this task is done. If dirty:
git add <changed files>
git commit -m "chore(phase-1a): tidy follow-ups from acceptance walkthrough"
```

---

## Wrap-up

After Task 23 passes, the Phase 1A slice is feature-complete against `docs/spec/02-Phase1-员工与用户管理.md` §4–§7 and the design doc's §8 acceptance list. Phase 1B (用户设置 / 全部用户管理 / 重置密码 / 注销账号) starts from a separate brainstorming → writing-plans → executing-plans cycle and reuses the `AuditLogsService`, `RolesGuard`, `RequireRole`, and `dictionaries.ts` pieces this slice put down.

If you ran the work in a worktree, finalize with the `superpowers:finishing-a-development-branch` skill to choose between merge / PR / cleanup.
