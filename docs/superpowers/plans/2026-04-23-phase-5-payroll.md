# Phase 5 — 薪酬管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the payroll module — aggregated monthly rows per teacher + historical settlements + manual labor/deduction records, with a list page, settle dialog, view-courses dialog, add-manual dialog, and delete-manual helper — per [docs/spec/06-Phase5-薪酬管理.md](../../spec/06-Phase5-薪酬管理.md) and [design](../specs/2026-04-22-phase-5-payroll-design.md).

**Architecture:** NestJS `PayrollModule` with three services (aggregation + settlements + manual records) plus a shared `common/payroll/period` helper. Rows are realtime-aggregated from `Course` + `PayrollSettlement` + new `PayrollManualRecord`; "auto" rows and "manual" rows coexist under the same (teacher, period). React `features/payroll` mirrors the phase-4 folder (hooks + four dialogs + one page). All `/payroll/*` endpoints gated to `SUPER_ADMIN` + `ADMIN`.

**Tech Stack:** NestJS 10 + Prisma 5 + PostgreSQL + class-validator on the API side; React 18 + TypeScript + Vite + AntD 5 + TanStack Query + React Router 6 on the web side. No new third-party packages.

**Verification checkpoint:** Repo has no test/lint scripts — verify each task with `pnpm --filter @yanlu/api build` or `pnpm --filter @yanlu/web build`, plus `curl` smoke tests after the controller lands. Final task is a manual browser walk-through against spec §11.

---

## File Structure

**API — new / modified**

| Path | Role |
| --- | --- |
| `apps/api/prisma/schema.prisma` | + `PayrollManualRecord` model; `PayrollSettlement` gains `@@index([employeeJobNo, settlementPeriod])` |
| `apps/api/src/common/payroll/period.ts` | `YYYYMM` parsing/formatting, current/previous month, range expansion, `periodBounds` |
| `apps/api/src/modules/audit-logs/audit-logs.types.ts` | Add `"payroll_settlement"` + `"payroll_manual_record"` to `AuditTargetType` |
| `apps/api/src/modules/payroll/payroll.types.ts` | `PayrollAutoRow`, `PayrollManualRow`, `PayrollRow`, list + row-state + course types |
| `apps/api/src/modules/payroll/dto/query-payroll.dto.ts` | List query validator |
| `apps/api/src/modules/payroll/dto/settle-payroll.dto.ts` | Settlement payload validator |
| `apps/api/src/modules/payroll/dto/create-manual-record.dto.ts` | Manual-record payload validator |
| `apps/api/src/modules/payroll/payroll-manual-records.service.ts` | Create / delete manual records + audit |
| `apps/api/src/modules/payroll/payroll-settlements.service.ts` | Create settlement + TOCTOU re-aggregation + rate invariant + audit |
| `apps/api/src/modules/payroll/payroll.service.ts` | List aggregation / row-state / teacher-period course list |
| `apps/api/src/modules/payroll/payroll.controller.ts` | REST surface, `@Roles(SUPER_ADMIN, ADMIN)` everywhere |
| `apps/api/src/modules/payroll/payroll.module.ts` | DI wiring |
| `apps/api/src/app.module.ts` | Register `PayrollModule` |
| `apps/api/src/modules/employees/employees.service.ts` | `remove()` guard also counts `payrollManualRecord` |

**Web — new / modified**

| Path | Role |
| --- | --- |
| `apps/web/src/features/payroll/types.ts` | Front-end payroll types |
| `apps/web/src/services/payroll.ts` | Service wrapper (list / row / courses / settle / manual-add / manual-delete) |
| `apps/web/src/features/payroll/hooks/usePayroll.ts` | List query |
| `apps/web/src/features/payroll/hooks/usePayrollMutations.ts` | settle / addManual / deleteManual |
| `apps/web/src/features/payroll/ViewCoursesDialog.tsx` | 图 17 "查看课程" 弹窗 (spec §7.1) |
| `apps/web/src/features/payroll/SettleDialog.tsx` | 图 19 "结算" 弹窗 (spec §7.2) |
| `apps/web/src/features/payroll/AddManualRecordDialog.tsx` | 手动添加记录弹窗 (spec §8) |
| `apps/web/src/features/payroll/DeleteManualRecordConfirm.tsx` | 删除手动记录二次确认 |
| `apps/web/src/features/payroll/PayrollListPage.tsx` | 图 17 主页面 |
| `apps/web/src/router.tsx` | `/payroll` `ModulePage` → `PayrollListPage` |
| `apps/web/src/styles.css` | `.payroll-toolbar`, `.payroll-money-red` helpers |

---

## Task 1 — Schema: `PayrollManualRecord` + settlement index

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Add index to `PayrollSettlement`**

In `apps/api/prisma/schema.prisma`, replace the existing `PayrollSettlement` block (around line 182-194) with:

```prisma
model PayrollSettlement {
  id                  String   @id @default(cuid())
  operatorPhone       String
  settledAt           DateTime @default(now())
  employeeJobNo       String
  settlementPeriod    String
  hourlyRate          Decimal  @db.Decimal(10, 2)
  deliveredHours      Decimal  @db.Decimal(10, 2)
  extraLabor          Decimal  @db.Decimal(10, 2)
  extraDeduction      Decimal  @db.Decimal(10, 2)
  subtotalPayable     Decimal  @db.Decimal(10, 2)
  subtotalPaid        Decimal  @db.Decimal(10, 2)

  @@index([employeeJobNo, settlementPeriod])
}
```

- [ ] **Step 2: Add `PayrollManualRecord` model**

Append immediately below `PayrollSettlement`:

```prisma
model PayrollManualRecord {
  id                String   @id @default(cuid())
  employeeJobNo     String
  settlementPeriod  String
  extraLabor        Decimal  @db.Decimal(10, 2)
  extraDeduction    Decimal  @db.Decimal(10, 2)
  operatorPhone     String
  createdAt         DateTime @default(now())

  @@index([employeeJobNo, settlementPeriod])
  @@index([settlementPeriod])
}
```

- [ ] **Step 3: Regenerate Prisma client + push schema**

Run from repo root:

```bash
pnpm prisma:generate
pnpm prisma:push
```

Expected tail line: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(prisma)(phase-5): add PayrollManualRecord and settlement aggregate index"
```

---

## Task 2 — `common/payroll/period.ts`

**Files:**
- Create: `apps/api/src/common/payroll/period.ts`

- [ ] **Step 1: Create the helper**

Write `apps/api/src/common/payroll/period.ts`:

```ts
/**
 * `YYYYMM` period string utilities (spec §5 所属年月 / §9.2 / 设计 §4.1).
 *
 * All functions are pure so they can be reused by services, DTOs, and unit
 * tests without a Nest DI context.
 */

export type PeriodParts = { year: number; month: number };

export function formatPeriod(year: number, month: number): string {
  if (month < 1 || month > 12) {
    throw new Error(`月份非法: ${month}`);
  }
  return `${year}${String(month).padStart(2, "0")}`;
}

export function parsePeriod(period: string): PeriodParts | null {
  if (!/^\d{6}$/.test(period)) return null;
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(4, 6));
  if (year < 1900 || year > 2100 || month < 1 || month > 12) return null;
  return { year, month };
}

/** "本月" 快捷 — based on local machine time at call site. */
export function currentMonthPeriod(now: Date = new Date()): string {
  return formatPeriod(now.getFullYear(), now.getMonth() + 1);
}

/** "上月" 快捷. */
export function previousMonthPeriod(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return formatPeriod(d.getFullYear(), d.getMonth() + 1);
}

/** Expand an inclusive range [from, to] of `YYYYMM` into a consecutive list. */
export function periodRangeToList(from: string, to: string): string[] {
  const a = parsePeriod(from);
  const b = parsePeriod(to);
  if (!a || !b) {
    throw new Error(`period 范围格式非法: ${from}-${to}`);
  }
  if (b.year < a.year || (b.year === a.year && b.month < a.month)) {
    throw new Error(`开始月份不能晚于结束月份: ${from}-${to}`);
  }
  const result: string[] = [];
  let y = a.year;
  let m = a.month;
  while (y < b.year || (y === b.year && m <= b.month)) {
    result.push(formatPeriod(y, m));
    m += 1;
    if (m > 12) {
      y += 1;
      m = 1;
    }
    if (result.length > 36) {
      throw new Error("period 区间超过 36 个月,拒绝");
    }
  }
  return result;
}

/**
 * Return a UTC `[start, end)` window covering the given YYYYMM.
 * Used as a Prisma `gte` / `lt` filter against the `plannedAt` DateTime column.
 * The project deploys in Asia/Shanghai (UTC+8); edge-case midnight courses
 * may be off by one month — deferred per design §9.
 */
