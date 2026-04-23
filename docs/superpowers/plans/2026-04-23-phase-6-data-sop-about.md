# Phase 6 — 数据表 / SOP / 关于页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Phase 6 per [docs/spec/07-Phase6-数据表-SOP-关于.md](../../spec/07-Phase6-数据表-SOP-关于.md) — 数据表 / SOP 快捷入口页（三列卡片 + 排序/添加/编辑/删除）、关于页（版本 + 企业 + 日志入口）、`/logs` 审计日志只读列表页，以及 180 天保留策略的后台清理任务。

**Architecture:** API 新增 `QuickLinksModule`（Public SOP 读 + 鉴权 CRUD + 批量 reorder），现有 `AuditLogsModule` 升级对外（读 controller + `@nestjs/schedule` 每日清理）。Web 新增 `features/quick-links`（一个共享 `QuickLinkCenterPage` 参数化组件 + 两个薄 wrapper + CRUD/Sort Modal）、`features/about`、`features/audit-logs`。数据模型在 `QuickLink` 上加 `pageType` / `kind` 两个枚举字段。

**Tech Stack:** NestJS 10 + Prisma 5 + PostgreSQL + `@nestjs/schedule` + class-validator 在 API 侧；React 18 + TypeScript + Vite + AntD 5 + TanStack Query + `@dnd-kit/core` / `@dnd-kit/sortable` 在 Web 侧。

**Verification checkpoint:** 项目没有 test / lint 脚本（CLAUDE.md 明令不要虚构）。每个任务用 `pnpm --filter @yanlu/api build` 或 `pnpm --filter @yanlu/web build` 作为静态验证，关键控制器完成后跑 `curl` smoke；本地手动浏览器验收在收尾任务集中走一遍。每个 task 收尾都以 commit 结束，方便回滚。

---

## File Structure

**API 新增**

| Path | Role |
| --- | --- |
| `apps/api/src/modules/quick-links/quick-links.module.ts` | DI 装配 |
| `apps/api/src/modules/quick-links/quick-links.controller.ts` | REST 表面：`GET /public/sop-links`、`GET/POST/PATCH/DELETE /quick-links`、`POST /quick-links/reorder` |
| `apps/api/src/modules/quick-links/quick-links.service.ts` | list / create / update / remove / reorder + audit 写入 |
| `apps/api/src/modules/quick-links/quick-links.types.ts` | 响应结构类型 |
| `apps/api/src/modules/quick-links/dto/create-quick-link.dto.ts` | 创建校验 |
| `apps/api/src/modules/quick-links/dto/update-quick-link.dto.ts` | 更新校验（pageType 不可改）|
| `apps/api/src/modules/quick-links/dto/reorder-quick-links.dto.ts` | 批量排序校验 |
| `apps/api/src/modules/quick-links/dto/query-quick-links.dto.ts` | 列表筛选 DTO |
| `apps/api/src/modules/audit-logs/audit-logs.controller.ts` | 审计日志只读 REST |
| `apps/api/src/modules/audit-logs/audit-logs-retention.service.ts` | 每日 03:00 清理 180 天 |
| `apps/api/src/modules/audit-logs/dto/query-audit-logs.dto.ts` | 筛选 DTO |

**API 修改**

| Path | Role |
| --- | --- |
| `apps/api/prisma/schema.prisma` | `QuickLink` 加 `pageType` / `kind` 字段 + index；`AuditLog` 加 `createdAt` index；两个新 enum |
| `apps/api/src/app.module.ts` | 注册 `QuickLinksModule`、`ScheduleModule.forRoot()` |
| `apps/api/src/modules/audit-logs/audit-logs.module.ts` | 挂 controller + retention service |
| `apps/api/src/modules/audit-logs/audit-logs.types.ts` | 扩 `AuditAction`（`quick_link.*` 四条）与 `AuditTargetType`（`quick_link`）|
| `apps/api/package.json` | 加 `@nestjs/schedule` |

**Web 新增**

| Path | Role |
| --- | --- |
| `apps/web/src/services/quickLinks.ts` | `fetch` 封装 + 类型 |
| `apps/web/src/services/auditLogs.ts` | 审计日志 API wrapper |
| `apps/web/src/features/quick-links/types.ts` | 前端类型 |
| `apps/web/src/features/quick-links/hooks/useQuickLinks.ts` | 按 pageType 拉取 |
| `apps/web/src/features/quick-links/hooks/useQuickLinkMutations.ts` | create / update / remove / reorder |
| `apps/web/src/features/quick-links/QuickLinkCard.tsx` | 卡片渲染 + kind-aware 点击行为 |
| `apps/web/src/features/quick-links/QuickLinkFormModal.tsx` | 添加 / 编辑 Modal |
| `apps/web/src/features/quick-links/QuickLinkDeleteConfirm.tsx` | 删除二次确认 helper |
| `apps/web/src/features/quick-links/QuickLinkSortModal.tsx` | 拖拽排序 Modal |
| `apps/web/src/features/quick-links/QuickLinkCenterPage.tsx` | 共享参数化页面 |
| `apps/web/src/features/quick-links/DataCenterPage.tsx` | `/links` 入口薄 wrapper |
| `apps/web/src/features/quick-links/SopCenterPage.tsx` | `/sop` 入口薄 wrapper |
| `apps/web/src/features/about/AboutPage.tsx` | `/about` 页面 |
| `apps/web/src/features/audit-logs/AuditLogListPage.tsx` | `/logs` 只读列表 |
| `apps/web/src/features/audit-logs/hooks/useAuditLogs.ts` | 分页 hook |
| `apps/web/src/features/audit-logs/types.ts` | 前端类型 |
| `apps/web/src/constants/about.ts` | 关于页常量 |
| `apps/web/public/templates/README.md` | 目录占位说明 |

**Web 修改**

| Path | Role |
| --- | --- |
| `apps/web/src/router.tsx` | `/links` / `/sop` / `/about` 切实页、新增 `/logs` |
| `apps/web/src/styles.css` | 卡片网格样式 + hover 强调色变量 + sort modal 拖拽态 + 审计日志紧凑行 |
| `apps/web/package.json` | 加 `@dnd-kit/core` / `@dnd-kit/sortable` |
| `.gitignore` | 忽略 `apps/web/public/templates/*.rar` |

---

## Task 1 — Prisma schema: `QuickLink` 扩展 + `AuditLog` 索引

**Files:**
- Modify: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: 编辑 schema.prisma**

在 `enum ServiceStatus { ... }` 块后加两个新 enum；替换现有 `QuickLink` 模型；给 `AuditLog` 加 `createdAt` index。

打开 `apps/api/prisma/schema.prisma`，在 `enum ServiceStatus { ... }` 后追加：

```prisma
enum QuickLinkPageType {
  DATA_TABLE
  SOP
}

enum QuickLinkKind {
  NAVIGATE
  COPY
  DOWNLOAD
}
```

把现有的 `QuickLink` 模型整个替换为：

```prisma
model QuickLink {
  id         String            @id @default(cuid())
  pageType   QuickLinkPageType
  category   String
  kind       QuickLinkKind     @default(NAVIGATE)
  title      String
  url        String
  sortOrder  Int               @default(0)
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt

  @@index([pageType, category, sortOrder])
}
```

把现有的 `AuditLog` 模型替换为（仅加 `@@index`，其他不变）：

```prisma
model AuditLog {
  id          String   @id @default(cuid())
  operatorId  String?
  operator    User?    @relation(fields: [operatorId], references: [id], onDelete: SetNull)
  action      String
  targetType  String
  targetId    String
  fieldName   String?
  beforeValue String?
  afterValue  String?
  createdAt   DateTime @default(now())

  @@index([createdAt])
  @@index([operatorId])
  @@index([targetType, targetId])
}
```

- [ ] **Step 2: 重新生成 Prisma client 并推送 schema**

Run:

```bash
pnpm prisma:generate
pnpm prisma:push
```

Expected：两条命令均退出 0。`db push` 输出 "The database is now in sync with your Prisma schema."（若之前有 QuickLink 旧行会提示丢列风险；当前模型无大改仅加字段，默认 `pageType` / `kind` 需要填充；DB 当前无业务数据可接受 data loss。如果出现交互提示，选 "Accept data loss"。）

- [ ] **Step 3: 验证 API 静态构建仍通过**

Run:

```bash
pnpm --filter @yanlu/api build
```

Expected：构建成功（Prisma client 已重生成，TS 能看到新 enum 类型）。

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(api)(phase-6): extend QuickLink with pageType/kind and index AuditLog.createdAt"
```

---

## Task 2 — 安装 `@nestjs/schedule`

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: 安装依赖**

Run（在仓库根运行，使用 workspace 过滤）：

```bash
pnpm --filter @yanlu/api add @nestjs/schedule@^4.1.0
```

Expected：`apps/api/package.json` 的 `dependencies` 多出 `"@nestjs/schedule": "^4.1.0"`，`pnpm-lock.yaml` 更新。

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/api build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api)(phase-6): add @nestjs/schedule dependency"
```