export function periodBounds(period: string): { start: Date; end: Date } {
  const parts = parsePeriod(period);
  if (!parts) {
    throw new Error(`period 格式非法: ${period}`);
  }
  const start = new Date(Date.UTC(parts.year, parts.month - 1, 1));
  const end = new Date(Date.UTC(parts.year, parts.month, 1));
  return { start, end };
}
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @yanlu/api build
```

Expected: TS clean, `apps/api/dist/common/payroll/period.js` emitted.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/payroll/period.ts
git commit -m "feat(api)(phase-5): add period helpers for YYYYMM parsing, range expansion and UTC bounds"
```

---

## Task 3 — Expand `AuditTargetType`

**Files:**
- Modify: `apps/api/src/modules/audit-logs/audit-logs.types.ts`

- [ ] **Step 1: Add the two payroll target types**

In `apps/api/src/modules/audit-logs/audit-logs.types.ts`, replace the existing `AuditTargetType` union with:

```ts
export type AuditTargetType =
  | "employee"
  | "user"
  | "course"
  | "payroll"
  | "payroll_settlement"
  | "payroll_manual_record"
  | "User"
  | "student"
  | "course_outline_version"
  | "course_outline_item";
```

The existing `"settle"` entry in `AuditAction` is already present — no change needed there.

- [ ] **Step 2: Build**

```bash
pnpm --filter @yanlu/api build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/audit-logs/audit-logs.types.ts
git commit -m "feat(api)(phase-5): register payroll_settlement and payroll_manual_record audit target types"
```

---

## Task 4 — Payroll types + DTOs

**Files:**
- Create: `apps/api/src/modules/payroll/payroll.types.ts`
- Create: `apps/api/src/modules/payroll/dto/query-payroll.dto.ts`
- Create: `apps/api/src/modules/payroll/dto/settle-payroll.dto.ts`
- Create: `apps/api/src/modules/payroll/dto/create-manual-record.dto.ts`

- [ ] **Step 1: Create `payroll.types.ts`**

Write `apps/api/src/modules/payroll/payroll.types.ts`:

```ts
/**
 * Payroll row shapes returned to the web client. "auto" rows are
 * realtime-aggregated from Course + historical PayrollSettlement; "manual"
 * rows are PayrollManualRecord rows. Same (teacher, period) may produce
 * one auto row + zero or more manual rows.
 */

export type PayrollAutoRow = {
  kind: "auto";
  employeeJobNo: string;
  employeeName: string;
  period: string;
  hourlyRate: number | null;
  deliveredHours: number;
  totalCourseFee: number | null;
  extraLabor: number;
  extraDeduction: number;
  subtotalPayable: number | null;
  subtotalPaid: number;
  settlementIds: string[];
};

export type PayrollManualRow = {
  kind: "manual";
  id: string;
  employeeJobNo: string;
  employeeName: string;
  period: string;
  hourlyRate: null;
  deliveredHours: 0;
  totalCourseFee: 0;
  extraLabor: number;
  extraDeduction: number;
  subtotalPayable: number;
  subtotalPaid: 0;
  createdAt: string;
};

export type PayrollRow = PayrollAutoRow | PayrollManualRow;

export type PayrollListResponse = {
  items: PayrollRow[];
  total: number;
};

export type PayrollRowState = {
  employeeJobNo: string;
  employeeName: string;
  period: string;
  hourlyRate: number | null;
  deliveredHours: number;
  payable: number | null;
  alreadyPaid: number;
};

export type PayrollCourseItem = {
  id: string;
  courseNo: string;
  name: string;
  plannedAt: string | null;
  creditHours: number | null;
  durationMinutes: number | null;
  actualTeachingType: string | null;
  enrolledStudentCount: number;
};
```

- [ ] **Step 2: Create `dto/query-payroll.dto.ts`**

Write `apps/api/src/modules/payroll/dto/query-payroll.dto.ts`:

```ts
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class QueryPayrollDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: "from 必须是 YYYYMM" })
  from!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "to 必须是 YYYYMM" })
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  keyword?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  unpaidOnly?: boolean;
}
```

- [ ] **Step 3: Create `dto/settle-payroll.dto.ts`**

Write `apps/api/src/modules/payroll/dto/settle-payroll.dto.ts`:

```ts
import { IsNumberString, IsString, Matches } from "class-validator";

export class SettlePayrollDto {
  @IsString()
  @Matches(/^\d{5}$/, { message: "employeeJobNo 必须是 5 位工号" })
  employeeJobNo!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "settlementPeriod 必须是 YYYYMM" })
  settlementPeriod!: string;

  /** Required on every submit. If the month already has settlements, must equal the existing rate. */
  @IsNumberString()
  hourlyRate!: string;

  /** Amount paid in this one settlement event. */
  @IsNumberString()
  paidAmount!: string;

  @IsNumberString()
  extraLabor!: string;

  @IsNumberString()
  extraDeduction!: string;
}
```

- [ ] **Step 4: Create `dto/create-manual-record.dto.ts`**

Write `apps/api/src/modules/payroll/dto/create-manual-record.dto.ts`:

```ts
import { IsNumberString, IsString, Matches } from "class-validator";

export class CreateManualRecordDto {
  @IsString()
  @Matches(/^\d{5}$/, { message: "employeeJobNo 必须是 5 位工号" })
  employeeJobNo!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "settlementPeriod 必须是 YYYYMM" })
  settlementPeriod!: string;

  @IsNumberString()
  extraLabor!: string;

  @IsNumberString()
  extraDeduction!: string;
}
```

- [ ] **Step 5: Build**

```bash
pnpm --filter @yanlu/api build
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/payroll/payroll.types.ts apps/api/src/modules/payroll/dto
git commit -m "feat(api)(phase-5): add payroll types and DTOs for list/settle/manual-record"
```

---

## Task 5 — `payroll-manual-records.service.ts`

**Files:**
- Create: `apps/api/src/modules/payroll/payroll-manual-records.service.ts`

- [ ] **Step 1: Write the service**

Write `apps/api/src/modules/payroll/payroll-manual-records.service.ts`:

```ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PayrollManualRecord } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import type { AuthUser } from "../auth/auth.types";
import { CreateManualRecordDto } from "./dto/create-manual-record.dto";

@Injectable()
export class PayrollManualRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(
    dto: CreateManualRecordDto,
    operator: AuthUser,
  ): Promise<PayrollManualRecord> {
    const emp = await this.prisma.employee.findUnique({
      where: { jobNo: dto.employeeJobNo },
      select: { jobNo: true },
    });
    if (!emp) {
      throw new BadRequestException("指定员工不存在");
    }

    const extraLabor = Number(dto.extraLabor);
    const extraDeduction = Number(dto.extraDeduction);
    if (!Number.isFinite(extraLabor) || !Number.isFinite(extraDeduction)) {
      throw new BadRequestException("金额字段必须是数字");
    }
    if (extraLabor <= 0) {
      throw new BadRequestException("其他劳务必须大于 0");
    }
    if (extraLabor === extraDeduction) {
      throw new BadRequestException("其他扣除不得等于其他劳务");
    }

    const created = await this.prisma.payrollManualRecord.create({
      data: {
        employeeJobNo: dto.employeeJobNo,
        settlementPeriod: dto.settlementPeriod,
        extraLabor,
        extraDeduction,
        operatorPhone: operator.phone,
      },
    });

    await this.auditLogs.record({
      operatorId: operator.id,
      action: "create",
      targetType: "payroll_manual_record",
      targetId: created.id,
      after: this.snapshot(created),
    });

    return created;
  }

  async remove(id: string, operator: AuthUser): Promise<void> {
    const before = await this.prisma.payrollManualRecord.findUnique({
      where: { id },
    });
    if (!before) {
      throw new NotFoundException("手动记录不存在");
    }

    await this.prisma.payrollManualRecord.delete({ where: { id } });

    await this.auditLogs.record({
      operatorId: operator.id,
      action: "delete",
      targetType: "payroll_manual_record",
      targetId: id,
      before: this.snapshot(before),
    });
  }

  private snapshot(record: PayrollManualRecord): Record<string, unknown> {
    return {
      employeeJobNo: record.employeeJobNo,
      settlementPeriod: record.settlementPeriod,
      extraLabor: record.extraLabor.toString(),
      extraDeduction: record.extraDeduction.toString(),
      operatorPhone: record.operatorPhone,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @yanlu/api build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/payroll/payroll-manual-records.service.ts
git commit -m "feat(api)(phase-5): add payroll manual records service with audit logging"
```

---

## Task 6 — `payroll-settlements.service.ts`

**Files:**
- Create: `apps/api/src/modules/payroll/payroll-settlements.service.ts`

- [ ] **Step 1: Write the service**

Write `apps/api/src/modules/payroll/payroll-settlements.service.ts`:

```ts
import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { PayrollSettlement } from "@prisma/client";
import { periodBounds } from "../../common/payroll/period";
import { computeCreditHours } from "../../common/course-no/course-status";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import type { AuthUser } from "../auth/auth.types";
import { SettlePayrollDto } from "./dto/settle-payroll.dto";

/** Float tolerance so settlements that are numerically "right at the cap"
 * don't get falsely rejected by a binary-FP rounding error. */
const FLOAT_EPS = 1e-6;

@Injectable()
export class PayrollSettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(
    dto: SettlePayrollDto,
    operator: AuthUser,
  ): Promise<PayrollSettlement> {
    // 1. Re-aggregate deliveredHours now (TOCTOU safe: we read from the
    //    authoritative Course table rather than trusting a client-supplied value).
    const bounds = periodBounds(dto.settlementPeriod);
    const courses = await this.prisma.course.findMany({
      where: {
        actualTeacherJobNo: dto.employeeJobNo,
        durationMinutes: { not: null },
        plannedAt: { gte: bounds.start, lt: bounds.end },
      },
      select: { durationMinutes: true },
    });
    const deliveredHours = courses.reduce(
      (acc, c) => acc + (computeCreditHours(c.durationMinutes) ?? 0),
      0,
    );

    // 2. Enforce the "one rate per (teacher, period)" invariant (spec §9.2).
    const history = await this.prisma.payrollSettlement.findMany({
      where: {
        employeeJobNo: dto.employeeJobNo,
        settlementPeriod: dto.settlementPeriod,
      },
      select: { hourlyRate: true, subtotalPaid: true },
    });

    const newRate = Number(dto.hourlyRate);
    if (!Number.isFinite(newRate) || newRate <= 0) {
      throw new BadRequestException("单位课时费必须大于 0");
    }
    if (history.length > 0) {
      const existingRate = Number(history[0].hourlyRate);
      if (Math.abs(newRate - existingRate) > FLOAT_EPS) {
        throw new BadRequestException(
          `该月单位课时费已为 ${existingRate} 元,不得更改`,
        );
      }
    }

    const extraLabor = Number(dto.extraLabor);
    const extraDeduction = Number(dto.extraDeduction);
    const paidAmount = Number(dto.paidAmount);
    if (
      !Number.isFinite(extraLabor) ||
      !Number.isFinite(extraDeduction) ||
      !Number.isFinite(paidAmount)
    ) {
      throw new BadRequestException("金额字段必须是数字");
    }
    if (paidAmount <= 0) {
      throw new BadRequestException("本次结算金额必须大于 0");
    }

    const payable = newRate * deliveredHours + extraLabor - extraDeduction;
    const alreadyPaid = history.reduce(
      (s, h) => s + Number(h.subtotalPaid),
      0,
    );
    if (paidAmount > payable - alreadyPaid + FLOAT_EPS) {
      throw new BadRequestException(
        `本次结算金额超出剩余应结算 ${(payable - alreadyPaid).toFixed(2)} 元`,
      );
    }

    const created = await this.prisma.payrollSettlement.create({
      data: {
        operatorPhone: operator.phone,
        employeeJobNo: dto.employeeJobNo,
        settlementPeriod: dto.settlementPeriod,
        hourlyRate: newRate,
        deliveredHours,
        extraLabor,
        extraDeduction,
        subtotalPayable: payable,
        subtotalPaid: paidAmount,
      },
    });

    await this.auditLogs.record({
      operatorId: operator.id,
      action: "settle",
      targetType: "payroll_settlement",
      targetId: created.id,
      after: this.snapshot(created),
    });

    return created;
  }

  private snapshot(s: PayrollSettlement): Record<string, unknown> {
    return {
      employeeJobNo: s.employeeJobNo,
      settlementPeriod: s.settlementPeriod,
      hourlyRate: s.hourlyRate.toString(),
      deliveredHours: s.deliveredHours.toString(),
      extraLabor: s.extraLabor.toString(),
      extraDeduction: s.extraDeduction.toString(),
      subtotalPayable: s.subtotalPayable.toString(),
      subtotalPaid: s.subtotalPaid.toString(),
      operatorPhone: s.operatorPhone,
      settledAt: s.settledAt.toISOString(),
    };
  }
}
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @yanlu/api build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/payroll/payroll-settlements.service.ts
git commit -m "feat(api)(phase-5): add payroll settlements service with per-month rate invariant and audit"
```

---

## Task 7 — `payroll.service.ts` aggregation

**Files:**
- Create: `apps/api/src/modules/payroll/payroll.service.ts`

- [ ] **Step 1: Write the service**

Write `apps/api/src/modules/payroll/payroll.service.ts`:

```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PayrollManualRecord } from "@prisma/client";
import {
  computeCreditHours,
} from "../../common/course-no/course-status";
import {
  formatPeriod,
  periodBounds,
  periodRangeToList,
} from "../../common/payroll/period";
import { PrismaService } from "../../prisma/prisma.service";
import { QueryPayrollDto } from "./dto/query-payroll.dto";
import type {
  PayrollAutoRow,
  PayrollCourseItem,
  PayrollListResponse,
  PayrollManualRow,
  PayrollRow,
  PayrollRowState,
} from "./payroll.types";

type AutoAggregate = {
  jobNo: string;
  period: string;
  hours: number;
};

type SettlementAggregate = {
  jobNo: string;
  period: string;
  rate: number;
  sumPaid: number;
  settlementIds: string[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryPayrollDto): Promise<PayrollListResponse> {
    const periods = periodRangeToList(query.from, query.to);

    const [autoMap, settlementMap, manuals] = await Promise.all([
      this.aggregateAutoHours(periods),
      this.aggregateSettlements(periods),
      this.listManualRecords(periods),
    ]);

    const allJobNos = new Set<string>();
    autoMap.forEach((v) => allJobNos.add(v.jobNo));
    settlementMap.forEach((v) => allJobNos.add(v.jobNo));
    manuals.forEach((m) => allJobNos.add(m.employeeJobNo));

    const employees = allJobNos.size
      ? await this.prisma.employee.findMany({
          where: { jobNo: { in: [...allJobNos] } },
          select: { jobNo: true, name: true },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.jobNo, e.name]));

    // Auto rows: one per (teacher, period) we actually saw course hours for,
    // plus any (teacher, period) that has historical settlements even if no
    // courses fell in this window (keeps paid history visible).
    const autoKeys = new Set<string>(autoMap.keys());
    settlementMap.forEach((_, key) => autoKeys.add(key));

    const autoRows: PayrollAutoRow[] = [];
    for (const key of autoKeys) {
      const hours = autoMap.get(key);
      const s = settlementMap.get(key);
      const [jobNo, period] = (hours?.jobNo && hours?.period)
        ? [hours.jobNo, hours.period]
        : s
          ? [s.jobNo, s.period]
          : ["", ""];
      if (!jobNo) continue;
      const deliveredHours = round2(hours?.hours ?? 0);
      const rate = s?.rate ?? null;
      const totalFee = rate != null ? round2(rate * deliveredHours) : null;
      autoRows.push({
        kind: "auto",
        employeeJobNo: jobNo,
        employeeName:
          empMap.get(jobNo) ?? `(工号 ${jobNo} 已不存在)`,
        period,
        hourlyRate: rate,
        deliveredHours,
        totalCourseFee: totalFee,
        extraLabor: 0,
        extraDeduction: 0,
        subtotalPayable: totalFee,
        subtotalPaid: round2(s?.sumPaid ?? 0),
        settlementIds: s?.settlementIds ?? [],
      });
    }

    const manualRows: PayrollManualRow[] = manuals.map((m) => {
      const extraLabor = Number(m.extraLabor);
      const extraDeduction = Number(m.extraDeduction);
      return {
        kind: "manual",
        id: m.id,
        employeeJobNo: m.employeeJobNo,
        employeeName:
          empMap.get(m.employeeJobNo) ??
          `(工号 ${m.employeeJobNo} 已不存在)`,
        period: m.settlementPeriod,
        hourlyRate: null,
        deliveredHours: 0,
        totalCourseFee: 0,
        extraLabor: round2(extraLabor),
        extraDeduction: round2(extraDeduction),
        subtotalPayable: round2(extraLabor - extraDeduction),
        subtotalPaid: 0,
        createdAt: m.createdAt.toISOString(),
      };
    });

    const kw = query.keyword?.trim();
    const filterByKw = (row: PayrollRow) => {
      if (!kw) return true;
      const lower = kw.toLowerCase();
      return (
        row.employeeJobNo.includes(kw) ||
        row.employeeName.toLowerCase().includes(lower)
      );
    };

    const filterUnpaid = (row: PayrollRow) => {
      if (!query.unpaidOnly) return true;
      if (row.kind === "manual") return true;
      if (row.subtotalPayable == null) return true;
      return row.subtotalPaid < row.subtotalPayable - 1e-6;
    };

    const items: PayrollRow[] = [...autoRows, ...manualRows]
      .filter(filterByKw)
      .filter(filterUnpaid)
      .sort((a, b) => {
        const byName = a.employeeName.localeCompare(
          b.employeeName,
          "zh-Hans-CN",
          { sensitivity: "base" },
        );
        if (byName !== 0) return byName;
        if (a.kind !== b.kind) return a.kind === "auto" ? -1 : 1;
        if (a.period !== b.period) return a.period.localeCompare(b.period);
        if (a.kind === "manual" && b.kind === "manual") {
          return a.createdAt.localeCompare(b.createdAt);
        }
        return 0;
      });

    return { items, total: items.length };
  }

  async getRowState(
    teacherJobNo: string,
    period: string,
  ): Promise<PayrollRowState> {
    const emp = await this.prisma.employee.findUnique({
      where: { jobNo: teacherJobNo },
      select: { jobNo: true, name: true },
    });
    if (!emp) {
      throw new NotFoundException("员工不存在");
    }

    const bounds = periodBounds(period);
    const [courses, settlements] = await Promise.all([
      this.prisma.course.findMany({
        where: {
          actualTeacherJobNo: teacherJobNo,
          durationMinutes: { not: null },
          plannedAt: { gte: bounds.start, lt: bounds.end },
        },
        select: { durationMinutes: true },
      }),
      this.prisma.payrollSettlement.findMany({
        where: { employeeJobNo: teacherJobNo, settlementPeriod: period },
        select: { hourlyRate: true, subtotalPaid: true },
      }),
    ]);

    const deliveredHours = round2(
      courses.reduce(
        (acc, c) => acc + (computeCreditHours(c.durationMinutes) ?? 0),
        0,
      ),
    );
    const rate = settlements.length
      ? Number(settlements[0].hourlyRate)
      : null;
    const payable = rate != null ? round2(rate * deliveredHours) : null;
    const alreadyPaid = round2(
      settlements.reduce((s, h) => s + Number(h.subtotalPaid), 0),
    );

    return {
      employeeJobNo: teacherJobNo,
      employeeName: emp.name,
      period,
      hourlyRate: rate,
      deliveredHours,
      payable,
      alreadyPaid,
    };
  }

  async listCoursesForTeacherPeriod(
    teacherJobNo: string,
    period: string,
  ): Promise<PayrollCourseItem[]> {
    const bounds = periodBounds(period);
    const rows = await this.prisma.course.findMany({
      where: {
        actualTeacherJobNo: teacherJobNo,
        durationMinutes: { not: null },
        plannedAt: { gte: bounds.start, lt: bounds.end },
      },
      orderBy: [{ plannedAt: "asc" }],
      include: { _count: { select: { enrollments: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      courseNo: r.courseNo,
      name: r.name,
      plannedAt: r.plannedAt ? r.plannedAt.toISOString() : null,
      durationMinutes: r.durationMinutes,
      creditHours: computeCreditHours(r.durationMinutes),
      actualTeachingType: r.actualTeachingType,
      enrolledStudentCount: r._count.enrollments,
    }));
  }

  private async aggregateAutoHours(
    periods: string[],
  ): Promise<Map<string, AutoAggregate>> {
    if (periods.length === 0) return new Map();
    const first = periodBounds(periods[0]);
    const last = periodBounds(periods[periods.length - 1]);

    const courses = await this.prisma.course.findMany({
      where: {
        actualTeacherJobNo: { not: null },
        durationMinutes: { not: null },
        plannedAt: { gte: first.start, lt: last.end },
      },
      select: {
        actualTeacherJobNo: true,
        plannedAt: true,
        durationMinutes: true,
      },
    });

    const map = new Map<string, AutoAggregate>();
    const periodSet = new Set(periods);
    for (const c of courses) {
      if (!c.actualTeacherJobNo || !c.plannedAt) continue;
      const y = c.plannedAt.getUTCFullYear();
      const m = c.plannedAt.getUTCMonth() + 1;
      const p = formatPeriod(y, m);
      if (!periodSet.has(p)) continue;
      const key = `${c.actualTeacherJobNo}::${p}`;
      const prev = map.get(key) ?? {
        jobNo: c.actualTeacherJobNo,
        period: p,
        hours: 0,
      };
      prev.hours += computeCreditHours(c.durationMinutes) ?? 0;
      map.set(key, prev);
    }
    return map;
  }

  private async aggregateSettlements(
    periods: string[],
  ): Promise<Map<string, SettlementAggregate>> {
    if (periods.length === 0) return new Map();
    const rows = await this.prisma.payrollSettlement.findMany({
      where: { settlementPeriod: { in: periods } },
      orderBy: { settledAt: "asc" },
    });
    const map = new Map<string, SettlementAggregate>();
    for (const s of rows) {
      const key = `${s.employeeJobNo}::${s.settlementPeriod}`;
      const cur = map.get(key) ?? {
        jobNo: s.employeeJobNo,
        period: s.settlementPeriod,
        rate: Number(s.hourlyRate),
        sumPaid: 0,
        settlementIds: [] as string[],
      };
      cur.rate = Number(s.hourlyRate);
      cur.sumPaid += Number(s.subtotalPaid);
      cur.settlementIds.push(s.id);
      map.set(key, cur);
    }
    return map;
  }

  private async listManualRecords(
    periods: string[],
  ): Promise<PayrollManualRecord[]> {
    return this.prisma.payrollManualRecord.findMany({
      where: { settlementPeriod: { in: periods } },
      orderBy: { createdAt: "asc" },
    });
  }
}
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @yanlu/api build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/payroll/payroll.service.ts
git commit -m "feat(api)(phase-5): add payroll aggregation service (list / row state / teacher period courses)"
```

---

## Task 8 — Controller + module + `app.module.ts`

**Files:**
- Create: `apps/api/src/modules/payroll/payroll.controller.ts`
- Create: `apps/api/src/modules/payroll/payroll.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Write controller**

Write `apps/api/src/modules/payroll/payroll.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { CreateManualRecordDto } from "./dto/create-manual-record.dto";
import { QueryPayrollDto } from "./dto/query-payroll.dto";
import { SettlePayrollDto } from "./dto/settle-payroll.dto";
import { PayrollManualRecordsService } from "./payroll-manual-records.service";
import { PayrollService } from "./payroll.service";
import { PayrollSettlementsService } from "./payroll-settlements.service";

@Controller("payroll")
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly settlements: PayrollSettlementsService,
    private readonly manuals: PayrollManualRecordsService,
  ) {}

  @Get()
  list(@Query() query: QueryPayrollDto) {
    return this.payroll.list(query);
  }

  @Get("row/:jobNo/:period")
  rowState(
    @Param("jobNo") jobNo: string,
    @Param("period") period: string,
  ) {
    return this.payroll.getRowState(jobNo, period);
  }

  @Get("courses")
  coursesForTeacherPeriod(
    @Query("teacherJobNo") teacherJobNo: string,
    @Query("period") period: string,
  ) {
    return this.payroll.listCoursesForTeacherPeriod(teacherJobNo, period);
  }

  @Post("settlements")
  createSettlement(
    @Body() dto: SettlePayrollDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.settlements.create(dto, operator);
  }

  @Post("manual-records")
  createManualRecord(
    @Body() dto: CreateManualRecordDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.manuals.create(dto, operator);
  }

  @Delete("manual-records/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteManualRecord(
    @Param("id") id: string,
    @CurrentUser() operator: AuthUser,
  ) {
    await this.manuals.remove(id, operator);
  }
}
```

- [ ] **Step 2: Write module**

Write `apps/api/src/modules/payroll/payroll.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { PayrollController } from "./payroll.controller";
import { PayrollManualRecordsService } from "./payroll-manual-records.service";
import { PayrollService } from "./payroll.service";
import { PayrollSettlementsService } from "./payroll-settlements.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [PayrollController],
  providers: [
    PayrollService,
    PayrollSettlementsService,
    PayrollManualRecordsService,
  ],
})
export class PayrollModule {}
```

- [ ] **Step 3: Register module in `app.module.ts`**

Open `apps/api/src/app.module.ts`. Add the import line alongside the other module imports (after line 18 `import { CoursesModule } from "./modules/courses/courses.module";`):

```ts
import { PayrollModule } from "./modules/payroll/payroll.module";
```

Then add `PayrollModule,` to the `imports` array — place it right after `CoursesModule,`:

```ts
    CoursesModule,
    PayrollModule,
```

- [ ] **Step 4: Build**

```bash
pnpm --filter @yanlu/api build
```

Expected: clean.

- [ ] **Step 5: Smoke test with running API**

In one shell:

```bash
pnpm dev:api
```

In another, log in to obtain an access token first (skip if you already have one in `ACCESS_TOKEN`):

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"<super admin phone>","password":"<password>"}'
```

Extract `accessToken` from the response. Then hit the list endpoint for the current month:

```bash
PERIOD=$(date +%Y%m)
curl -s "http://localhost:3000/api/payroll?from=${PERIOD}&to=${PERIOD}" \
  -H "Authorization: Bearer <accessToken>" | head -c 400
```