---

## Task 3 — 在 `app.module.ts` 注册 `ScheduleModule`

**Files:**
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: 编辑 app.module.ts**

在 imports 区追加 `ScheduleModule.forRoot()`。打开 `apps/api/src/app.module.ts`，在现有的 `import { Module } from "@nestjs/common";` 下一行加：

```typescript
import { ScheduleModule } from "@nestjs/schedule";
```

并把 `imports` 数组里的第一个条目（`ConfigModule.forRoot(...)` 之前）补上：

```typescript
ScheduleModule.forRoot(),
```

最终 imports 数组开头应是：

```typescript
imports: [
  ScheduleModule.forRoot(),
  ConfigModule.forRoot({
    isGlobal: true,
    envFilePath: ["apps/api/.env", ".env"],
    validate: validateEnvironment,
  }),
  PrismaModule,
  // ... 保持其他条目不变
],
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/api build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app.module.ts
git commit -m "feat(api)(phase-6): register ScheduleModule for cron jobs"
```

---

## Task 4 — 扩展 Audit action / target 类型

**Files:**
- Modify: `apps/api/src/modules/audit-logs/audit-logs.types.ts`

- [ ] **Step 1: 编辑 audit-logs.types.ts**

把 `AuditAction` 的 union 追加 `quick_link.*`；`AuditTargetType` 追加 `"quick_link"`。

替换 `apps/api/src/modules/audit-logs/audit-logs.types.ts` 全文为：

```typescript
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
  | "user.deactivate"
  | "student.create"
  | "student.update"
  | "student.delete"
  | "course.create"
  | "course.update"
  | "course.delete"
  | "quick_link.create"
  | "quick_link.update"
  | "quick_link.delete"
  | "quick_link.reorder";

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
  | "course_outline_item"
  | "quick_link";

export type AuditRecordInput = {
  operatorId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/api build
```

Expected：构建成功（类型向上兼容，不影响其他模块）。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/audit-logs/audit-logs.types.ts
git commit -m "feat(api)(phase-6): extend AuditAction/AuditTargetType with quick_link"
```

---

## Task 5 — QuickLink DTO 套组

**Files:**
- Create: `apps/api/src/modules/quick-links/dto/create-quick-link.dto.ts`
- Create: `apps/api/src/modules/quick-links/dto/update-quick-link.dto.ts`
- Create: `apps/api/src/modules/quick-links/dto/reorder-quick-links.dto.ts`
- Create: `apps/api/src/modules/quick-links/dto/query-quick-links.dto.ts`

- [ ] **Step 1: 写 create-quick-link.dto.ts**

内容：

```typescript
import { QuickLinkKind, QuickLinkPageType } from "@prisma/client";
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateQuickLinkDto {
  @IsEnum(QuickLinkPageType)
  pageType!: QuickLinkPageType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  category!: string;

  @IsEnum(QuickLinkKind)
  kind!: QuickLinkKind;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  url!: string;
}
```

- [ ] **Step 2: 写 update-quick-link.dto.ts**

`pageType` 不允许改，所以不 partial 整个 create；手写：

```typescript
import { QuickLinkKind } from "@prisma/client";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class UpdateQuickLinkDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsEnum(QuickLinkKind)
  kind?: QuickLinkKind;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  url?: string;
}
```

- [ ] **Step 3: 写 reorder-quick-links.dto.ts**

```typescript
import { Type } from "class-transformer";
import { QuickLinkPageType } from "@prisma/client";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class ReorderQuickLinkItem {
  @IsString()
  id!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderQuickLinksDto {
  @IsEnum(QuickLinkPageType)
  pageType!: QuickLinkPageType;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderQuickLinkItem)
  items!: ReorderQuickLinkItem[];
}
```

- [ ] **Step 4: 写 query-quick-links.dto.ts**

```typescript
import { QuickLinkPageType } from "@prisma/client";
import { IsEnum } from "class-validator";

export class QueryQuickLinksDto {
  @IsEnum(QuickLinkPageType)
  pageType!: QuickLinkPageType;
}
```

- [ ] **Step 5: 验证构建**

Run:

```bash
pnpm --filter @yanlu/api build
```

Expected：构建成功。

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/quick-links/dto/
git commit -m "feat(api)(phase-6): add QuickLink DTOs (create/update/reorder/query)"
```

---

## Task 6 — QuickLink 响应类型

**Files:**
- Create: `apps/api/src/modules/quick-links/quick-links.types.ts`

- [ ] **Step 1: 写 quick-links.types.ts**

```typescript
import type { QuickLinkKind, QuickLinkPageType } from "@prisma/client";

export type QuickLinkRow = {
  id: string;
  pageType: QuickLinkPageType;
  category: string;
  kind: QuickLinkKind;
  title: string;
  url: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type QuickLinkGroup = {
  category: string;
  items: QuickLinkRow[];
};

export type QuickLinkListResponse = {
  pageType: QuickLinkPageType;
  groups: QuickLinkGroup[];
};
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/api build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/quick-links/quick-links.types.ts
git commit -m "feat(api)(phase-6): add QuickLink response types"
```

---

## Task 7 — `QuickLinksService`

**Files:**
- Create: `apps/api/src/modules/quick-links/quick-links.service.ts`

- [ ] **Step 1: 写 quick-links.service.ts**

```typescript
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma, QuickLinkPageType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { CreateQuickLinkDto } from "./dto/create-quick-link.dto";
import { UpdateQuickLinkDto } from "./dto/update-quick-link.dto";
import { ReorderQuickLinksDto } from "./dto/reorder-quick-links.dto";
import type {
  QuickLinkGroup,
  QuickLinkListResponse,
  QuickLinkRow,
} from "./quick-links.types";

type PrismaQuickLink = Prisma.QuickLinkGetPayload<Record<string, never>>;

function toRow(row: PrismaQuickLink): QuickLinkRow {
  return {
    id: row.id,
    pageType: row.pageType,
    category: row.category,
    kind: row.kind,
    title: row.title,
    url: row.url,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function groupByCategory(rows: PrismaQuickLink[]): QuickLinkGroup[] {
  const map = new Map<string, QuickLinkRow[]>();
  for (const row of rows) {
    const list = map.get(row.category) ?? [];
    list.push(toRow(row));
    map.set(row.category, list);
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
}

@Injectable()
export class QuickLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async listByPageType(pageType: QuickLinkPageType): Promise<QuickLinkListResponse> {
    const rows = await this.prisma.quickLink.findMany({
      where: { pageType },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return { pageType, groups: groupByCategory(rows) };
  }

  async create(dto: CreateQuickLinkDto, operatorId: string | null): Promise<QuickLinkRow> {
    const max = await this.prisma.quickLink.aggregate({
      where: { pageType: dto.pageType, category: dto.category },
      _max: { sortOrder: true },
    });
    const nextSort = (max._max.sortOrder ?? 0) + 10;
    const row = await this.prisma.quickLink.create({
      data: {
        pageType: dto.pageType,
        category: dto.category,
        kind: dto.kind,
        title: dto.title,
        url: dto.url,
        sortOrder: nextSort,
      },
    });
    await this.auditLogs.record({
      operatorId,
      action: "quick_link.create",
      targetType: "quick_link",
      targetId: row.id,
      after: toRow(row) as unknown as Record<string, unknown>,
    });
    return toRow(row);
  }

  async update(
    id: string,
    dto: UpdateQuickLinkDto,
    operatorId: string | null,
  ): Promise<QuickLinkRow> {
    const existing = await this.prisma.quickLink.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("QuickLink not found");

    // If category changes, assign fresh sortOrder in the new category so the
    // entry lands at the end. Otherwise keep existing sortOrder untouched.
    let sortOrderOverride: number | undefined;
    if (dto.category && dto.category !== existing.category) {
      const max = await this.prisma.quickLink.aggregate({
        where: { pageType: existing.pageType, category: dto.category },
        _max: { sortOrder: true },
      });
      sortOrderOverride = (max._max.sortOrder ?? 0) + 10;
    }

    const updated = await this.prisma.quickLink.update({
      where: { id },
      data: {
        category: dto.category ?? existing.category,
        kind: dto.kind ?? existing.kind,
        title: dto.title ?? existing.title,
        url: dto.url ?? existing.url,
        ...(sortOrderOverride !== undefined ? { sortOrder: sortOrderOverride } : {}),
      },
    });

    await this.auditLogs.record({
      operatorId,
      action: "quick_link.update",
      targetType: "quick_link",
      targetId: id,
      before: toRow(existing) as unknown as Record<string, unknown>,
      after: toRow(updated) as unknown as Record<string, unknown>,
    });
    return toRow(updated);
  }

  async remove(id: string, operatorId: string | null): Promise<void> {
    const existing = await this.prisma.quickLink.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("QuickLink not found");
    await this.prisma.quickLink.delete({ where: { id } });
    await this.auditLogs.record({
      operatorId,
      action: "quick_link.delete",
      targetType: "quick_link",
      targetId: id,
      before: toRow(existing) as unknown as Record<string, unknown>,
    });
  }

  async reorder(dto: ReorderQuickLinksDto, operatorId: string | null): Promise<void> {
    const ids = dto.items.map((item) => item.id);
    const rows = await this.prisma.quickLink.findMany({
      where: { id: { in: ids } },
      select: { id: true, pageType: true, sortOrder: true, category: true },
    });
    if (rows.length !== ids.length) {
      throw new BadRequestException("部分快捷入口不存在");
    }
    if (rows.some((row) => row.pageType !== dto.pageType)) {
      throw new BadRequestException("排序项与指定 pageType 不一致");
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.quickLink.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    await this.auditLogs.record({
      operatorId,
      action: "quick_link.reorder",
      targetType: "quick_link",
      targetId: dto.pageType,
      after: {
        pageType: dto.pageType,
        items: dto.items,
      } as unknown as Record<string, unknown>,
    });
  }
}
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/api build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/quick-links/quick-links.service.ts
git commit -m "feat(api)(phase-6): add QuickLinksService with CRUD + reorder + audit"
```