Expected: a JSON payload like `{"items":[],"total":0}` (or rows if there are already courses + teachers in the DB). Status 200.

Also probe the role guard — a MEMBER token should get 403:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:3000/api/payroll?from=${PERIOD}&to=${PERIOD}" \
  -H "Authorization: Bearer <member accessToken>"
```

Expected: `403`.

Stop the API with Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/payroll/payroll.controller.ts \
        apps/api/src/modules/payroll/payroll.module.ts \
        apps/api/src/app.module.ts
git commit -m "feat(api)(phase-5): mount PayrollModule (list / row / courses / settle / manual records)"
```

---

## Task 9 — Extend employees delete guard

**Files:**
- Modify: `apps/api/src/modules/employees/employees.service.ts`

- [ ] **Step 1: Include `payrollManualRecord.count` in the `remove` guard**

In `apps/api/src/modules/employees/employees.service.ts`, locate the `remove` method (around line 242-268). Replace the `$transaction` block and the `if (... > 0)` check with:

```ts
    const [payrollCount, manualRecordCount, courseCount, counselorCount, plannerCount] =
      await this.prisma.$transaction([
        this.prisma.payrollSettlement.count({ where: { employeeJobNo: before.jobNo } }),
        this.prisma.payrollManualRecord.count({ where: { employeeJobNo: before.jobNo } }),
        this.prisma.course.count({ where: { actualTeacherJobNo: before.jobNo } }),
        this.prisma.student.count({ where: { counselorJobNo: before.jobNo } }),
        this.prisma.student.count({ where: { plannerJobNo: before.jobNo } }),
      ]);

    if (
      payrollCount + manualRecordCount + courseCount + counselorCount + plannerCount >
      0
    ) {
      throw new ConflictException(
        "该员工有关联学生/薪酬/课程，不可删除，请将状态改为已离职",
      );
    }
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @yanlu/api build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/employees/employees.service.ts
git commit -m "feat(api)(phase-5): block employee delete when payroll_manual_record references exist"
```

---

## Task 10 — Frontend types + service

**Files:**
- Create: `apps/web/src/features/payroll/types.ts`
- Create: `apps/web/src/services/payroll.ts`

- [ ] **Step 1: Create `types.ts`**

Write `apps/web/src/features/payroll/types.ts`:

```ts
export type PayrollAutoRow = {
  kind: "auto";
  employeeJobNo: string;
  employeeName: string;
  period: string;
  hourlyRate: number | null;
  deliveredHours: number;
  totalCourseFee: number | null;
  extraLabor: number;
  extraDeduction: number;
  subtotalPayable: number | null;
  subtotalPaid: number;
  settlementIds: string[];
};

export type PayrollManualRow = {
  kind: "manual";
  id: string;
  employeeJobNo: string;
  employeeName: string;
  period: string;
  hourlyRate: null;
  deliveredHours: 0;
  totalCourseFee: 0;
  extraLabor: number;
  extraDeduction: number;
  subtotalPayable: number;
  subtotalPaid: 0;
  createdAt: string;
};

export type PayrollRow = PayrollAutoRow | PayrollManualRow;

export type PayrollListResponse = {
  items: PayrollRow[];
  total: number;
};

export type PayrollRowState = {
  employeeJobNo: string;
  employeeName: string;
  period: string;
  hourlyRate: number | null;
  deliveredHours: number;
  payable: number | null;
  alreadyPaid: number;
};

export type PayrollCourseItem = {
  id: string;
  courseNo: string;
  name: string;
  plannedAt: string | null;
  creditHours: number | null;
  durationMinutes: number | null;
  actualTeachingType: string | null;
  enrolledStudentCount: number;
};

export type PayrollQueryParams = {
  from: string;
  to: string;
  keyword?: string;
  unpaidOnly?: boolean;
};

export type SettlePayrollBody = {
  employeeJobNo: string;
  settlementPeriod: string;
  hourlyRate: string;
  paidAmount: string;
  extraLabor: string;
  extraDeduction: string;
};

export type CreateManualRecordBody = {
  employeeJobNo: string;
  settlementPeriod: string;
  extraLabor: string;
  extraDeduction: string;
};

export type PayrollRangeMode = "current" | "previous" | "custom";
```

- [ ] **Step 2: Create `services/payroll.ts`**

Write `apps/web/src/services/payroll.ts`:

```ts
import { api } from "./http";
import type {
  CreateManualRecordBody,
  PayrollCourseItem,
  PayrollListResponse,
  PayrollQueryParams,
  PayrollRowState,
  SettlePayrollBody,
} from "../features/payroll/types";

function toQuery(params: PayrollQueryParams): string {
  const search = new URLSearchParams();
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== "") {
      search.set(k, String(v));
    }
  };
  set("from", params.from);
  set("to", params.to);
  set("keyword", params.keyword);
  set("unpaidOnly", params.unpaidOnly ? "true" : undefined);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const payrollApi = {
  list: (params: PayrollQueryParams) =>
    api.get<PayrollListResponse>(`/payroll${toQuery(params)}`),
  rowState: (jobNo: string, period: string) =>
    api.get<PayrollRowState>(
      `/payroll/row/${encodeURIComponent(jobNo)}/${encodeURIComponent(period)}`,
    ),
  coursesForTeacherPeriod: (teacherJobNo: string, period: string) =>
    api.get<PayrollCourseItem[]>(
      `/payroll/courses?teacherJobNo=${encodeURIComponent(teacherJobNo)}&period=${encodeURIComponent(period)}`,
    ),
  settle: (body: SettlePayrollBody) =>
    api.post<unknown>(`/payroll/settlements`, body),
  addManual: (body: CreateManualRecordBody) =>
    api.post<unknown>(`/payroll/manual-records`, body),
  deleteManual: (id: string) =>
    api.delete<void>(`/payroll/manual-records/${encodeURIComponent(id)}`),
};
```

- [ ] **Step 3: Build**

```bash
pnpm --filter @yanlu/web build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/payroll/types.ts apps/web/src/services/payroll.ts
git commit -m "feat(web)(phase-5): add payroll types and service wrapper"
```

---

## Task 11 — Frontend hooks

**Files:**
- Create: `apps/web/src/features/payroll/hooks/usePayroll.ts`
- Create: `apps/web/src/features/payroll/hooks/usePayrollMutations.ts`

- [ ] **Step 1: Create `usePayroll.ts`**

Write `apps/web/src/features/payroll/hooks/usePayroll.ts`:

```ts
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { payrollApi } from "../../../services/payroll";
import type { PayrollQueryParams } from "../types";

export const payrollKey = (params: PayrollQueryParams) =>
  ["payroll", params] as const;

export function usePayroll(params: PayrollQueryParams) {
  return useQuery({
    queryKey: payrollKey(params),
    queryFn: () => payrollApi.list(params),
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 2: Create `usePayrollMutations.ts`**

Write `apps/web/src/features/payroll/hooks/usePayrollMutations.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "antd";
import { payrollApi } from "../../../services/payroll";
import type {
  CreateManualRecordBody,
  SettlePayrollBody,
} from "../types";

export function usePayrollMutations() {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["payroll"] });

  const settle = useMutation({
    mutationFn: (body: SettlePayrollBody) => payrollApi.settle(body),
    onSuccess: () => {
      invalidate();
      message.success("结算已记录");
    },
    onError: (err: Error) => message.error(err.message || "结算失败"),
  });

  const addManual = useMutation({
    mutationFn: (body: CreateManualRecordBody) => payrollApi.addManual(body),
    onSuccess: () => {
      invalidate();
      message.success("已添加手动记录");
    },
    onError: (err: Error) => message.error(err.message || "添加失败"),
  });

  const deleteManual = useMutation({
    mutationFn: (id: string) => payrollApi.deleteManual(id),
    onSuccess: () => {
      invalidate();
      message.success("手动记录已删除");
    },
    onError: (err: Error) => message.error(err.message || "删除失败"),
  });

  return { settle, addManual, deleteManual };
}
```

- [ ] **Step 3: Build**

```bash
pnpm --filter @yanlu/web build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/payroll/hooks
git commit -m "feat(web)(phase-5): add usePayroll and usePayrollMutations hooks"
```

---

## Task 12 — `ViewCoursesDialog`

**Files:**
- Create: `apps/web/src/features/payroll/ViewCoursesDialog.tsx`

- [ ] **Step 1: Write the component**

Write `apps/web/src/features/payroll/ViewCoursesDialog.tsx`:

```tsx
import { Empty, Modal, Table } from "antd";
import { useQuery } from "@tanstack/react-query";
import { payrollApi } from "../../services/payroll";
import type { PayrollCourseItem } from "./types";

type Props = {
  open: boolean;
  teacherJobNo: string;
  teacherName: string;
  period: string;
  onClose: () => void;
};

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

export function ViewCoursesDialog({
  open,
  teacherJobNo,
  teacherName,
  period,
  onClose,
}: Props) {
  const q = useQuery({
    queryKey: ["payroll", "courses", teacherJobNo, period],
    queryFn: () => payrollApi.coursesForTeacherPeriod(teacherJobNo, period),
    enabled: open && Boolean(teacherJobNo) && Boolean(period),
  });

  const columns = [
    { title: "课程编号", dataIndex: "courseNo", width: 140 },
    { title: "课程名称", dataIndex: "name" },
    {
      title: "计划时间",
      dataIndex: "plannedAt",
      width: 180,
      render: (v: string | null) => formatDateTime(v),
    },
    {
      title: "课时",
      dataIndex: "creditHours",
      width: 100,
      render: (v: number | null) => (v == null ? "—" : v.toFixed(2)),
    },
    {
      title: "学生数",
      dataIndex: "enrolledStudentCount",
      width: 90,
    },
    {
      title: "授课方式",
      dataIndex: "actualTeachingType",
      width: 110,
      render: (v: string | null) => v ?? "—",
    },
  ];

  return (
    <Modal
      open={open}
      title={`${teacherName} · ${period} 课程`}
      width={900}
      footer={null}
      onCancel={onClose}
      destroyOnClose
    >
      <Table<PayrollCourseItem>
        rowKey="id"
        loading={q.isLoading}
        dataSource={q.data ?? []}
        columns={columns}
        pagination={false}
        locale={{ emptyText: <Empty description="当月无已完成课程" /> }}
      />
    </Modal>
  );
}
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @yanlu/web build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/payroll/ViewCoursesDialog.tsx
git commit -m "feat(web)(phase-5): add ViewCoursesDialog listing teacher's completed courses in period"
```

---

## Task 13 — `SettleDialog`

**Files:**
- Create: `apps/web/src/features/payroll/SettleDialog.tsx`

- [ ] **Step 1: Write the component**

Write `apps/web/src/features/payroll/SettleDialog.tsx`:

```tsx
import {
  Alert,
  Descriptions,
  Form,
  InputNumber,
  Modal,
  Skeleton,
} from "antd";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { payrollApi } from "../../services/payroll";
import { usePayrollMutations } from "./hooks/usePayrollMutations";

type Props = {
  open: boolean;
  teacherJobNo: string;
  teacherName: string;
  period: string;
  onClose: () => void;
};

type FormValues = {
  hourlyRate?: number;
  paidAmount?: number;
};