---

## Task 8 — `QuickLinksController`

**Files:**
- Create: `apps/api/src/modules/quick-links/quick-links.controller.ts`

- [ ] **Step 1: 写 quick-links.controller.ts**

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { QuickLinkPageType, UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { CreateQuickLinkDto } from "./dto/create-quick-link.dto";
import { QueryQuickLinksDto } from "./dto/query-quick-links.dto";
import { ReorderQuickLinksDto } from "./dto/reorder-quick-links.dto";
import { UpdateQuickLinkDto } from "./dto/update-quick-link.dto";
import { QuickLinksService } from "./quick-links.service";

@Controller()
export class QuickLinksController {
  constructor(private readonly service: QuickLinksService) {}

  /** Public entry for the SOP page — accessible to anonymous visitors per spec §8. */
  @Public()
  @Get("public/sop-links")
  listSop() {
    return this.service.listByPageType(QuickLinkPageType.SOP);
  }

  /** Authenticated entry — supports both DATA_TABLE and SOP for internal pages. */
  @Get("quick-links")
  list(@Query() query: QueryQuickLinksDto) {
    return this.service.listByPageType(query.pageType);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("quick-links")
  create(@Body() dto: CreateQuickLinkDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("quick-links/reorder")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(@Body() dto: ReorderQuickLinksDto, @CurrentUser() user: AuthUser) {
    await this.service.reorder(dto, user.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Patch("quick-links/:id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateQuickLinkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete("quick-links/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    await this.service.remove(id, user.id);
  }
}
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/api build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/quick-links/quick-links.controller.ts
git commit -m "feat(api)(phase-6): add QuickLinksController with public SOP + authenticated CRUD"
```

---

## Task 9 — `QuickLinksModule` + 在 `app.module.ts` 注册

**Files:**
- Create: `apps/api/src/modules/quick-links/quick-links.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: 写 quick-links.module.ts**

```typescript
import { Module } from "@nestjs/common";
import { QuickLinksController } from "./quick-links.controller";
import { QuickLinksService } from "./quick-links.service";

@Module({
  controllers: [QuickLinksController],
  providers: [QuickLinksService],
  exports: [QuickLinksService],
})
export class QuickLinksModule {}
```

- [ ] **Step 2: 注册到 app.module.ts**

在 `apps/api/src/app.module.ts` 中：

1. 在 `import { PayrollModule } from "./modules/payroll/payroll.module";` 下加：

```typescript
import { QuickLinksModule } from "./modules/quick-links/quick-links.module";
```

2. 在 imports 数组 `PayrollModule,` 后追加 `QuickLinksModule,`，最终顺序是：

```typescript
imports: [
  ScheduleModule.forRoot(),
  ConfigModule.forRoot({ ... }),
  PrismaModule,
  IdSequenceModule,
  StorageModule,
  AuditLogsModule,
  EmployeesModule,
  StudentsModule,
  CourseOutlinesModule,
  CoursesModule,
  PayrollModule,
  QuickLinksModule,
  UsersModule,
  AuthModule,
  HealthModule,
],
```

- [ ] **Step 3: 验证构建**

Run:

```bash
pnpm --filter @yanlu/api build
```

Expected：构建成功。

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/quick-links/quick-links.module.ts apps/api/src/app.module.ts
git commit -m "feat(api)(phase-6): register QuickLinksModule"
```

---

## Task 10 — Smoke test：QuickLink API

启动 API 并用 `curl` 打一圈。

**Files:** 无需改文件。

- [ ] **Step 1: 启动 Postgres + API**

假定 `docker compose up -d db minio` 已跑过、`.env` 已配好。在一个终端：

```bash
pnpm dev:api
```

Expected：Nest 日志显示 `Nest application successfully started`，`/api` 路由注册包含 `/api/public/sop-links`、`/api/quick-links` 等。

- [ ] **Step 2: 访问 public SOP endpoint（无 token）**

另开终端：

```bash
curl -i http://localhost:3000/api/public/sop-links
```

Expected：HTTP 200；body 形如 `{"pageType":"SOP","groups":[]}`。

- [ ] **Step 3: 访问 DATA_TABLE endpoint（无 token，应当 401）**

```bash
curl -i "http://localhost:3000/api/quick-links?pageType=DATA_TABLE"
```

Expected：HTTP 401。

- [ ] **Step 4: 登录取 token**

（沿用既有 `/api/auth/login`，超管账号以本地 `.env` 种子或现有测试账号为准。）

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"<你本地超管手机号>","password":"<对应密码>","rememberMe":true}' \
  | jq -r .accessToken)
echo $TOKEN
```

Expected：Base64 字符串非空。如果本地暂时没超管账号，跳过后续 curl smoke，直接进 Task 11。

- [ ] **Step 5: 创建一个 QuickLink**

```bash
curl -i -X POST http://localhost:3000/api/quick-links \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pageType":"DATA_TABLE","category":"企业内部数据表","kind":"NAVIGATE","title":"🎓 研录学生调研","url":"https://cn1pfz1dbj.feishu.cn/sheets/YY4qsGstahcW8ktmoIIcKY70nTI"}'
```

Expected：HTTP 201；body 返回新 QuickLink，`sortOrder=10`。

- [ ] **Step 6: 列表验证**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/quick-links?pageType=DATA_TABLE" | jq
```

Expected：`groups` 里含一条 `"企业内部数据表"` 分组，内含刚创建的项。

- [ ] **Step 7: 停 dev:api**

用 Ctrl+C 结束 `pnpm dev:api` 进程。

- [ ] **Step 8: Commit（若仅验证未改文件，无需 commit；若手动改了 .env 撤回即可）**

无代码变更则跳过 commit。

---

## Task 11 — AuditLog 查询 DTO

**Files:**
- Create: `apps/api/src/modules/audit-logs/dto/query-audit-logs.dto.ts`

- [ ] **Step 1: 写 query-audit-logs.dto.ts**

```typescript
import { Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class QueryAuditLogsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;

  @IsOptional()
  @IsString()
  operatorId?: string;

  @IsOptional()
  @IsString()
  targetType?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/api build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/audit-logs/dto/query-audit-logs.dto.ts
git commit -m "feat(api)(phase-6): add QueryAuditLogsDto"
```

---

## Task 12 — 扩展 `audit-logs.types.ts` 增加 list item 类型

**Files:**
- Modify: `apps/api/src/modules/audit-logs/audit-logs.types.ts`

- [ ] **Step 1: 追加列表响应类型**

在 `audit-logs.types.ts` 文件末尾追加：

```typescript
export type AuditLogItem = {
  id: string;
  createdAt: string;
  operatorId: string | null;
  operatorUsername: string | null;
  operatorPhone: string | null;
  action: string;
  targetType: string;
  targetId: string;
  fieldName: string | null;
  beforeValue: string | null;
  afterValue: string | null;
};

export type AuditLogListResponse = {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
};
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/api build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/audit-logs/audit-logs.types.ts
git commit -m "feat(api)(phase-6): add AuditLog list response types"
```

---

## Task 13 — `AuditLogsController` 读侧

**Files:**
- Create: `apps/api/src/modules/audit-logs/audit-logs.controller.ts`

- [ ] **Step 1: 写 controller**

```typescript
import { Controller, Get, Query } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { QueryAuditLogsDto } from "./dto/query-audit-logs.dto";
import type {
  AuditLogItem,
  AuditLogListResponse,
} from "./audit-logs.types";

const DEFAULT_PAGE_SIZE = 50;

@Controller("audit-logs")
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: QueryAuditLogsDto): Promise<AuditLogListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AuditLogWhereInput = {};
    if (query.operatorId) where.operatorId = query.operatorId;
    if (query.targetType) where.targetType = query.targetType;
    if (query.action) where.action = query.action;
    if (query.fromDate || query.toDate) {
      where.createdAt = {
        gte: query.fromDate ? new Date(query.fromDate) : undefined,
        lte: query.toDate ? new Date(query.toDate) : undefined,
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          operator: {
            select: { username: true, phone: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const items: AuditLogItem[] = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      operatorId: row.operatorId,
      operatorUsername: row.operator?.username ?? null,
      operatorPhone: row.operator?.phone ?? null,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      fieldName: row.fieldName,
      beforeValue: row.beforeValue,
      afterValue: row.afterValue,
    }));

    return { items, total, page, pageSize };
  }
}
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/api build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/audit-logs/audit-logs.controller.ts
git commit -m "feat(api)(phase-6): add AuditLogsController read endpoint"
```

---

## Task 14 — `AuditLogsRetentionService` 每日清理

**Files:**
- Create: `apps/api/src/modules/audit-logs/audit-logs-retention.service.ts`

- [ ] **Step 1: 写 retention service**

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";

const RETENTION_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class AuditLogsRetentionService {
  private readonly logger = new Logger(AuditLogsRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldLogs(): Promise<void> {
    try {
      const threshold = new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY);
      const result = await this.prisma.auditLog.deleteMany({
        where: { createdAt: { lt: threshold } },
      });
      this.logger.log(
        `Purged ${result.count} audit log rows older than ${threshold.toISOString()} (retention=${RETENTION_DAYS}d).`,
      );
    } catch (err) {
      this.logger.error("Audit log retention job failed", err as Error);
    }
  }
}
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/api build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/audit-logs/audit-logs-retention.service.ts
git commit -m "feat(api)(phase-6): add AuditLogsRetentionService (daily 180-day purge)"
```

---

## Task 15 — 更新 `AuditLogsModule` 挂 controller + retention

**Files:**
- Modify: `apps/api/src/modules/audit-logs/audit-logs.module.ts`

- [ ] **Step 1: 替换 audit-logs.module.ts**

替换整个文件为：

```typescript
import { Global, Module } from "@nestjs/common";
import { AuditLogsController } from "./audit-logs.controller";
import { AuditLogsRetentionService } from "./audit-logs-retention.service";
import { AuditLogsService } from "./audit-logs.service";

@Global()
@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, AuditLogsRetentionService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/api build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/audit-logs/audit-logs.module.ts
git commit -m "feat(api)(phase-6): register AuditLogsController + retention service"
```

---

## Task 16 — Smoke test：AuditLog 查询端点

**Files:** 无需改文件。

- [ ] **Step 1: 启动 API**

```bash
pnpm dev:api
```

Expected：Nest 启动成功；日志出现 `Nest application successfully started` 且 `Scheduler` 相关日志无 ERROR。

- [ ] **Step 2: 无 token 访问 `/api/audit-logs` 应当 401**

```bash
curl -i http://localhost:3000/api/audit-logs
```

Expected：HTTP 401。

- [ ] **Step 3: 用超管 token 访问**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/audit-logs?page=1&pageSize=50" | jq '.total, .items[0:2]'
```

Expected：返回 `total` 数值（可能非零，因为此前任务 10 的写入已经产生 audit 行）、`items` 按 `createdAt` 倒序。

- [ ] **Step 4: 过滤 targetType 校验**

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/audit-logs?targetType=quick_link&pageSize=10" | jq '.items | length'
```

Expected：至少 1（Task 10 建了 QuickLink，会有一条 `quick_link.create` 审计）。

- [ ] **Step 5: 停 dev:api**

Ctrl+C。

---

## Task 17 — 安装 `@dnd-kit` 依赖

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: 安装**

```bash
pnpm --filter @yanlu/web add @dnd-kit/core@^6.1.0 @dnd-kit/sortable@^8.0.0 @dnd-kit/utilities@^3.2.2
```

Expected：`apps/web/package.json` 的 `dependencies` 多出三项。

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功（未使用前的纯安装不影响 TS）。

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore(web)(phase-6): add @dnd-kit/core + sortable + utilities"
```

---

## Task 18 — Web QuickLink 类型 + HTTP service

**Files:**
- Create: `apps/web/src/features/quick-links/types.ts`
- Create: `apps/web/src/services/quickLinks.ts`

- [ ] **Step 1: 写 types.ts**

```typescript
export type QuickLinkPageType = "DATA_TABLE" | "SOP";
export type QuickLinkKind = "NAVIGATE" | "COPY" | "DOWNLOAD";

export type QuickLinkRow = {
  id: string;
  pageType: QuickLinkPageType;
  category: string;
  kind: QuickLinkKind;
  title: string;
  url: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type QuickLinkGroup = {
  category: string;
  items: QuickLinkRow[];
};

export type QuickLinkListResponse = {
  pageType: QuickLinkPageType;
  groups: QuickLinkGroup[];
};

export type CreateQuickLinkBody = {
  pageType: QuickLinkPageType;
  category: string;
  kind: QuickLinkKind;
  title: string;
  url: string;
};

export type UpdateQuickLinkBody = Partial<
  Omit<CreateQuickLinkBody, "pageType">
>;

export type ReorderQuickLinksBody = {
  pageType: QuickLinkPageType;
  items: Array<{ id: string; sortOrder: number }>;
};
```

- [ ] **Step 2: 写 services/quickLinks.ts**

```typescript
import { api } from "./http";
import type {
  CreateQuickLinkBody,
  QuickLinkListResponse,
  QuickLinkPageType,
  QuickLinkRow,
  ReorderQuickLinksBody,
  UpdateQuickLinkBody,
} from "../features/quick-links/types";

export const quickLinksApi = {
  listPublicSop: () =>
    api.get<QuickLinkListResponse>("/public/sop-links", { auth: false }),
  listByPageType: (pageType: QuickLinkPageType) =>
    api.get<QuickLinkListResponse>(
      `/quick-links?pageType=${encodeURIComponent(pageType)}`,
    ),
  create: (body: CreateQuickLinkBody) =>
    api.post<QuickLinkRow>("/quick-links", body),
  update: (id: string, body: UpdateQuickLinkBody) =>
    api.patch<QuickLinkRow>(`/quick-links/${id}`, body),
  remove: (id: string) => api.delete<void>(`/quick-links/${id}`),
  reorder: (body: ReorderQuickLinksBody) =>
    api.post<void>("/quick-links/reorder", body),
};
```

- [ ] **Step 3: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/quick-links/types.ts apps/web/src/services/quickLinks.ts
git commit -m "feat(web)(phase-6): add QuickLink types and HTTP service"
```

---

## Task 19 — Web QuickLink hooks

**Files:**
- Create: `apps/web/src/features/quick-links/hooks/useQuickLinks.ts`
- Create: `apps/web/src/features/quick-links/hooks/useQuickLinkMutations.ts`

- [ ] **Step 1: 写 useQuickLinks.ts**

```typescript
import { useQuery } from "@tanstack/react-query";
import { quickLinksApi } from "../../../services/quickLinks";
import { useAuthStore } from "../../../stores/authStore";
import type { QuickLinkPageType } from "../types";

export const quickLinksKey = (pageType: QuickLinkPageType, authed: boolean) =>
  ["quick-links", pageType, authed ? "auth" : "public"] as const;

export function useQuickLinks(pageType: QuickLinkPageType) {
  const user = useAuthStore((state) => state.user);
  const authed = Boolean(user);

  return useQuery({
    queryKey: quickLinksKey(pageType, authed),
    queryFn: () => {
      if (pageType === "SOP" && !authed) {
        return quickLinksApi.listPublicSop();
      }
      return quickLinksApi.listByPageType(pageType);
    },
  });
}
```

- [ ] **Step 2: 写 useQuickLinkMutations.ts**

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "antd";
import { quickLinksApi } from "../../../services/quickLinks";
import type {
  CreateQuickLinkBody,
  ReorderQuickLinksBody,
  UpdateQuickLinkBody,
} from "../types";

export function useQuickLinkMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["quick-links"] });

  const create = useMutation({
    mutationFn: (body: CreateQuickLinkBody) => quickLinksApi.create(body),
    onSuccess: () => {
      invalidate();
      message.success("已添加");
    },
    onError: (err: Error) => message.error(err.message || "添加失败"),
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateQuickLinkBody }) =>
      quickLinksApi.update(id, body),
    onSuccess: () => {
      invalidate();
      message.success("已保存");
    },
    onError: (err: Error) => message.error(err.message || "保存失败"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => quickLinksApi.remove(id),
    onSuccess: () => {
      invalidate();
      message.success("已删除");
    },
    onError: (err: Error) => message.error(err.message || "删除失败"),
  });

  const reorder = useMutation({
    mutationFn: (body: ReorderQuickLinksBody) => quickLinksApi.reorder(body),
    onSuccess: () => {
      invalidate();
      message.success("排序已保存");
    },
    onError: (err: Error) => message.error(err.message || "排序失败"),
  });

  return { create, update, remove, reorder };
}
```

- [ ] **Step 3: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/quick-links/hooks/
git commit -m "feat(web)(phase-6): add QuickLink hooks (list + mutations)"
```

---

## Task 20 — `QuickLinkCard` 组件

**Files:**
- Create: `apps/web/src/features/quick-links/QuickLinkCard.tsx`

- [ ] **Step 1: 写 QuickLinkCard.tsx**

```tsx
import {
  CopyOutlined,
  DownloadOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import { Checkbox, message } from "antd";
import type { CSSProperties } from "react";
import type { QuickLinkRow } from "./types";

type Props = {
  link: QuickLinkRow;
  selected: boolean;
  accent: "blue" | "green";
  onToggleSelect: (id: string) => void;
  showSelector: boolean;
};

const KIND_HINT: Record<QuickLinkRow["kind"], { icon: JSX.Element; label: string }> = {
  NAVIGATE: { icon: <ExportOutlined />, label: "点击跳转" },
  COPY: { icon: <CopyOutlined />, label: "点击复制" },
  DOWNLOAD: { icon: <DownloadOutlined />, label: "点击下载" },
};

function handleClick(link: QuickLinkRow): void {
  if (link.kind === "COPY") {
    if (!navigator.clipboard) {
      message.warning("浏览器不支持自动复制，请手动复制链接");
      return;
    }
    navigator.clipboard
      .writeText(link.url)
      .then(() => message.success("链接已复制"))
      .catch(() => message.error("复制失败，请手动复制"));
    return;
  }
  if (link.kind === "DOWNLOAD") {
    const a = document.createElement("a");
    a.href = link.url;
    a.download = "";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }
  window.open(link.url, "_blank", "noopener");
}

export function QuickLinkCard({
  link,
  selected,
  accent,
  onToggleSelect,
  showSelector,
}: Props) {
  const style: CSSProperties = {
    borderColor: selected ? `var(--quick-link-accent-${accent})` : undefined,
  };
  const hint = KIND_HINT[link.kind];

  return (
    <div
      className={`quick-link-card quick-link-card-${accent}`}
      style={style}
      onClick={() => handleClick(link)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick(link);
        }
      }}
    >
      {showSelector ? (
        <Checkbox
          className="quick-link-card-checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(link.id)}
        />
      ) : null}
      <div className="quick-link-card-title">{link.title}</div>
      <div className="quick-link-card-meta">
        {hint.icon}
        <span className="quick-link-card-meta-label">{hint.label}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/quick-links/QuickLinkCard.tsx
git commit -m "feat(web)(phase-6): add QuickLinkCard with kind-aware click handlers"
```

---

## Task 21 — `QuickLinkFormModal`（添加 / 编辑）

**Files:**
- Create: `apps/web/src/features/quick-links/QuickLinkFormModal.tsx`

AntD `Select` 的 `mode="tags"` 在提交时返回 `string[]`，下面的 `handleOk` 展平为单值。

- [ ] **Step 1: 写 QuickLinkFormModal.tsx**

```tsx
import { Form, Input, Modal, Select } from "antd";
import { useEffect } from "react";
import { useQuickLinkMutations } from "./hooks/useQuickLinkMutations";
import type {
  QuickLinkKind,
  QuickLinkPageType,
  QuickLinkRow,
} from "./types";

type Mode =
  | { mode: "create"; pageType: QuickLinkPageType; knownCategories: string[] }
  | { mode: "edit"; initial: QuickLinkRow; knownCategories: string[] };

type Props = Mode & {
  open: boolean;
  onClose: () => void;
};

type FormValues = {
  category: string | string[];
  kind: QuickLinkKind;
  title: string;
  url: string;
};

const KIND_OPTIONS: Array<{ value: QuickLinkKind; label: string }> = [
  { value: "NAVIGATE", label: "跳转（新标签页打开）" },
  { value: "COPY", label: "复制到剪贴板" },
  { value: "DOWNLOAD", label: "下载文件" },
];

export function QuickLinkFormModal(props: Props) {
  const { open, onClose } = props;
  const [form] = Form.useForm<FormValues>();
  const { create, update } = useQuickLinkMutations();
  const loading = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    if (props.mode === "edit") {
      form.setFieldsValue({
        category: [props.initial.category],
        kind: props.initial.kind,
        title: props.initial.title,
        url: props.initial.url,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ kind: "NAVIGATE", category: [] });
    }
  }, [open, props, form]);

  const handleOk = async () => {
    const raw = await form.validateFields();
    const categoryString = Array.isArray(raw.category)
      ? (raw.category[0] ?? "")
      : raw.category;
    const trimmed = categoryString.trim();
    if (!trimmed) {
      form.setFields([{ name: "category", errors: ["请填写分组名称"] }]);
      return;
    }
    if (props.mode === "create") {
      await create.mutateAsync({
        pageType: props.pageType,
        category: trimmed,
        kind: raw.kind,
        title: raw.title,
        url: raw.url,
      });
    } else {
      await update.mutateAsync({
        id: props.initial.id,
        body: {
          category: trimmed,
          kind: raw.kind,
          title: raw.title,
          url: raw.url,
        },
      });
    }
    onClose();
  };

  const categoryOptions = Array.from(new Set(props.knownCategories)).map(
    (c) => ({ value: c, label: c }),
  );

  return (
    <Modal
      open={open}
      title={props.mode === "create" ? "添加快捷入口" : "编辑快捷入口"}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={loading}
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="category"
          label="分组"
          rules={[{ required: true, message: "请填写分组名称" }]}
        >
          <Select
            mode="tags"
            placeholder="例：企业内部数据表"
            options={categoryOptions}
            maxTagCount={1}
          />
        </Form.Item>
        <Form.Item name="kind" label="类型" rules={[{ required: true }]}>
          <Select options={KIND_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="title"
          label="标题"
          rules={[{ required: true, message: "请填写标题" }]}
        >
          <Input placeholder="可包含 emoji，如 🎓 研录学生调研" />
        </Form.Item>
        <Form.Item
          name="url"
          label="URL / 路径"
          rules={[{ required: true, message: "请填写 URL 或下载路径" }]}
        >
          <Input placeholder="https://... 或 /templates/import.rar" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/quick-links/QuickLinkFormModal.tsx
git commit -m "feat(web)(phase-6): add QuickLinkFormModal for create/edit"
```

---

## Task 22 — `QuickLinkDeleteConfirm` helper

**Files:**
- Create: `apps/web/src/features/quick-links/QuickLinkDeleteConfirm.tsx`

- [ ] **Step 1: 写 helper（Modal.confirm-based）**

```tsx
import { Modal } from "antd";
import { quickLinksApi } from "../../services/quickLinks";

export function confirmDeleteQuickLinks(
  ids: string[],
  onDone: () => void,
): void {
  Modal.confirm({
    title: `确定删除所选 ${ids.length} 条快捷入口？`,
    content: "删除后不可恢复。",
    okText: "删除",
    okButtonProps: { danger: true },
    cancelText: "取消",
    async onOk() {
      try {
        for (const id of ids) {
          // 逐条删除以便 audit 单独记录每一项
          // eslint-disable-next-line no-await-in-loop
          await quickLinksApi.remove(id);
        }
      } finally {
        // 即使中途失败也 invalidate 列表，避免残留本地态与服务器不一致
        onDone();
      }
    },
  });
}
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/quick-links/QuickLinkDeleteConfirm.tsx
git commit -m "feat(web)(phase-6): add confirmDeleteQuickLinks helper"
```

---

## Task 23 — `QuickLinkSortModal`（拖拽排序）

**Files:**
- Create: `apps/web/src/features/quick-links/QuickLinkSortModal.tsx`

- [ ] **Step 1: 写 sort modal**

```tsx
import { HolderOutlined } from "@ant-design/icons";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Modal } from "antd";
import { useEffect, useState } from "react";
import { useQuickLinkMutations } from "./hooks/useQuickLinkMutations";
import type { QuickLinkGroup, QuickLinkPageType, QuickLinkRow } from "./types";

type Props = {
  open: boolean;
  pageType: QuickLinkPageType;
  groups: QuickLinkGroup[];
  onClose: () => void;
};

type OrderedRow = Pick<QuickLinkRow, "id" | "title" | "category">;

function SortableItem({ row }: { row: OrderedRow }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <div ref={setNodeRef} style={style} className="quick-link-sort-row">
      <span {...attributes} {...listeners} className="quick-link-sort-handle">
        <HolderOutlined />
      </span>
      <span className="quick-link-sort-title">{row.title}</span>
    </div>
  );
}

export function QuickLinkSortModal({ open, pageType, groups, onClose }: Props) {
  const { reorder } = useQuickLinkMutations();
  const [ordered, setOrdered] = useState<Record<string, OrderedRow[]>>({});

  useEffect(() => {
    if (!open) return;
    const next: Record<string, OrderedRow[]> = {};
    for (const group of groups) {
      next[group.category] = group.items.map((item) => ({
        id: item.id,
        title: item.title,
        category: item.category,
      }));
    }
    setOrdered(next);
  }, [open, groups]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(category: string) {
    return (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setOrdered((prev) => {
        const list = prev[category] ?? [];
        const oldIndex = list.findIndex((r) => r.id === active.id);
        const newIndex = list.findIndex((r) => r.id === over.id);
        return { ...prev, [category]: arrayMove(list, oldIndex, newIndex) };
      });
    };
  }

  const handleOk = async () => {
    const items: Array<{ id: string; sortOrder: number }> = [];
    for (const category of Object.keys(ordered)) {
      ordered[category].forEach((row, idx) => {
        items.push({ id: row.id, sortOrder: (idx + 1) * 10 });
      });
    }
    if (items.length === 0) {
      onClose();
      return;
    }
    await reorder.mutateAsync({ pageType, items });
    onClose();
  };

  return (
    <Modal
      open={open}
      title="调整排序"
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={reorder.isPending}
      okText="保存"
      cancelText="取消"
      width={520}
      destroyOnClose
    >
      {Object.entries(ordered).map(([category, rows]) => (
        <div key={category} className="quick-link-sort-group">
          <div className="quick-link-sort-group-title">{category}</div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd(category)}
          >
            <SortableContext
              items={rows.map((r) => r.id)}
              strategy={verticalListSortingStrategy}
            >
              {rows.map((row) => (
                <SortableItem key={row.id} row={row} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      ))}
    </Modal>
  );
}
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/quick-links/QuickLinkSortModal.tsx
git commit -m "feat(web)(phase-6): add QuickLinkSortModal with @dnd-kit drag reorder"
```

---

## Task 24 — `QuickLinkCenterPage` 共享页面

**Files:**
- Create: `apps/web/src/features/quick-links/QuickLinkCenterPage.tsx`

- [ ] **Step 1: 写 QuickLinkCenterPage.tsx**

```tsx
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SortAscendingOutlined,
} from "@ant-design/icons";
import { Button, Empty, Skeleton, Space, Typography } from "antd";
import { useMemo, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { useQueryClient } from "@tanstack/react-query";
import { QuickLinkCard } from "./QuickLinkCard";
import { QuickLinkFormModal } from "./QuickLinkFormModal";
import { QuickLinkSortModal } from "./QuickLinkSortModal";
import { confirmDeleteQuickLinks } from "./QuickLinkDeleteConfirm";
import { useQuickLinks } from "./hooks/useQuickLinks";
import type { QuickLinkPageType, QuickLinkRow } from "./types";

type Props = {
  pageType: QuickLinkPageType;
  title: string;
  accent: "blue" | "green";
};

export function QuickLinkCenterPage({ pageType, title, accent }: Props) {
  const user = useAuthStore((state) => state.user);
  const canManage = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
  const qc = useQueryClient();
  const { data, isLoading } = useQuickLinks(pageType);
  const [selected, setSelected] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState<false | "create" | "edit">(false);
  const [sortOpen, setSortOpen] = useState(false);

  const groups = data?.groups ?? [];
  const allItems: QuickLinkRow[] = useMemo(
    () => groups.flatMap((g) => g.items),
    [groups],
  );
  const knownCategories = useMemo(
    () => Array.from(new Set(groups.map((g) => g.category))),
    [groups],
  );
  const selectedRow = selected.length === 1
    ? allItems.find((item) => item.id === selected[0]) ?? null
    : null;

  const toggleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const onDelete = () => {
    if (selected.length === 0) return;
    confirmDeleteQuickLinks(selected, () => {
      setSelected([]);
      void qc.invalidateQueries({ queryKey: ["quick-links"] });
    });
  };

  return (
    <div className={`quick-link-center quick-link-center-${accent}`}>
      <div className="quick-link-center-header">
        <Typography.Title level={2} className="quick-link-center-title">
          {title}
        </Typography.Title>
        {canManage ? (
          <Space>
            <Button
              icon={<SortAscendingOutlined />}
              onClick={() => setSortOpen(true)}
            >
              排序
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setFormOpen("create")}
            >
              添加
            </Button>
            <Button
              icon={<EditOutlined />}
              disabled={selected.length !== 1}
              onClick={() => setFormOpen("edit")}
            >
              编辑
            </Button>
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={selected.length === 0}
              onClick={onDelete}
            >
              删除
            </Button>
          </Space>
        ) : null}
      </div>

      {isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : groups.length === 0 ? (
        <Empty
          description={
            canManage
              ? "暂无快捷入口，点击右上角"添加"录入。"
              : "暂无快捷入口。"
          }
        />
      ) : (
        groups.map((group) => (
          <section key={group.category} className="quick-link-group">
            <h3 className="quick-link-group-title">{group.category}</h3>
            <div className="quick-link-grid">
              {group.items.map((item) => (
                <QuickLinkCard
                  key={item.id}
                  link={item}
                  accent={accent}
                  selected={selected.includes(item.id)}
                  onToggleSelect={toggleSelect}
                  showSelector={canManage}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {formOpen === "create" ? (
        <QuickLinkFormModal
          open
          mode="create"
          pageType={pageType}
          knownCategories={knownCategories}
          onClose={() => setFormOpen(false)}
        />
      ) : null}

      {formOpen === "edit" && selectedRow ? (
        <QuickLinkFormModal
          open
          mode="edit"
          initial={selectedRow}
          knownCategories={knownCategories}
          onClose={() => {
            setFormOpen(false);
            setSelected([]);
          }}
        />
      ) : null}

      <QuickLinkSortModal
        open={sortOpen}
        pageType={pageType}
        groups={groups}
        onClose={() => setSortOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/quick-links/QuickLinkCenterPage.tsx
git commit -m "feat(web)(phase-6): add shared QuickLinkCenterPage with 4-button toolbar"
```

---

## Task 25 — `DataCenterPage` 与 `SopCenterPage` 薄 wrapper

**Files:**
- Create: `apps/web/src/features/quick-links/DataCenterPage.tsx`
- Create: `apps/web/src/features/quick-links/SopCenterPage.tsx`

- [ ] **Step 1: 写 DataCenterPage.tsx**

```tsx
import { QuickLinkCenterPage } from "./QuickLinkCenterPage";

export function DataCenterPage() {
  return (
    <QuickLinkCenterPage
      pageType="DATA_TABLE"
      title="数据表快捷跳转中心"
      accent="blue"
    />
  );
}
```

- [ ] **Step 2: 写 SopCenterPage.tsx**

```tsx
import { QuickLinkCenterPage } from "./QuickLinkCenterPage";

export function SopCenterPage() {
  return (
    <QuickLinkCenterPage
      pageType="SOP"
      title="标准作业程序"
      accent="green"
    />
  );
}
```

- [ ] **Step 3: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/quick-links/DataCenterPage.tsx apps/web/src/features/quick-links/SopCenterPage.tsx
git commit -m "feat(web)(phase-6): add DataCenterPage and SopCenterPage wrappers"
```

---

## Task 26 — Router：挂 `/links` 和 `/sop` 实页

**Files:**
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: 编辑 router.tsx**

1. 在顶部 import 区追加：

```typescript
import { DataCenterPage } from "./features/quick-links/DataCenterPage";
import { SopCenterPage } from "./features/quick-links/SopCenterPage";
```

2. 替换 `path: "links"` 的 element 为：

```tsx
{
  path: "links",
  element: (
    <RequireAuth>
      <DataCenterPage />
    </RequireAuth>
  ),
},
```

3. 替换 `path: "sop"` 的 element 为（去掉 `RequireAuth`，保持访客可访问）：

```tsx
{
  path: "sop",
  element: <SopCenterPage />,
},
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/router.tsx
git commit -m "feat(web)(phase-6): mount DataCenterPage and SopCenterPage on /links and /sop"
```

---

## Task 27 — 关于页常量 + `AboutPage`

**Files:**
- Create: `apps/web/src/constants/about.ts`
- Create: `apps/web/src/features/about/AboutPage.tsx`

- [ ] **Step 1: 写 constants/about.ts**

```typescript
export const ABOUT_CONFIG = {
  platformName: "研录教学管理中台",
  version: "1.0.0",
  companyName: "TBD · 请在正式上线前替换",
  feedbackEmail: "feedback@example.com",
  copyrightLine: "© 2026 TBD. All rights reserved.",
  beianNumber: "",
} as const;
```

- [ ] **Step 2: 写 AboutPage.tsx**

```tsx
import { FileSearchOutlined, MailOutlined } from "@ant-design/icons";
import { Button, Divider, Space, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { ABOUT_CONFIG } from "../../constants/about";
import { useAuthStore } from "../../stores/authStore";

export function AboutPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canViewLogs = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";

  return (
    <div className="about-page">
      <div className="about-logo">研录</div>
      <Typography.Title level={2} className="about-platform-name">
        {ABOUT_CONFIG.platformName}
      </Typography.Title>
      <div className="about-version">版本号 v{ABOUT_CONFIG.version}</div>

      <Divider />

      <Space direction="vertical" size={12} className="about-info-block">
        <div>
          <span className="about-info-label">所属企业：</span>
          <span>{ABOUT_CONFIG.companyName}</span>
        </div>
        <div>
          <MailOutlined />{" "}
          <span className="about-info-label">问题反馈：</span>
          <a href={`mailto:${ABOUT_CONFIG.feedbackEmail}`}>
            {ABOUT_CONFIG.feedbackEmail}
          </a>
        </div>
      </Space>

      {canViewLogs ? (
        <div className="about-logs-entry">
          <Button
            type="primary"
            icon={<FileSearchOutlined />}
            onClick={() => navigate("/logs")}
          >
            查看中台日志
          </Button>
        </div>
      ) : null}

      <div className="about-footer">
        <div>{ABOUT_CONFIG.copyrightLine}</div>
        {ABOUT_CONFIG.beianNumber ? (
          <div className="about-beian">备案号：{ABOUT_CONFIG.beianNumber}</div>
        ) : (
          <div className="about-beian about-beian-placeholder">备案号：—</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/constants/about.ts apps/web/src/features/about/AboutPage.tsx
git commit -m "feat(web)(phase-6): add AboutPage with version/company/logs entry"
```

---

## Task 28 — Router：挂 `/about`

**Files:**
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: 编辑 router.tsx**

1. 顶部 import 追加：

```typescript
import { AboutPage } from "./features/about/AboutPage";
```

2. 替换 `path: "about"` 元素为（访客可访问，不裹 `RequireAuth`）：

```tsx
{
  path: "about",
  element: <AboutPage />,
},
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/router.tsx
git commit -m "feat(web)(phase-6): mount AboutPage on /about"
```

---

## Task 29 — Web AuditLog service + hook

**Files:**
- Create: `apps/web/src/features/audit-logs/types.ts`
- Create: `apps/web/src/services/auditLogs.ts`
- Create: `apps/web/src/features/audit-logs/hooks/useAuditLogs.ts`

- [ ] **Step 1: 写 types.ts**

```typescript
export type AuditLogItem = {
  id: string;
  createdAt: string;
  operatorId: string | null;
  operatorUsername: string | null;
  operatorPhone: string | null;
  action: string;
  targetType: string;
  targetId: string;
  fieldName: string | null;
  beforeValue: string | null;
  afterValue: string | null;
};

export type AuditLogListResponse = {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type AuditLogQueryParams = {
  page?: number;
  pageSize?: number;
  operatorId?: string;
  targetType?: string;
  action?: string;
  fromDate?: string;
  toDate?: string;
};
```

- [ ] **Step 2: 写 services/auditLogs.ts**

```typescript
import { api } from "./http";
import type {
  AuditLogListResponse,
  AuditLogQueryParams,
} from "../features/audit-logs/types";

function toQuery(params: AuditLogQueryParams): string {
  const search = new URLSearchParams();
  const set = (k: string, v: unknown) => {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  };
  set("page", params.page);
  set("pageSize", params.pageSize);
  set("operatorId", params.operatorId);
  set("targetType", params.targetType);
  set("action", params.action);
  set("fromDate", params.fromDate);
  set("toDate", params.toDate);
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const auditLogsApi = {
  list: (params: AuditLogQueryParams = {}) =>
    api.get<AuditLogListResponse>(`/audit-logs${toQuery(params)}`),
};
```

- [ ] **Step 3: 写 useAuditLogs.ts**

```typescript
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { auditLogsApi } from "../../../services/auditLogs";
import type { AuditLogQueryParams } from "../types";

export const auditLogsKey = (params: AuditLogQueryParams) =>
  ["audit-logs", params] as const;

export function useAuditLogs(params: AuditLogQueryParams) {
  return useQuery({
    queryKey: auditLogsKey(params),
    queryFn: () => auditLogsApi.list(params),
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 4: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/audit-logs/types.ts apps/web/src/services/auditLogs.ts apps/web/src/features/audit-logs/hooks/
git commit -m "feat(web)(phase-6): add audit logs service + hook"
```

---

## Task 30 — `AuditLogListPage`

**Files:**
- Create: `apps/web/src/features/audit-logs/AuditLogListPage.tsx`

- [ ] **Step 1: 写 AuditLogListPage.tsx**

```tsx
import { Button, DatePicker, Input, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { useAuditLogs } from "./hooks/useAuditLogs";
import type { AuditLogItem, AuditLogQueryParams } from "./types";

type FilterState = {
  operatorId?: string;
  targetType?: string;
  action?: string;
  range?: [Dayjs | null, Dayjs | null] | null;
};

export function AuditLogListPage() {
  const [filters, setFilters] = useState<FilterState>({});
  const [draft, setDraft] = useState<FilterState>({});
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const queryParams: AuditLogQueryParams = {
    page,
    pageSize,
    operatorId: filters.operatorId,
    targetType: filters.targetType,
    action: filters.action,
    fromDate: filters.range?.[0]?.toISOString(),
    toDate: filters.range?.[1]?.toISOString(),
  };

  const { data, isLoading } = useAuditLogs(queryParams);

  const columns: ColumnsType<AuditLogItem> = [
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 180,
      render: (iso: string) => dayjs(iso).format("YYYY-MM-DD HH:mm:ss"),
    },
    {
      title: "操作人",
      width: 180,
      render: (_: unknown, row: AuditLogItem) =>
        row.operatorUsername
          ? `${row.operatorUsername}（${row.operatorPhone?.slice(-4) ?? "----"}）`
          : "系统",
    },
    { title: "动作", dataIndex: "action", width: 180 },
    { title: "目标类型", dataIndex: "targetType", width: 160 },
    { title: "目标 ID", dataIndex: "targetId", width: 200 },
    { title: "字段", dataIndex: "fieldName", width: 120 },
    {
      title: "前值",
      dataIndex: "beforeValue",
      ellipsis: true,
    },
    {
      title: "后值",
      dataIndex: "afterValue",
      ellipsis: true,
    },
  ];

  const onSearch = () => {
    setFilters(draft);
    setPage(1);
  };

  const onReset = () => {
    setDraft({});
    setFilters({});
    setPage(1);
  };

  return (
    <div className="audit-log-page">
      <Typography.Title level={2}>中台日志</Typography.Title>
      <Space wrap size={12} style={{ marginBottom: 16 }}>
        <Input
          placeholder="操作人 ID"
          value={draft.operatorId ?? ""}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, operatorId: e.target.value }))
          }
          style={{ width: 220 }}
        />
        <Input
          placeholder="动作（如 quick_link.create）"
          value={draft.action ?? ""}
          onChange={(e) => setDraft((prev) => ({ ...prev, action: e.target.value }))}
          style={{ width: 240 }}
        />
        <Input
          placeholder="目标类型（如 quick_link）"
          value={draft.targetType ?? ""}
          onChange={(e) =>
            setDraft((prev) => ({ ...prev, targetType: e.target.value }))
          }
          style={{ width: 200 }}
        />
        <DatePicker.RangePicker
          showTime
          value={draft.range ?? undefined}
          onChange={(range) =>
            setDraft((prev) => ({
              ...prev,
              range: range as [Dayjs | null, Dayjs | null] | null,
            }))
          }
        />
        <Button type="primary" onClick={onSearch}>
          查询
        </Button>
        <Button onClick={onReset}>重置</Button>
      </Space>
      <Table<AuditLogItem>
        rowKey="id"
        columns={columns}
        dataSource={data?.items ?? []}
        loading={isLoading}
        pagination={{
          current: page,
          pageSize,
          total: data?.total ?? 0,
          onChange: (next) => setPage(next),
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/audit-logs/AuditLogListPage.tsx
git commit -m "feat(web)(phase-6): add AuditLogListPage (read-only, admin only)"
```

---

## Task 31 — Router：挂 `/logs`

**Files:**
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: 编辑 router.tsx**

1. 顶部 import 追加：

```typescript
import { AuditLogListPage } from "./features/audit-logs/AuditLogListPage";
```

2. 在 AppShell children 数组末尾（`/about` 之后）加：

```tsx
{
  path: "logs",
  element: (
    <RequireAuth>
      <RequireRole roles={["SUPER_ADMIN", "ADMIN"]}>
        <AuditLogListPage />
      </RequireRole>
    </RequireAuth>
  ),
},
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/router.tsx
git commit -m "feat(web)(phase-6): mount AuditLogListPage on /logs (admin only)"
```

---

## Task 32 — 全局样式（卡片网格 + hover 强调色 + sort modal + about）

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: 追加 CSS**

在 `apps/web/src/styles.css` 末尾追加：

```css
/* ---------- Phase 6: QuickLink / About / Audit log ---------- */

:root {
  --quick-link-accent-blue: #1d8cff;
  --quick-link-accent-green: #52c41a;
}

.quick-link-center {
  padding: 24px 32px;
}

.quick-link-center-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  gap: 16px;
  flex-wrap: wrap;
}

.quick-link-center-title {
  margin: 0 !important;
}

.quick-link-group {
  margin-bottom: 32px;
}

.quick-link-group-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px;
  color: #1f2937;
}

.quick-link-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 992px) {
  .quick-link-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .quick-link-grid {
    grid-template-columns: 1fr;
  }
}

.quick-link-card {
  position: relative;
  background: #fff;
  border: 1px solid transparent;
  border-radius: 12px;
  padding: 20px 20px 16px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  cursor: pointer;
  transition:
    transform 120ms ease,
    box-shadow 120ms ease,
    border-color 120ms ease;
  min-height: 104px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.quick-link-card-blue:hover {
  border-color: var(--quick-link-accent-blue);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(29, 140, 255, 0.16);
}

.quick-link-card-green:hover {
  border-color: var(--quick-link-accent-green);
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(82, 196, 26, 0.18);
}

.quick-link-card-title {
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  line-height: 1.5;
  padding-right: 28px;
}

.quick-link-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #6b7280;
  margin-top: 16px;
}

.quick-link-card-meta-label {
  letter-spacing: 0.2px;
}

.quick-link-card-checkbox {
  position: absolute;
  top: 12px;
  right: 12px;
}

/* Sort modal */

.quick-link-sort-group {
  margin-bottom: 16px;
}

.quick-link-sort-group-title {
  font-weight: 600;
  font-size: 13px;
  color: #374151;
  margin-bottom: 6px;
}

.quick-link-sort-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 6px;
}

.quick-link-sort-handle {
  cursor: grab;
  color: #9ca3af;
}

.quick-link-sort-title {
  flex: 1;
  font-size: 13px;
  color: #111827;
}

/* About page */

.about-page {
  padding: 48px 32px;
  max-width: 640px;
  margin: 0 auto;
  text-align: center;
}

.about-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 16px;
  background: #1d8cff;
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 20px;
}

.about-platform-name {
  margin: 0 !important;
}

.about-version {
  color: #6b7280;
  margin-top: 4px;
  margin-bottom: 8px;
}

.about-info-block {
  width: 100%;
  text-align: left;
}

.about-info-label {
  color: #6b7280;
  margin-right: 6px;
}

.about-logs-entry {
  margin: 32px 0;
}

.about-footer {
  margin-top: 40px;
  color: #9ca3af;
  font-size: 12px;
  line-height: 1.6;
}

.about-beian-placeholder {
  opacity: 0.5;
}

/* Audit log page */

.audit-log-page {
  padding: 24px 32px;
}
```

- [ ] **Step 2: 验证构建**

Run:

```bash
pnpm --filter @yanlu/web build
```

Expected：构建成功，CSS 被 Vite 正确打包。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/styles.css
git commit -m "feat(web)(phase-6): add CSS for QuickLink grid/cards/sort modal and about page"
```

---

## Task 33 — 静态模板目录与 `.gitignore`

**Files:**
- Create: `apps/web/public/templates/README.md`
- Modify: `.gitignore`

- [ ] **Step 1: 写 `apps/web/public/templates/README.md`**

```markdown
# `/templates`

此目录用于存放 `QuickLinkKind=DOWNLOAD` 类快捷入口所引用的静态文件。

示例：spec §7.1 中"📦 模板：从 Excel 导入员工、学生、课程" 对应的压缩包，放置为 `import.rar`，则在后台新增 QuickLink 时填 `url = /templates/import.rar`。

实际二进制文件不进仓库（见 `.gitignore`），由运维 / 管理员上线时手动放入对应环境的 `apps/web/public/templates/` 下。
```

- [ ] **Step 2: 编辑 `.gitignore`**

在仓库根 `.gitignore` 末尾追加：

```
# Phase 6: QuickLink DOWNLOAD 目标文件（实际二进制不进仓库）
apps/web/public/templates/*.rar
apps/web/public/templates/*.zip
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/public/templates/README.md .gitignore
git commit -m "chore(web)(phase-6): reserve public/templates dir and ignore binaries"
```

---

## Task 34 — 端到端手动验收 + 收尾构建

**Files:** 无需改文件。这一步做"端到端冒烟"，发现任何问题回到对应 Task 修复后再继续。

- [ ] **Step 1: 全量构建两边**

Run：

```bash
pnpm --filter @yanlu/api build
pnpm --filter @yanlu/web build
```

Expected：都成功。

- [ ] **Step 2: 启动本地栈**

```bash
docker compose up -d db minio
pnpm dev:api         # 终端 A
pnpm dev:web         # 终端 B
```

Expected：API 监听 :3000；Web 监听 :5173。Nest 日志出现 `Nest application successfully started`，无 `[Nest] ERROR` 行。

- [ ] **Step 3: 访客路径**

打开无痕浏览器：
1. 访问 `http://localhost:5173/sop` — 应直接可看 SOP 页（即使空列表，显示 `<Empty>` "暂无快捷入口。"），没有登录拦截。
2. 访问 `http://localhost:5173/about` — 应看到平台名、版本 `1.0.0`、反馈邮箱 mailto 链接；不应该看到"查看中台日志"按钮；底部显示备案占位。
3. 访问 `http://localhost:5173/links` — 应跳到未登录页（`UnauthorizedPage kind="guest"`），能点"前往登录"。
4. 直接访问 `http://localhost:5173/logs` — 应跳到未登录页。

- [ ] **Step 4: 超管路径**

登录超管账号后：
1. 左侧导航看见 数据表 / SOP / 关于 三项（原有 7 项完整）。
2. 进 `/links`，右上应有 4 个按钮：排序 / 添加 / 编辑 / 删除，未选中时编辑/删除禁用。
3. 点"添加"，填 `category="企业内部数据表"`、`kind=NAVIGATE`、`title="🎓 测试卡片"`、`url="https://example.com"`，提交；卡片出现，hover 时蓝边上浮。
4. 新增一条 `kind=COPY` 的卡片，`url="https://copy.example"`，点击后应见 toast "链接已复制"；剪贴板实际内容为 `https://copy.example`（可在另一个输入框粘贴验证）。
5. 新增一条 `kind=DOWNLOAD`，`url="/templates/import.rar"`；点击后浏览器触发下载（即使文件不存在也会 404，只要发起下载请求说明路径正确）。
6. 勾选一张卡片，点"编辑"，改标题，保存；列表刷新。
7. 勾选两张卡片，点"删除"，确认；两张都消失。
8. 点"排序"，拖动一条换位置，保存；关闭后列表顺序反映变化。
9. 切到 `/sop`，重复 3-8，注意 hover 应为绿边。
10. 切到 `/about`，应看到"查看中台日志"按钮；点击进入 `/logs`。
11. `/logs` 页应能看到此前所有操作产生的审计行，按时间倒序。

- [ ] **Step 5: 普通成员（MEMBER）路径**

（若本地无 MEMBER 账号可跳过此步；否则：）登录一个 MEMBER：
1. `/links` 可进但无 4 个管理按钮。
2. `/sop` 同上。
3. `/about` 无"查看中台日志"按钮。
4. `/logs` 跳 `UnauthorizedPage kind="forbidden"`。

- [ ] **Step 6: 停服务并回归"验收标准"清单（来自 spec §9）**

挨条核对 [设计文档 §11](../specs/2026-04-23-phase-6-data-sop-about-design.md#11-验收标准对齐-spec-9) 每条是否满足。

- [ ] **Step 7: 如有发现问题，回到相应 Task 修复并补 commit；否则无需新 commit。**

---

## Spec Coverage Map

| Spec 条款 | 落地 Task |
| --- | --- |
| §4 数据表页（三列、分组、4 按钮、蓝 hover） | Task 20 / 24 / 25 / 32 |
| §5 SOP 页（复用骨架、绿 hover、访客） | Task 25 / 26 / 32 |
| §6 关于页（Logo / 版本 / 企业 / 邮箱 / 日志入口 / 备案） | Task 27 / 28 / 32 |
| §7.1 / §7.2 预置数据 | 不落地（Q2 决策：管理员手工录入） |
| §7.3 复制类链接 | Task 20 |
| 📦 模板下载 | Task 20 + Task 33 |
| §8 权限规则（访客 SOP/关于可访，数据表需登录，日志仅管理员） | Task 8 / 26 / 28 / 31 / 13 |
| §9 验收标准 | Task 34 |
| 全局 spec §4.3 日志 180 天 | Task 14 + Task 15 |
| 全局 spec §5.6 卡片入口体系 | Task 32 |