export function SettleDialog({
  open,
  teacherJobNo,
  teacherName,
  period,
  onClose,
}: Props) {
  const [form] = Form.useForm<FormValues>();
  const { settle } = usePayrollMutations();

  const stateQ = useQuery({
    queryKey: ["payroll", "row", teacherJobNo, period],
    queryFn: () => payrollApi.rowState(teacherJobNo, period),
    enabled: open && Boolean(teacherJobNo) && Boolean(period),
  });

  const state = stateQ.data;
  const rateLocked = state?.hourlyRate != null;
  const maxAmount =
    state?.payable != null
      ? Math.max(0, Number((state.payable - state.alreadyPaid).toFixed(2)))
      : undefined;

  // Keep form in sync with the row state the dialog just loaded. Otherwise
  // a locked rate never gets written to the form value on first open.
  useEffect(() => {
    if (!open) return;
    if (rateLocked && state?.hourlyRate != null) {
      form.setFieldsValue({ hourlyRate: state.hourlyRate });
    }
  }, [open, rateLocked, state?.hourlyRate, form]);

  const onSubmit = async () => {
    const values = await form.validateFields();
    const rate = rateLocked
      ? state!.hourlyRate!
      : (values.hourlyRate as number);

    await settle.mutateAsync({
      employeeJobNo: teacherJobNo,
      settlementPeriod: period,
      hourlyRate: String(rate),
      paidAmount: String(values.paidAmount),
      extraLabor: "0",
      extraDeduction: "0",
    });
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      open={open}
      title="课时费结算"
      width={520}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      onOk={onSubmit}
      okText="提交"
      cancelText="取消"
      confirmLoading={settle.isPending}
      destroyOnClose
    >
      {stateQ.isLoading || !state ? (
        <Skeleton active />
      ) : (
        <>
          <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="老师">{teacherName}</Descriptions.Item>
            <Descriptions.Item label="所属年月">{period}</Descriptions.Item>
            <Descriptions.Item label="已授课时">
              {state.deliveredHours.toFixed(2)}
            </Descriptions.Item>
            <Descriptions.Item label="应结算总额">
              {state.payable != null
                ? `${state.payable.toFixed(2)} 元`
                : "— 元"}
            </Descriptions.Item>
            <Descriptions.Item label="此前已结算">
              {state.alreadyPaid.toFixed(2)} 元
            </Descriptions.Item>
          </Descriptions>

          {rateLocked ? (
            <Alert
              style={{ marginBottom: 12 }}
              type="info"
              showIcon
              message={`该月单位课时费已确定为 ${state.hourlyRate} 元/课时,不得修改`}
            />
          ) : (
            <Alert
              style={{ marginBottom: 12 }}
              type="warning"
              showIcon
              message="该月首次结算,请先输入单位课时费(确定后同月内不可再改)"
            />
          )}

          <Form<FormValues> form={form} layout="vertical">
            {!rateLocked ? (
              <Form.Item
                name="hourlyRate"
                label="单位课时费"
                rules={[
                  { required: true, message: "请输入单位课时费" },
                  {
                    validator: (_, value) =>
                      value == null || value > 0
                        ? Promise.resolve()
                        : Promise.reject(new Error("单位课时费必须大于 0")),
                  },
                ]}
              >
                <InputNumber
                  addonAfter="元/课时"
                  precision={2}
                  min={0.01}
                  style={{ width: "100%" }}
                  autoFocus
                />
              </Form.Item>
            ) : null}

            <Form.Item
              name="paidAmount"
              label="本次结算金额"
              rules={[
                { required: true, message: "请输入本次结算金额" },
                {
                  validator: (_, value) => {
                    if (value == null || value <= 0) {
                      return Promise.reject(
                        new Error("本次结算金额必须大于 0"),
                      );
                    }
                    if (maxAmount != null && value > maxAmount) {
                      return Promise.reject(
                        new Error(`最多可结算 ${maxAmount.toFixed(2)} 元`),
                      );
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <InputNumber
                addonAfter="元"
                precision={2}
                min={0.01}
                max={maxAmount}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @yanlu/web build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/payroll/SettleDialog.tsx
git commit -m "feat(web)(phase-5): add SettleDialog with first-time rate input and remaining-cap validation"
```

---

## Task 14 — `AddManualRecordDialog`

**Files:**
- Create: `apps/web/src/features/payroll/AddManualRecordDialog.tsx`

- [ ] **Step 1: Write the component**

Write `apps/web/src/features/payroll/AddManualRecordDialog.tsx`:

```tsx
import { DatePicker, Form, InputNumber, Modal } from "antd";
import type { Dayjs } from "dayjs";
import { EmployeePicker } from "../../components/EmployeePicker";
import { usePayrollMutations } from "./hooks/usePayrollMutations";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FormValues = {
  employeeJobNo: string;
  period: Dayjs;
  extraLabor: number;
  extraDeduction: number;
};

export function AddManualRecordDialog({ open, onClose }: Props) {
  const [form] = Form.useForm<FormValues>();
  const { addManual } = usePayrollMutations();

  const onSubmit = async () => {
    const values = await form.validateFields();
    await addManual.mutateAsync({
      employeeJobNo: values.employeeJobNo,
      settlementPeriod: values.period.format("YYYYMM"),
      extraLabor: String(values.extraLabor),
      extraDeduction: String(values.extraDeduction),
    });
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      open={open}
      title="手动添加薪酬记录"
      width={520}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      onOk={onSubmit}
      okText="提交"
      cancelText="取消"
      confirmLoading={addManual.isPending}
      destroyOnClose
    >
      <Form<FormValues> form={form} layout="vertical">
        <Form.Item
          name="employeeJobNo"
          label="员工"
          rules={[{ required: true, message: "请选择员工" }]}
        >
          <EmployeePicker
            excludeResigned={false}
            placeholder="选择员工(含已离职)"
          />
        </Form.Item>

        <Form.Item
          name="period"
          label="所属年月"
          rules={[{ required: true, message: "请选择所属年月" }]}
        >
          <DatePicker
            picker="month"
            format="YYYY-MM"
            style={{ width: "100%" }}
          />
        </Form.Item>

        <Form.Item
          name="extraLabor"
          label="其他劳务"
          rules={[
            { required: true, message: "请输入其他劳务金额" },
            {
              validator: (_, value) =>
                value == null || value > 0
                  ? Promise.resolve()
                  : Promise.reject(new Error("其他劳务必须大于 0")),
            },
          ]}
        >
          <InputNumber
            addonAfter="元"
            precision={2}
            min={0.01}
            style={{ width: "100%" }}
          />
        </Form.Item>

        <Form.Item
          name="extraDeduction"
          label="其他扣除"
          rules={[
            { required: true, message: "请输入其他扣除金额" },
            {
              validator: (_, value) => {
                if (value == null || value < 0) {
                  return Promise.reject(new Error("其他扣除不得小于 0"));
                }
                const labor = form.getFieldValue("extraLabor") as
                  | number
                  | undefined;
                if (labor != null && value === labor) {
                  return Promise.reject(
                    new Error("其他扣除不得等于其他劳务"),
                  );
                }
                return Promise.resolve();
              },
            },
          ]}
          dependencies={["extraLabor"]}
        >
          <InputNumber
            addonAfter="元"
            precision={2}
            min={0}
            style={{ width: "100%" }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @yanlu/web build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/payroll/AddManualRecordDialog.tsx
git commit -m "feat(web)(phase-5): add AddManualRecordDialog with EmployeePicker and labor/deduction guards"
```

---

## Task 15 — `DeleteManualRecordConfirm`

**Files:**
- Create: `apps/web/src/features/payroll/DeleteManualRecordConfirm.tsx`

- [ ] **Step 1: Write the helper**

Write `apps/web/src/features/payroll/DeleteManualRecordConfirm.tsx`:

```tsx
import { Modal } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";

export function confirmDeleteManualRecord(options: {
  period: string;
  employeeName: string;
  onConfirm: () => Promise<void> | void;
}): void {
  Modal.confirm({
    title: "删除手动薪酬记录",
    icon: <ExclamationCircleOutlined />,
    content: (
      <div>
        即将删除 <strong>{options.employeeName}</strong> 在{" "}
        <strong>{options.period}</strong> 的手动记录。
        <br />
        删除后不可恢复,但日志仍保留。是否继续?
      </div>
    ),
    okText: "确认删除",
    okButtonProps: { danger: true },
    cancelText: "取消",
    onOk: async () => {
      await options.onConfirm();
    },
  });
}
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @yanlu/web build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/payroll/DeleteManualRecordConfirm.tsx
git commit -m "feat(web)(phase-5): add confirmDeleteManualRecord helper"
```

---

## Task 16 — `PayrollListPage`

**Files:**
- Create: `apps/web/src/features/payroll/PayrollListPage.tsx`

- [ ] **Step 1: Write the page**

Write `apps/web/src/features/payroll/PayrollListPage.tsx`:

```tsx
import {
  Button,
  DatePicker,
  Input,
  Modal,
  Radio,
  Space,
  Switch,
  Table,
  Typography,
} from "antd";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AddManualRecordDialog } from "./AddManualRecordDialog";
import { confirmDeleteManualRecord } from "./DeleteManualRecordConfirm";
import { SettleDialog } from "./SettleDialog";
import { ViewCoursesDialog } from "./ViewCoursesDialog";
import { usePayroll } from "./hooks/usePayroll";
import { usePayrollMutations } from "./hooks/usePayrollMutations";
import type {
  PayrollRangeMode,
  PayrollRow,
  PayrollQueryParams,
} from "./types";

function formatPeriodFromDayjs(d: Dayjs): string {
  return d.format("YYYYMM");
}

function currentPeriod(): string {
  return dayjs().format("YYYYMM");
}

function previousPeriod(): string {
  return dayjs().subtract(1, "month").format("YYYYMM");
}

function readParams(sp: URLSearchParams): {
  params: PayrollQueryParams;
  mode: PayrollRangeMode;
} {
  const from = sp.get("from");
  const to = sp.get("to");
  const keyword = sp.get("keyword") ?? undefined;
  const unpaidOnly = sp.get("unpaidOnly") === "1";

  let mode: PayrollRangeMode = "current";
  let effectiveFrom = currentPeriod();
  let effectiveTo = currentPeriod();

  if (from && to) {
    effectiveFrom = from;
    effectiveTo = to;
    if (from === currentPeriod() && to === currentPeriod()) mode = "current";
    else if (from === previousPeriod() && to === previousPeriod())
      mode = "previous";
    else mode = "custom";
  }

  return {
    params: {
      from: effectiveFrom,
      to: effectiveTo,
      keyword,
      unpaidOnly: unpaidOnly || undefined,
    },
    mode,
  };
}

function writeParams(
  next: PayrollQueryParams,
  set: (q: URLSearchParams) => void,
): void {
  const qp = new URLSearchParams();
  qp.set("from", next.from);
  qp.set("to", next.to);
  if (next.keyword) qp.set("keyword", next.keyword);
  if (next.unpaidOnly) qp.set("unpaidOnly", "1");
  set(qp);
}

function MoneyCell({
  value,
  red = false,
}: {
  value: number | null | undefined;
  red?: boolean;
}) {
  if (value == null) return <span>—</span>;
  const text = `${value.toFixed(2)} 元`;
  return red ? <span className="payroll-money-red">{text}</span> : <span>{text}</span>;
}

export function PayrollListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { params, mode } = useMemo(() => readParams(searchParams), [searchParams]);

  const [keyword, setKeyword] = useState(params.keyword ?? "");
  useEffect(() => {
    setKeyword(params.keyword ?? "");
  }, [params.keyword]);

  const listQ = usePayroll(params);
  const { deleteManual } = usePayrollMutations();

  const [manualOpen, setManualOpen] = useState(false);
  const [settleFor, setSettleFor] = useState<{
    teacherJobNo: string;
    teacherName: string;
    period: string;
  } | null>(null);
  const [viewCoursesFor, setViewCoursesFor] = useState<{
    teacherJobNo: string;
    teacherName: string;
    period: string;
  } | null>(null);

  const applyMode = (next: PayrollRangeMode) => {
    if (next === "current") {
      writeParams(
        { ...params, from: currentPeriod(), to: currentPeriod() },
        setSearchParams,
      );
    } else if (next === "previous") {
      writeParams(
        { ...params, from: previousPeriod(), to: previousPeriod() },
        setSearchParams,
      );
    }
    // custom: leave params alone; the RangePicker below writes them
  };

  const applyCustomRange = (range: [Dayjs | null, Dayjs | null] | null) => {
    if (!range || !range[0] || !range[1]) return;
    writeParams(
      {
        ...params,
        from: formatPeriodFromDayjs(range[0]),
        to: formatPeriodFromDayjs(range[1]),
      },
      setSearchParams,
    );
  };

  const runSearch = () =>
    writeParams({ ...params, keyword: keyword || undefined }, setSearchParams);

  const toggleUnpaid = (checked: boolean) =>
    writeParams(
      { ...params, unpaidOnly: checked || undefined },
      setSearchParams,
    );

  const askAddManual = () => {
    Modal.confirm({
      title: "手动添加薪酬记录",
      content:
        "手动添加的记录无法联动计算课时费,仅是强制追加一条劳务/扣除记录。是否继续?",
      okText: "继续",
      cancelText: "取消",
      onOk: () => setManualOpen(true),
    });
  };

  const onDeleteManual = (row: PayrollRow) => {
    if (row.kind !== "manual") return;
    confirmDeleteManualRecord({
      period: row.period,
      employeeName: row.employeeName,
      onConfirm: () => deleteManual.mutateAsync(row.id),
    });
  };

  const columns = [
    {
      title: "操作",
      key: "action",
      width: 180,
      render: (_: unknown, r: PayrollRow) => {
        if (r.kind === "auto") {
          const remaining =
            r.subtotalPayable != null
              ? r.subtotalPayable - r.subtotalPaid
              : null;
          const settleDisabled =
            r.subtotalPayable == null ||
            (remaining != null && remaining <= 1e-6);
          return (
            <Space size="small">
              <Button
                type="link"
                size="small"
                onClick={() =>
                  setViewCoursesFor({
                    teacherJobNo: r.employeeJobNo,
                    teacherName: r.employeeName,
                    period: r.period,
                  })
                }
              >
                查看课程
              </Button>
              <Button
                type="link"
                size="small"
                disabled={settleDisabled}
                onClick={() =>
                  setSettleFor({
                    teacherJobNo: r.employeeJobNo,
                    teacherName: r.employeeName,
                    period: r.period,
                  })
                }
              >
                结算
              </Button>
            </Space>
          );
        }
        return (
          <Button
            type="link"
            size="small"
            danger
            onClick={() => onDeleteManual(r)}
          >
            删除记录
          </Button>
        );
      },
    },
    { title: "工号", dataIndex: "employeeJobNo", width: 100 },
    { title: "老师姓名", dataIndex: "employeeName", width: 140 },
    { title: "所属年月", dataIndex: "period", width: 100 },
    {
      title: "单位课时费",
      dataIndex: "hourlyRate",
      width: 140,
      render: (v: number | null) => <MoneyCell value={v} />,
    },
    {
      title: "已授课时",
      dataIndex: "deliveredHours",
      width: 110,
      render: (v: number) => v.toFixed(2),
    },
    {
      title: "总课时费",
      dataIndex: "totalCourseFee",
      width: 140,
      render: (v: number | null) => <MoneyCell value={v} />,
    },
    {
      title: "其他劳务",
      dataIndex: "extraLabor",
      width: 120,
      render: (v: number) => <MoneyCell value={v} />,
    },
    {
      title: "其他扣除",
      dataIndex: "extraDeduction",
      width: 120,
      render: (v: number) => <MoneyCell value={v} />,
    },
    {
      title: "应结算薪资",
      dataIndex: "subtotalPayable",
      width: 140,
      render: (v: number | null) => <MoneyCell value={v} red />,
    },
    {
      title: "已结算薪资",
      dataIndex: "subtotalPaid",
      width: 140,
      render: (v: number) => <MoneyCell value={v} />,
    },
  ];

  const rowKey = (r: PayrollRow) =>
    r.kind === "auto"
      ? `auto:${r.employeeJobNo}:${r.period}`
      : `manual:${r.id}`;

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        员工薪酬管理
      </Typography.Title>

      <div className="payroll-toolbar">
        <Space wrap>
          <Input.Search
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={runSearch}
            placeholder="老师姓名 / 工号"
            style={{ width: 280 }}
            allowClear
            enterButton={<SearchOutlined />}
          />
          <Radio.Group
            value={mode}
            onChange={(e) => applyMode(e.target.value as PayrollRangeMode)}
            optionType="button"
            buttonStyle="solid"
            options={[
              { label: "本月", value: "current" },
              { label: "上月", value: "previous" },
              { label: "自定义", value: "custom" },
            ]}
          />
          {mode === "custom" ? (
            <DatePicker.RangePicker
              picker="month"
              format="YYYY-MM"
              value={[
                dayjs(`${params.from.slice(0, 4)}-${params.from.slice(4, 6)}-01`),
                dayjs(`${params.to.slice(0, 4)}-${params.to.slice(4, 6)}-01`),
              ]}
              onChange={(range) =>
                applyCustomRange(range as [Dayjs | null, Dayjs | null] | null)
              }
            />
          ) : null}
          <Space size={4}>
            <span>仅查看薪资未结清</span>
            <Switch
              checked={Boolean(params.unpaidOnly)}
              onChange={toggleUnpaid}
            />
          </Space>
        </Space>
        <div style={{ flex: 1 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={askAddManual}>
          手动添加记录
        </Button>
      </div>

      <Table<PayrollRow>
        rowKey={rowKey}
        dataSource={listQ.data?.items ?? []}
        columns={columns}
        loading={listQ.isLoading}
        scroll={{ x: 1400 }}
        pagination={{ defaultPageSize: 50, showSizeChanger: true }}
      />

      <AddManualRecordDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
      />
      {settleFor ? (
        <SettleDialog
          open={Boolean(settleFor)}
          teacherJobNo={settleFor.teacherJobNo}
          teacherName={settleFor.teacherName}
          period={settleFor.period}
          onClose={() => setSettleFor(null)}
        />
      ) : null}
      {viewCoursesFor ? (
        <ViewCoursesDialog
          open={Boolean(viewCoursesFor)}
          teacherJobNo={viewCoursesFor.teacherJobNo}
          teacherName={viewCoursesFor.teacherName}
          period={viewCoursesFor.period}
          onClose={() => setViewCoursesFor(null)}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @yanlu/web build
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/payroll/PayrollListPage.tsx
git commit -m "feat(web)(phase-5): add PayrollListPage with toolbar, table, and wiring for three dialogs"
```

---

## Task 17 — Router wiring + styles

**Files:**
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Replace `/payroll` `ModulePage` with `PayrollListPage`**

In `apps/web/src/router.tsx`:

1. Add an import near the top, beside the other feature pages:

```ts
import { PayrollListPage } from "./features/payroll/PayrollListPage";
```

2. Replace the `path: "payroll"` block (currently `ModulePage` placeholder, around lines 102-116) with:

```tsx
      {
        path: "payroll",
        element: (
          <RequireAuth>
            <RequireRole roles={["SUPER_ADMIN", "ADMIN"]}>
              <PayrollListPage />
            </RequireRole>
          </RequireAuth>
        ),
      },
```

- [ ] **Step 2: Add payroll styles**

Append to the end of `apps/web/src/styles.css`:

```css
/* ---- Phase 5: Payroll -------------------------------------------------- */

.payroll-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}

.payroll-money-red {
  color: #d4380d;
  font-weight: 600;
}
```

- [ ] **Step 3: Build web**

```bash
pnpm --filter @yanlu/web build
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/router.tsx apps/web/src/styles.css
git commit -m "feat(web)(phase-5): mount PayrollListPage at /payroll and add toolbar + red money styles"
```

---

## Task 18 — Manual smoke test

**Files:**
- None — verification-only task.

- [ ] **Step 1: Start infra + both apps**

From repo root, in three shells (or VS Code `Full Stack Debug`):

```bash
docker compose up -d db minio
pnpm dev:api     # shell 1
pnpm dev:web     # shell 2
```

Open http://localhost:5173 and log in as `SUPER_ADMIN`. Then log in as `MEMBER` in a private window for the RBAC step.

- [ ] **Step 2: Run the acceptance checklist from spec §11 + design §8**

Walk through each row. Check the box on this plan as you confirm the item passes.

Role / access
- [ ] MEMBER visiting `/payroll` gets the `RequireRole` permission page (not the list)
- [ ] SUPER_ADMIN / ADMIN visiting `/payroll` gets the payroll table

Time range
- [ ] Default view shows current month (`from=to=current YYYYMM`)
- [ ] "上月" button → list switches to previous month
- [ ] "自定义" button → RangePicker appears; pick e.g. `202601` → `202603` → list shows 3 months of rows

Search + filter
- [ ] Typing a teacher name fragment in the search box and hitting enter filters rows by name ILIKE
- [ ] Typing a job-no fragment filters rows by jobNo
- [ ] "仅查看薪资未结清" switch → auto rows with `subtotalPaid >= subtotalPayable` disappear; manual rows remain

Sort + formatting
- [ ] Rows are sorted by `employeeName` pinyin ascending
- [ ] Within the same teacher, auto rows appear before manual rows
- [ ] 所属年月 column shows the 6-digit `YYYYMM`
- [ ] 应结算薪资 column is bold red
- [ ] All money cells end with ` 元`

Auto-row actions
- [ ] Click "查看课程" on an auto row → dialog lists that teacher's completed courses for the period with 6 columns (课程编号 / 课程名称 / 计划时间 / 课时 / 学生数 / 授课方式)
- [ ] Click "结算" on an auto row with no prior settlement → dialog asks for 单位课时费 + 本次结算金额
- [ ] Submit rate ≤ 0 → form rejects
- [ ] Submit a valid first settlement → success toast + list refreshes + 已结算薪资 column updates
- [ ] Click "结算" again for the same (teacher, period) → dialog shows 单位课时费 locked with an info banner
- [ ] Submit more than the remaining cap → backend returns 400 with "本次结算金额超出剩余应结算" message
- [ ] Once `subtotalPaid == subtotalPayable`, the 结算 button becomes disabled

Manual records
- [ ] Click "手动添加记录" → a secondary confirmation Modal asks "是否继续?" first
- [ ] Proceed → main dialog appears with 员工 / 所属年月 / 其他劳务 / 其他扣除 fields
- [ ] Submitting with `extraLabor <= 0` → form rejects
- [ ] Submitting with `extraLabor == extraDeduction` → form rejects
- [ ] Submit a valid record → a new row with `kind=manual` appears, 操作 column shows red "删除记录" only
- [ ] Click "删除记录" → confirm dialog → row disappears on success

Audit log spot-check
- [ ] Run `docker compose exec db psql -U postgres -d yanlu -c 'select action, "targetType", "targetId", "createdAt" from "AuditLog" order by "createdAt" desc limit 10;'` — you should see three recent entries:
  - `action='settle' targetType='payroll_settlement'`
  - `action='create' targetType='payroll_manual_record'`
  - `action='delete' targetType='payroll_manual_record'`

Employee delete guard
- [ ] Try deleting an employee who has either a settlement or a manual record via the employees page → gets 409 "该员工有关联学生/薪酬/课程，不可删除，请将状态改为已离职"

- [ ] **Step 3: No commit**

This task is verification-only. If any item fails, open an issue in the plan (or a follow-up task) describing what broke; do NOT mark Phase 5 as done until every checkbox above is green.

---

## Out of Scope (re-asserted)

- Excel export / PDF export
- Batch settlement / undo settlement
- Editing existing settlements or manual records
- Aggregated dashboard / charts
- Email/SMS/Lark notifications
- Asia/Shanghai tz conversion for `plannedAt` month bucketing
- Automated test infrastructure
- Dedicated mobile layout for the payroll page (respects existing responsive rules; horizontal scroll is acceptable)
