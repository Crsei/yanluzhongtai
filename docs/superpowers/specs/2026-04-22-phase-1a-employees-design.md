# Phase 1A — 员工模块 · 实现设计

> 对应需求：[docs/spec/02-Phase1-员工与用户管理.md](../../spec/02-Phase1-员工与用户管理.md) §4–§7
> 上游：[Phase 0 · 基础架构与认证](./2026-04-22-phase-0-auth-foundation-design.md)
> 配套姊妹设计（待出）：Phase 1B · 用户与权限管理（spec 同文档 §8–§10）

## 1. 范围与决策摘要

Phase 1 整体被拆为两个子阶段：

- **1A（本设计）** — 员工 CRUD、Excel 导入、员工对象存储基础设施、工号原子分配、AuditLog 公共服务
- **1B（下个迭代）** — 用户设置页、全部用户管理、角色提升、重置密码、注销账号

1A 不引入用户管理任何新页面、不动 `User` 模型；只复用 Phase 0 已落地的 `RequireAuth` / `RequireRole` 做按钮级和路由级权限。

| # | 决策 | 选择 | 备注 |
| --- | --- | --- | --- |
| Q1 | Phase 1 切分 | 1A 员工 / 1B 用户，先 1A | 设计 + 计划 + 实施分两轮，每轮 PR 更聚焦 |
| Q2 | Excel 导入 | 完整闭环 | 模板下载、字段校验、批量分配工号、错误回执 |
| Q3 | 文件上传 | MinIO 直传 + 公共 `storage` 模块 | 后端发 presign URL，前端直传 MinIO |
| Q4 | 枚举 / 字典 | TS 常量 + Prisma `EmploymentStatus` enum | DB 字典模块留给后续运营迭代 |
| Q5 | 工号生成 | 新建 `IdSequence(kind, year, lastSeq)` 表 | Postgres `INSERT ... ON CONFLICT` 原子分配；删除不回收 |
| Q6 | 删除语义 | 硬删 + 后端关联保护 | 引用 `PayrollSettlement` / `Course` / `Student(counselorJobNo, plannerJobNo)` 时拒绝并提示改状态 |
| Q7 | AuditLog 粒度 | 行为级 + 字段级混合 | 公共 `AuditLogService.record({ action, target, before, after })` |
| Q8 | "负责的课程" | DTO 占位返空 + 前端"待课程模块上线后自动同步" | Phase 3 切真实查询，前端零改动 |

---

## 2. 高层架构

```
┌── apps/web ─────────────────────────────────────┐    ┌── apps/api ─────────────────────────────────┐
│ features/employees/                              │    │ modules/employees/                            │
│   EmployeeListPage.tsx                            │    │   employees.controller.ts                      │
│     └─ TanStack Query useEmployees()              │    │   employees.service.ts                         │
│   EmployeeFormModal.tsx (view / edit / create)    │    │   employees-import.service.ts                  │
│   EmployeeDeleteConfirm.tsx                       │    │   dto/{create,update,query,import}.dto.ts      │
│   EmployeeImportDrawer.tsx                        │    │                                                 │
│   EmployeeAttachmentUpload.tsx                    │────┤ modules/storage/                              │
│     └─ MinIO presign 直传                         │    │   storage.controller.ts (presign 端点)         │
│ services/employees.ts (api 包装)                  │    │   storage.service.ts (MinIO client + ensure)   │
│ services/storage.ts (presign + 直传)              │    │                                                 │
│ constants/dictionaries.ts (前端只读字典)           │    │ modules/audit-logs/                           │
│ hooks/useEmployees.ts / useEmployeeMutations.ts   │    │   audit-logs.service.ts (公共 record())        │
│                                                   │    │                                                 │
│ router.tsx: /employees → EmployeeListPage         │    │ common/id-sequence/                           │
│   被 RequireAuth + RequireRole 包裹               │    │   id-sequence.service.ts (allocate / allocateBatch) │
└───────────────────────────────────────────────────┘    │                                                 │
                                                          │ common/dictionaries.ts (后端校验白名单)         │
                                                          │                                                 │
                                                          │ prisma/schema.prisma:                           │
                                                          │   + enum EmploymentStatus                       │
                                                          │   + model IdSequence                            │
                                                          │   ~ Employee.employmentStatus -> enum           │
                                                          └──────────────────────────────────────────────┘
                                                                              │
                                                          ┌─── infra ────────┴──────┐
                                                          │ Postgres (db)            │
                                                          │ MinIO (s3 兼容对象存储)  │
                                                          │   bucket: yanlu-attachments │
                                                          └──────────────────────────┘
```

**典型时序**：

```
列表查询:
  web  EmployeeListPage 挂载
  web  useEmployees({ keyword, page }) → api.get('/employees?...')
  api  EmployeesController.list → EmployeesService.list (Prisma findMany + 排序)
  web  渲染表格 + 工具按钮联动状态

新增员工:
  web  点击"添加员工" → 打开 EmployeeFormModal (mode='create')
  web  (可选) 拖拽附件 → services/storage.requestPresign(filename, contentType)
  api  StorageController.presign → storage.service.signUpload → 返回 { putUrl, getUrl, key }
  web  fetch(putUrl, { method: 'PUT', body: file }) → 直传 MinIO
  web  表单提交 → api.post('/employees', { ..., attachmentKeys: [key] })
  api  EmployeesController.create → service.create:
       1. validate DTO (class-validator + dictionaries 白名单)
       2. idSequenceService.allocate('employee', hireYear)
       3. prisma.employee.create + auditLogsService.record({ action: 'create', target, after })
  web  Modal 关闭 + invalidate queryKey ['employees']

编辑员工:
  web  勾选 1 行 → "编辑" 启用 → 打开 EmployeeFormModal (mode='edit')
  web  表单提交 → api.put('/employees/:id', { ... })
  api  service.update:
       1. 取 before 快照
       2. validate + 应用更新
       3. auditLogsService.record({ action: 'update', target, before, after }) → 拆字段级 N 条

删除员工:
  web  勾选 1 行 → "删除" 启用 → EmployeeDeleteConfirm（强提醒文案）
  web  确认 → api.delete('/employees/:id')
  api  service.delete:
       1. 取快照
       2. 检查 PayrollSettlement.employeeJobNo / Course.actualTeacherJobNo / Student.counselorJobNo / Student.plannerJobNo
       3. 有引用 → 409 Conflict + message "该员工有关联学生/薪酬/课程，不可删除..."
       4. 无引用 → prisma.employee.delete + auditLogsService.record({ action: 'delete', target, before })

Excel 导入:
  web  EmployeeImportDrawer
  web  下载模板 → /api/employees/import/template (二进制 xlsx)
  web  上传 → api.post('/employees/import/dry-run', { fileKey })  -- 先走预校验
  api  importService.dryRun: 解析 + 校验，不入库；返回 { valid: [...], errors: [{ row, field, message }] }
  web  显示校验报告；用户点"确认导入"
  web  api.post('/employees/import/commit', { fileKey })
  api  importService.commit:
       1. 重新解析 + 校验（防止预校验后被改）
       2. 按 hireYear 聚合，调 idSequenceService.allocateBatch('employee', year, count)
       3. prisma.employee.createMany 单事务
       4. auditLogsService.record 每条
       5. 返回 { created: N, errors: [] }
```

---

## 3. Prisma schema 增量

`apps/api/prisma/schema.prisma`：

```prisma
enum EmploymentStatus {
  FULL_TIME    // 全职
  PART_TIME    // 兼职
  RESIGNED     // 已离职
}

model Employee {
  id               String           @id @default(cuid())
  jobNo            String           @unique
  name             String
  gender           String           // 暂保持 String（未升 enum，避免与 Student 重复）
  employmentStatus EmploymentStatus @default(FULL_TIME)  // ← 改：String → enum
  jobTitle         String                                 // spec §4.1 "具体工作职责"，自由文本
  hireDate         DateTime?
  phone            String?
  bankCardNo       String?
  bankName         String?
  source           String?
  servingFor       String[]         // 多选；后端用 dictionaries.EMPLOYEE_SERVING_FOR 校验
  resumeText       String?
  attachmentKeys   String[]         // MinIO object key 列表
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([name])  // 姓名升序可直接复用；在职/离职优先级由查询时 CASE 映射
}

model IdSequence {
  kind     String   // 'employee' | 'student' | 'course'（后续阶段复用）
  year     Int      // 'student' / 'employee' 用 YY 对应的全年；'course' 在自身阶段再细化
  lastSeq  Int      @default(0)
  updatedAt DateTime @updatedAt

  @@id([kind, year])
}
```

**变更说明**：

- `Employee.employmentStatus` 由 `String` 升 enum；现有数据 0 行（首次实装），不需要 backfill。`prisma db push --accept-data-loss` 可处理。
- `Employee.jobTitle` 之前已是 `String`，spec 里"具体工作职责"沿用此字段，不改名。
- 员工列表排序语义保持与 spec 一致：`FULL_TIME` 与 `PART_TIME` 同优先级，统一视为“在职”，随后按姓名升序；`RESIGNED` 最后。实现时使用 `CASE WHEN employmentStatus = 'RESIGNED' THEN 1 ELSE 0 END ASC, name ASC`，而不是直接按 `employmentStatus ASC, name ASC`。
- `IdSequence` 复合主键 `(kind, year)`，每次分配走 raw SQL `INSERT ... ON CONFLICT (kind, year) DO UPDATE SET lastSeq = IdSequence.lastSeq + $delta RETURNING lastSeq`。删除员工不动这张表 → 删除不回收。

**迁移路径**：当前项目仍用 `prisma db push`（非 migrate）。开发者需跑 `pnpm prisma:generate && pnpm prisma:push`。`docs/technical/deployment.md` 已警示生产前要切 `prisma migrate`，本阶段不动这条决策。

---

## 4. 后端详设（apps/api）

### 4.1 依赖增补

`apps/api/package.json`：

- `minio` ^8 — MinIO Node SDK（presign + ensureBucket）
- `exceljs` ^4 — xlsx 解析与生成（比 `xlsx` 包更友好的流式 API、活跃维护）
- `@types/multer` ^1（dev） — 留给可选的"模板上传"端点；不强制使用

不引 `@nestjs/platform-fastify` 等。

### 4.2 `common/dictionaries.ts`

集中所有"前后端共享、强校验、改动需发版"的常量：

```ts
export const EMPLOYMENT_STATUS = ['FULL_TIME', 'PART_TIME', 'RESIGNED'] as const
export type EmploymentStatus = typeof EMPLOYMENT_STATUS[number]
export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  FULL_TIME: '全职',
  PART_TIME: '兼职',
  RESIGNED:  '已离职',
}
export const EMPLOYMENT_STATUS_SORT: Record<EmploymentStatus, number> = {
  FULL_TIME: 0,
  PART_TIME: 0,   // spec §4.3：全职/兼职同优先级在前
  RESIGNED:  1,
}

export const GENDER = ['男', '女'] as const
export type Gender = typeof GENDER[number]

export const EMPLOYEE_SOURCE = ['研录', '招聘/临时', '渠道合作', '其他'] as const
export type EmployeeSource = typeof EMPLOYEE_SOURCE[number]

export const EMPLOYEE_SERVING_FOR = ['研录保研', '研录考研', '高途', '内部管理', '其他'] as const
export type EmployeeServingFor = typeof EMPLOYEE_SERVING_FOR[number]
```

校验：DTO 用 `@IsIn(EMPLOYMENT_STATUS)` / `@IsIn(GENDER)` / `@IsIn(EMPLOYEE_SOURCE)` / `@IsArray + each: @IsIn(EMPLOYEE_SERVING_FOR)`。

前端 `apps/web/src/constants/dictionaries.ts` 维护一份**等价但独立**的拷贝（不通过 `packages/` 共享，沿用项目现状），下拉选项直接读。两份保持同步靠 code review；spec 增加新值时同时改两处。注意这里是**员工来源**与**正服务于**字典，不要复用学生侧“服务群所在平台”的字典。

### 4.3 `common/id-sequence/`

**`id-sequence.module.ts`**：`@Global()`，提供 `IdSequenceService`，导出供任何业务模块注入。

**`id-sequence.service.ts`**：

```ts
@Injectable()
export class IdSequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** 单次分配：返回 lastSeq 对应的下一个序号 */
  async allocate(kind: 'employee' | 'student' | 'course', year: number): Promise<number> {
    return this.allocateBatch(kind, year, 1).then(arr => arr[0])
  }

  /** 批量分配：返回 N 个连续序号 */
  async allocateBatch(kind: string, year: number, count: number): Promise<number[]> {
    if (count < 1) return []
    const rows = await this.prisma.$queryRaw<{ lastSeq: number }[]>`
      INSERT INTO "IdSequence" ("kind", "year", "lastSeq", "updatedAt")
      VALUES (${kind}, ${year}, ${count}, now())
      ON CONFLICT ("kind", "year")
      DO UPDATE SET "lastSeq" = "IdSequence"."lastSeq" + ${count}, "updatedAt" = now()
      RETURNING "lastSeq"
    `
    const lastSeq = rows[0].lastSeq
    const start = lastSeq - count + 1
    return Array.from({ length: count }, (_, i) => start + i)
  }

  /** 工号格式化：YY + NNN 三位左补零 */
  static formatEmployeeJobNo(year: number, seq: number): string {
    const yy = String(year).slice(-2).padStart(2, '0')
    return `${yy}${String(seq).padStart(3, '0')}`
  }
}
```

特性：
- Postgres upsert，单语句原子；并发安全。
- 删除员工不动 `IdSequence`，`lastSeq` 只增不减 → 工号永不回收。
- 批量返回连续号，Excel 一次导入 50 行只走一次 SQL。

### 4.4 `modules/storage/`

**`storage.module.ts`**：`@Global()`，导出 `StorageService`。

**`storage.service.ts`**：

```ts
@Injectable()
export class StorageService implements OnModuleInit {
  private client: Minio.Client
  private bucket: string

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.client = new Minio.Client({
      endPoint: this.config.getOrThrow('MINIO_ENDPOINT'),
      port: Number(this.config.get('MINIO_PORT', '9000')),
      useSSL: this.config.get('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.config.getOrThrow('MINIO_ACCESS_KEY'),
      secretKey: this.config.getOrThrow('MINIO_SECRET_KEY'),
    })
    this.bucket = this.config.getOrThrow('MINIO_BUCKET')

    const exists = await this.client.bucketExists(this.bucket).catch(() => false)
    if (!exists) await this.client.makeBucket(this.bucket)
  }

  /**
   * 生成上传 presign URL；key 由后端定，避免前端注入路径
   * folder 例：'employees/attachments'
   */
  async signUpload(folder: string, originalName: string, contentType: string) {
    const key = `${folder}/${cuid()}-${sanitize(originalName)}`
    const putUrl = await this.client.presignedPutObject(this.bucket, key, 60 * 5)  // 5 分钟
    return { key, putUrl, contentType }
  }

  /** 生成下载 presign URL（限时） */
  async signDownload(key: string, ttlSeconds = 60 * 10) {
    return this.client.presignedGetObject(this.bucket, key, ttlSeconds)
  }
}
```

**`storage.controller.ts`**：

```ts
@Controller('storage')
@UseGuards(JwtAuthGuard)   // 全局已挂；这里语义化重申
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post('uploads/sign')
  async signUpload(@Body() dto: SignUploadDto) {
    // dto: { folder: 'employees/attachments', filename: string, contentType: string }
    return this.storage.signUpload(dto.folder, dto.filename, dto.contentType)
  }

  @Get('downloads/sign')
  async signDownload(@Query('key') key: string) {
    return { url: await this.storage.signDownload(key) }
  }
}
```

**安全约束**：
- `folder` 走白名单：`['employees/attachments', 'employees/import-batches']`，其它一律 400。
- `signDownload` 校验 `key` 必须落在已知 folder 之一。
- 文件大小、扩展名校验放在前端 + MinIO bucket policy（Phase 1A 不引入服务端 multipart 中转，避免 Node 内存压力）。

### 4.5 `modules/audit-logs/`

**`audit-logs.service.ts`**：

```ts
type RecordInput = {
  operatorId: string | null
  action: 'create' | 'update' | 'delete' | 'reset_password' | 'deactivate' | 'register' | 'settle'
  targetType: 'employee' | 'user' | 'course' | 'payroll' | string
  targetId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordInput) {
    const { action, before, after, ...rest } = input

    // 行为级：create / delete / 无 diff 的 update
    if (action !== 'update' || !before || !after) {
      await this.prisma.auditLog.create({
        data: {
          ...rest, action,
          fieldName: null,
          beforeValue: before ? JSON.stringify(before) : null,
          afterValue:  after  ? JSON.stringify(after)  : null,
        },
      })
      return
    }

    // 字段级：update 拆条
    const changedFields = diffKeys(before, after)
    if (changedFields.length === 0) return  // 无实质变更不写
    await this.prisma.auditLog.createMany({
      data: changedFields.map(field => ({
        ...rest, action,
        fieldName: field,
        beforeValue: stringify(before[field]),
        afterValue:  stringify(after[field]),
      })),
    })
  }
}
```

公共服务，1A 内只被 `EmployeesService` 注入；1B、Phase 2+ 都能复用。模块加 `@Global()` 导出。

### 4.6 `modules/employees/`

**`employees.controller.ts`** — 全部走 `JwtAuthGuard`（全局），写操作另加 `@Roles('SUPER_ADMIN', 'ADMIN')`：

| 方法 | 路径 | 守卫 | 说明 |
| --- | --- | --- | --- |
| GET  | `/employees` | 登录即可 | 列表，支持 `keyword` / `page` / `pageSize`（默认 50）/ `employmentStatus` 过滤 |
| GET  | `/employees/:id` | 登录即可 | 详情；含 `relatedCourses: []` 占位 |
| POST | `/employees` | `@Roles(SUPER_ADMIN, ADMIN)` | 新建，自动分工号 |
| PUT  | `/employees/:id` | `@Roles(SUPER_ADMIN, ADMIN)` | 整体更新；`jobNo` 字段忽略输入 |
| DELETE | `/employees/:id` | `@Roles(SUPER_ADMIN, ADMIN)` | 硬删 + 关联保护 |
| GET  | `/employees/import/template` | `@Roles(SUPER_ADMIN, ADMIN)` | 返回 xlsx 二进制（attachment） |
| POST | `/employees/import/dry-run` | `@Roles(SUPER_ADMIN, ADMIN)` | body `{ fileKey }`，预校验 |
| POST | `/employees/import/commit` | `@Roles(SUPER_ADMIN, ADMIN)` | body `{ fileKey }`，正式入库 |

**`employees.service.ts`** 关键逻辑：

- `list({ keyword, page, pageSize, employmentStatus })`
  - 普通搜索：1A 简化版只做 Postgres `ILIKE '%keyword%'`，匹配 `name | jobNo | phone`。spec §4.4 全局规则提到的"字符相对顺序匹配"作为优化项延后（spec 未强制 1A 必须落地）。一旦后续阶段需要，可在同一 service 方法上叠 Node 端二次过滤，无需破坏接口。
  - 排序：先按 `EMPLOYMENT_STATUS_SORT` 映射的优先级，再按 `name` 拼音升序。Postgres 端用 `ORDER BY CASE employmentStatus WHEN 'RESIGNED' THEN 1 ELSE 0 END, name COLLATE "zh-x-icu"`（CI/CD 暂不强制 ICU collation；如目标库无 ICU 支持，回退到普通 `ORDER BY name`）。
  - 返回 `{ items, total, page, pageSize }`。

- `create(dto, operator)`
  - 取 `hireDate ?? new Date()` 的年份做 YY；`hireDate` 为空时按当前服务器年份。
  - `idSequenceService.allocate('employee', year)` 拿 NNN，组装 `jobNo = YY + NNN(3)`。
  - 写库 + AuditLog。
  - 返回新员工。

- `update(id, dto, operator)`
  - 取 before 快照（去除内部字段）。
  - `jobNo` / `id` / `createdAt` 永远忽略输入。
  - 写库 + AuditLog（field-level）。

- `remove(id, operator)`
  - 取 before 快照。
  - 关联检查：
    - `prisma.payrollSettlement.count({ where: { employeeJobNo: emp.jobNo } })`
    - `prisma.course.count({ where: { actualTeacherJobNo: emp.jobNo } })`
  - 任一 > 0 → `throw new ConflictException('该员工有关联薪酬/课程，不可删除，请将状态改为已离职')`。
  - 否则 `prisma.employee.delete`，写 AuditLog。

- `findOne(id)`
  - 返回员工对象 + `relatedCourses: []`（Phase 1A 占位；Phase 3 切真实实现）。

**`employees-import.service.ts`**：

- `parseTemplate(buffer)`：用 `exceljs` 读，预期列：工号(忽略，由后端分配)、姓名、性别、雇佣状态、工作职责、入职日期、电话、银行卡号、开户行、来源、正服务于(分号分隔)、简历文字。
- `validateRow(row, lineNo)`：
  - 必填：姓名、性别、雇佣状态、工作职责
  - 字段值：枚举字段必须落在 `dictionaries` 白名单
  - 日期：`hireDate` 必须能被 `dayjs` 解析
  - 重复检测：DTO 内是否同名同手机号（spec 未强制 unique，按 warning 提示）
- `dryRun(fileKey)`：从 MinIO 取文件 → 解析 → 校验，返回 `{ totalRows, validRows: N, errors: [{ row, field, message }] }`，不入库。
- `commit(fileKey, operator)`：
  - 重新解析 + 校验（防 TOCTOU）；任何 error → 拒绝整批。
  - 按 `hireYear` 分组，对每个 year 调 `idSequenceService.allocateBatch('employee', year, count)`。
  - 在 `prisma.$transaction` 内 `createMany` + 多条 AuditLog。
  - 返回 `{ created, errors: [] }`。
  - 完成后 *不*删除 MinIO 上的源文件（运营审计可追溯；按 bucket lifecycle 自动清理）。

**`dto/`** — 全部用 `class-validator`：

```ts
// create.dto.ts
export class CreateEmployeeDto {
  @IsString() @MaxLength(50) name: string
  @IsIn(GENDER) gender: Gender
  @IsIn(EMPLOYMENT_STATUS) employmentStatus: EmploymentStatus
  @IsString() @MaxLength(100) jobTitle: string
  @IsOptional() @IsDateString() hireDate?: string
  @IsOptional() @IsString() @Matches(/^1[3-9]\d{9}$/) phone?: string
  @IsOptional() @IsString() bankCardNo?: string
  @IsOptional() @IsString() bankName?: string
  @IsOptional() @IsIn(EMPLOYEE_SOURCE) source?: EmployeeSource
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(SERVICE_PLATFORM, { each: true }) servingFor?: ServicePlatform[]
  @IsOptional() @IsString() @MaxLength(5000) resumeText?: string
  @IsOptional() @IsArray() @IsString({ each: true }) attachmentKeys?: string[]
}

// update.dto.ts: 同上但所有字段 @IsOptional
// query.dto.ts: keyword? / page? / pageSize? / employmentStatus?
// import-dryrun.dto.ts: { fileKey: string }
// import-commit.dto.ts: { fileKey: string }
```

### 4.7 `app.module.ts` 增量

```ts
imports: [
  ...,
  IdSequenceModule,
  StorageModule,
  AuditLogsModule,
  EmployeesModule,
],
```

### 4.8 env / config

`apps/api/src/config/env.validation.ts` required 列表追加：

- `MINIO_ENDPOINT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`

可选：`MINIO_PORT`（默认 9000）、`MINIO_USE_SSL`（默认 `false`）。

`apps/api/.env.example` + 根 `.env.example` 同步追加。

---

## 5. 前端详设（apps/web）

### 5.1 依赖增补

无新增三方包：AntD `Table`、`Modal`、`Drawer`、`Upload`、`DatePicker`、`Select` 已可覆盖。Excel 导入靠后端解析，前端只上传文件。

### 5.2 `constants/dictionaries.ts`

后端 `common/dictionaries.ts` 的镜像，含：枚举值、label 中文映射、Select 用的 `{ value, label }[]` 衍生数组。

### 5.3 `services/employees.ts`

```ts
export const employeesApi = {
  list: (params: EmployeeQueryParams) => api.get<EmployeeListResponse>('/employees', { ...withQuery(params) }),
  detail: (id: string) => api.get<EmployeeDetail>(`/employees/${id}`),
  create: (body: CreateEmployeeBody) => api.post<EmployeeDetail>('/employees', body),
  update: (id: string, body: UpdateEmployeeBody) => api.put<EmployeeDetail>(`/employees/${id}`, body),
  remove: (id: string) => api.delete<void>(`/employees/${id}`),
  importDryRun: (fileKey: string) => api.post<ImportReport>('/employees/import/dry-run', { fileKey }),
  importCommit: (fileKey: string) => api.post<ImportReport>('/employees/import/commit', { fileKey }),
  downloadTemplate: () => downloadAuthed('/employees/import/template', '员工导入模板.xlsx'),
}
```

`http.ts` 需要补一个 `downloadAuthed(path, filename)` 工具：前端用当前 access token 发请求拿 blob，再触发 `<a download>`。不要把受保护模板下载做成浏览器直链跳转，否则管理员/超级管理员接口会直接 401。

### 5.4 `services/storage.ts`

```ts
export const storageApi = {
  signUpload: (folder: 'employees/attachments' | 'employees/import-batches', filename: string, contentType: string) =>
    api.post<{ key: string; putUrl: string }>('/storage/uploads/sign', { folder, filename, contentType }),
  signDownload: (key: string) =>
    api.get<{ url: string }>(`/storage/downloads/sign?key=${encodeURIComponent(key)}`),
}

export async function uploadToStorage(folder, file: File): Promise<string> {
  const { key, putUrl } = await storageApi.signUpload(folder, file.name, file.type)
  const res = await fetch(putUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
  if (!res.ok) throw new Error('文件上传失败')
  return key
}
```

### 5.5 `features/employees/`

#### `EmployeeListPage.tsx`

布局严格按 spec §4.1 + fig06：

- 标题 "员工信息管理" 左上对齐
- 工具按钮组 `<Space>`，从左到右：查看、编辑、添加员工、删除员工、从 Excel 导入
- 工具组与右侧搜索框之间用 `<div style={{ flex: 1 }}>` 撑开（spec §5.4：搜索框不贴按钮组）
- AntD `<Table rowSelection={{ type: 'checkbox' }}>`，首列复选框
- 列：工号、姓名、性别、具体工作职责、电话号码、来源、正服务于、状态（带颜色 Tag）
- `pageSize: 50`，`pagination` 配 spec §4.4
- 状态联动（spec §4.2）：
  ```ts
  const selectedCount = selectedRowKeys.length
  const canView = selectedCount === 1
  const canEdit = selectedCount === 1
  const canDelete = selectedCount >= 1
  ```
  按钮 `disabled={!canView}` 等。
- "添加员工" 始终启用（具备 ADMIN+ 角色才显示，靠 `RequireRole` 包按钮）

#### `EmployeeFormModal.tsx`

按 spec §5：

- `mode: 'create' | 'view' | 'edit'`，view 与 edit 共享同一 form，`disabled` 根据 mode 切换
- AntD `<Modal width={920}>`，内部 `<Form layout="vertical">` + AntD `<Row><Col span={12}>` 双列
- 工号字段固定占位"自动计算/保存后生成"，`<Input disabled value={data?.jobNo ?? '保存后生成'} />`
- 入职日期 `<DatePicker />`
- 正服务于 `<Select mode="multiple" options={SERVICE_PLATFORM_OPTIONS} />`
- 正服务于 `<Select mode="multiple" options={EMPLOYEE_SERVING_FOR_OPTIONS} />`
- 简历文字 `<Input.TextArea rows={5} />`
- 附件简历 `<EmployeeAttachmentUpload />`
- 关联课程 `<div className="related-courses-placeholder">（待课程模块上线后自动同步）</div>`
- Modal 内部滚动：`bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}`
- 底部按钮（spec §5.2）：
  - view 态：`<Modal footer={[ <Button>取消</Button>, <Button type="primary" onClick={() => setMode('edit')}>编辑</Button> ]}>`
  - create / edit 态：`[取消, 确定]`
- 提交：使用 `useEmployeeMutations` 的 `createMutation` / `updateMutation`，成功后 `queryClient.invalidateQueries(['employees'])` + Modal 关闭

#### `EmployeeAttachmentUpload.tsx`

包装 AntD `<Upload>`，关键点：
- `customRequest` 改为走 `uploadToStorage('employees/attachments', file)`，返回 key
- `value: string[]` / `onChange: (keys: string[]) => void`，受控
- 已上传项点击文件名 → 调 `storageApi.signDownload(key)` 开新 tab
- 删除项：仅前端去掉 key（MinIO 上的对象保留，由 lifecycle 清理；避免误删）

#### `EmployeeDeleteConfirm.tsx`

AntD `Modal.confirm`：

- title: "确认删除该员工？"
- icon: `<ExclamationCircleFilled style={{ color: token.colorError }} />`
- content（spec §7 强提醒文案）：
  > 员工离职建议优先在编辑里改状态为"已离职"，不要直接删除。
  > 删除会影响关联数据（薪酬记录、历史课程等），且无法恢复。
- okText: "确认删除"，okButtonProps: { danger: true }
- cancelText: "取消"
- `onOk` → `removeMutation.mutateAsync(id)`，捕获 409 错误展示 `<Alert type="error" message={err.message}>`

#### `EmployeeImportDrawer.tsx`

AntD `<Drawer width={720}>`，三步走：

1. **下载模板**：按钮点击 `employeesApi.downloadTemplate()`，走带鉴权的 blob 下载
2. **上传文件**：`<Upload customRequest>` → `uploadToStorage('employees/import-batches', file)` → 拿到 `fileKey` → 自动调 `importDryRun(fileKey)`
3. **预校验报告**：`<Table>` 展示 errors（行号、字段、消息）；`<Statistic>` 显示总行数 / 有效行数 / 错误行数
4. **确认导入**：errors 为空时启用按钮 → `importCommit(fileKey)` → 弹 `message.success('成功导入 N 名员工')` + invalidate `['employees']` + 关闭 Drawer

#### `hooks/useEmployees.ts`

```ts
export function useEmployees(params: EmployeeQueryParams) {
  return useQuery({
    queryKey: ['employees', params],
    queryFn: () => employeesApi.list(params),
    keepPreviousData: true,
  })
}
```

#### `hooks/useEmployeeMutations.ts`

```ts
export function useEmployeeMutations() {
  const qc = useQueryClient()
  const onSettled = () => qc.invalidateQueries({ queryKey: ['employees'] })

  const createMutation = useMutation({
    mutationFn: employeesApi.create,
    onSuccess: () => message.success('员工已添加'),
    onSettled,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, body }) => employeesApi.update(id, body),
    onSuccess: () => message.success('员工信息已更新'),
    onSettled,
  })

  const removeMutation = useMutation({
    mutationFn: employeesApi.remove,
    onSuccess: () => message.success('员工已删除'),
    onError: (err: HttpError) => {
      if (err.status === 409) message.error(err.message)
      else message.error('删除失败，请稍后重试')
    },
    onSettled,
  })

  return { createMutation, updateMutation, removeMutation }
}
```

### 5.6 `router.tsx` 改动

`/employees` 占位换成真实组件：

```tsx
{
  path: 'employees',
  element: (
    <RequireAuth>
      <EmployeeListPage />
    </RequireAuth>
  ),
},
```

页面内对 ADMIN+ 写按钮，用 `<RequireRole roles={['SUPER_ADMIN', 'ADMIN']} fallback={null}>` 包裹"添加员工 / 编辑 / 删除 / 从 Excel 导入"，让一般成员只能查看。

---

## 6. 后端接口契约

| 方法 | 路径 | 守卫 | 请求 | 响应 |
| --- | --- | --- | --- | --- |
| GET | `/api/employees` | 登录 | query: `keyword?, page?, pageSize?, employmentStatus?` | `{ items: Employee[], total, page, pageSize }` |
| GET | `/api/employees/:id` | 登录 | — | `Employee & { relatedCourses: string[] }` |
| POST | `/api/employees` | `@Roles(SUPER_ADMIN, ADMIN)` | `CreateEmployeeDto` | `Employee` |
| PUT | `/api/employees/:id` | `@Roles(SUPER_ADMIN, ADMIN)` | `UpdateEmployeeDto` | `Employee` |
| DELETE | `/api/employees/:id` | `@Roles(SUPER_ADMIN, ADMIN)` | — | `204 No Content` 或 `409` |
| GET | `/api/employees/import/template` | `@Roles(SUPER_ADMIN, ADMIN)` | — | `application/vnd.openxmlformats-...` 二进制 |
| POST | `/api/employees/import/dry-run` | `@Roles(SUPER_ADMIN, ADMIN)` | `{ fileKey }` | `ImportReport` |
| POST | `/api/employees/import/commit` | `@Roles(SUPER_ADMIN, ADMIN)` | `{ fileKey }` | `{ created: number, errors: [] }` |
| POST | `/api/storage/uploads/sign` | 登录 | `{ folder, filename, contentType }` | `{ key, putUrl }` |
| GET | `/api/storage/downloads/sign?key=...` | 登录 | — | `{ url }` |

`Employee` JSON 形状：

```ts
{
  id: string
  jobNo: string
  name: string
  gender: '男' | '女'
  employmentStatus: 'FULL_TIME' | 'PART_TIME' | 'RESIGNED'
  jobTitle: string
  hireDate: string | null  // ISO
  phone: string | null
  bankCardNo: string | null
  bankName: string | null
  source: string | null
  servingFor: string[]
  resumeText: string | null
  attachmentKeys: string[]
  createdAt: string
  updatedAt: string
}
```

`ImportReport`：

```ts
{
  totalRows: number
  validRows: number
  errors: Array<{ row: number; field: string; message: string }>
}
```

错误响应沿用 NestJS 标准 `{ statusCode, message, error }`；`409` 用于"删除被引用"，前端按 `message.error(err.message)` 直接展示。

---

## 7. 错误处理与边界

| 场景 | 后端行为 | 前端表现 |
| --- | --- | --- |
| DTO 校验失败 | `400 ValidationError` | AntD `Form` 红字段位 + `message.error` 兜底 |
| 工号分配后 `prisma.create` 失败 | 事务回滚，但 `IdSequence` 已 +1 → 该号码空缺 | 用户重试，新号码继续递增（spec §4.2 接受空缺，不回收） |
| MinIO presign 时 bucket 不存在 | 启动时已 ensureBucket；运行期间被人手动删 → 500 | `message.error('文件存储未就绪')` |
| 上传超时（presign 5 分钟） | MinIO 拒绝；前端 fetch 失败 | 提示重新选择文件 |
| Excel 列缺失 | `dryRun` 返回 errors `{ row: 0, field: 'header', message: '缺少列：xxx' }` | Drawer 顶部 Alert，禁用"确认导入" |
| 删除被引用 | `409 ConflictException` | `message.error` 弹 spec §7 文案 |
| 一般成员调写接口 | `403 ForbiddenException` | `message.error('无操作权限')`；按钮在前端已禁用 |

---

## 8. 验收清单（spec §11 映射）

- [ ] `/employees` 不登录访问 → Phase 0 的 `RequireAuth` 跳到无权限页
- [ ] `/employees` 登录访问 → 看到列表 + 工具按钮 + 搜索框，布局对齐 fig06
- [ ] 列表默认按 "全职/兼职 → 已离职" + 姓名升序排序
- [ ] 列表分页每页 50 条
- [ ] 未勾选时，查看 / 编辑 / 删除按钮均禁用
- [ ] 勾选 1 行时，全部按钮启用
- [ ] 勾选 ≥2 行时，查看 / 编辑禁用，删除仍启用
- [ ] "添加员工" 弹窗打开 → 双列布局、工号显示"自动计算/保存后生成"且只读
- [ ] 提交后工号符合 `YYNNN`，例如 `26001`
- [ ] 删除一名工号 `26002` 的员工 → 再添加新员工得到 `26003`，**不**回收 `26002`
- [ ] 查看态底部 "取消 / 编辑"；编辑态 "取消 / 确定"；切换正确
- [ ] 删除点击后弹强提醒，文案与 spec §7 描述一致
- [ ] 试图删除被 `actualTeacherJobNo` / `counselorJobNo` / `plannerJobNo` / `employeeJobNo` 引用的员工 → 后端 409，前端弹"该员工有关联学生/薪酬/课程，不可删除..."
- [ ] 上传简历附件 → MinIO bucket 出现对象；查看时点击文件名能下载
- [ ] Excel 导入：下载模板 → 填 3 行 → 上传得到预校验报告 → 确认导入 → 列表新增 3 条且工号连续
- [ ] Excel 模板缺列 / 枚举值非法 → 预校验报告标出行号 + 字段 + 消息，"确认导入"按钮禁用
- [ ] AuditLog 表对每次创建 / 编辑 / 删除都有写入；编辑改 2 个字段 → 写 2 条 fieldName 不同的记录

测试以手动执行为准；自动化测试基础设施仍不在本阶段范围内。

---

## 9. 范围边界（明确**不**做）

- 用户设置页 / 全部用户管理页 / 重置密码 / 注销账号 / 角色提升（→ Phase 1B）
- 员工高级搜索（多条件组合）；只做 keyword 普通搜索
- 拼音首字母搜索（留作优化）；但普通搜索仍需满足 spec 的“字符相对顺序匹配”语义，不能退化为简单 `ILIKE`
- 真正"负责的课程"数据（→ Phase 3，DTO 已留 `relatedCourses: []` 占位）
- DB 字典模块（→ 后续运营迭代）
- AuditLog 列表 / 检索页面（→ Phase 6 的"关于 → 日志"）
- 自动清理 MinIO 临时文件（依赖 bucket lifecycle 策略，部署文档里给建议但不强制）
- 自动化测试基础设施
- 移动端表单专门优化（沿用 Phase 0 响应式 Drawer）

---

## 10. 变更文件一览

**新增（后端）**：

- `apps/api/src/common/dictionaries.ts`
- `apps/api/src/common/id-sequence/id-sequence.module.ts`
- `apps/api/src/common/id-sequence/id-sequence.service.ts`
- `apps/api/src/modules/storage/storage.module.ts`
- `apps/api/src/modules/storage/storage.service.ts`
- `apps/api/src/modules/storage/storage.controller.ts`
- `apps/api/src/modules/storage/dto/sign-upload.dto.ts`
- `apps/api/src/modules/audit-logs/audit-logs.module.ts`
- `apps/api/src/modules/audit-logs/audit-logs.service.ts`
- `apps/api/src/modules/audit-logs/audit-logs.types.ts`
- `apps/api/src/modules/employees/employees.module.ts`
- `apps/api/src/modules/employees/employees.controller.ts`
- `apps/api/src/modules/employees/employees.service.ts`
- `apps/api/src/modules/employees/employees-import.service.ts`
- `apps/api/src/modules/employees/employees.types.ts`
- `apps/api/src/modules/employees/dto/create-employee.dto.ts`
- `apps/api/src/modules/employees/dto/update-employee.dto.ts`
- `apps/api/src/modules/employees/dto/query-employees.dto.ts`
- `apps/api/src/modules/employees/dto/import.dto.ts`

**新增（前端）**：

- `apps/web/src/constants/dictionaries.ts`
- `apps/web/src/services/employees.ts`
- `apps/web/src/services/storage.ts`
- `apps/web/src/features/employees/EmployeeListPage.tsx`
- `apps/web/src/features/employees/EmployeeFormModal.tsx`
- `apps/web/src/features/employees/EmployeeDeleteConfirm.tsx`
- `apps/web/src/features/employees/EmployeeImportDrawer.tsx`
- `apps/web/src/features/employees/EmployeeAttachmentUpload.tsx`
- `apps/web/src/features/employees/hooks/useEmployees.ts`
- `apps/web/src/features/employees/hooks/useEmployeeMutations.ts`
- `apps/web/src/features/employees/types.ts`

**新增（其它）**：

- `docs/templates/employee-import-template.xlsx`（二进制；可由后端 `import/template` 端点生成后落盘归档）

**修改**：

- `apps/api/prisma/schema.prisma`（+ enum、+ IdSequence、改 `Employee.employmentStatus`）
- `apps/api/src/app.module.ts`（imports）
- `apps/api/src/config/env.validation.ts`（+ MINIO_*）
- `apps/api/package.json`（+ minio、+ exceljs）
- `apps/api/.env.example`（+ MINIO_*）
- `apps/web/src/router.tsx`（替换 `/employees` 占位）
- `apps/web/src/styles.css`（员工页/弹窗/上传相关补丁，按需）
- `.env.example`（+ MINIO_*）
- `docker-compose.yml`（确认 MinIO 公网/容器内 endpoint 一致；按需补 `MINIO_DEFAULT_BUCKETS`）
- `docs/technical/deployment.md`（追加 MinIO 初始化、Excel 导入、删除关联保护说明）
- `README.md`（追加 1A 的本地 bring-up 注意事项，例如先 `prisma:push`）

**不动**：

- `apps/api/src/modules/{users,students,course-outlines,courses,payroll,links}/`（仍是占位）
- `apps/web/src/features/auth/*`（Phase 0 已完整）

---

## 11. 与 Phase 1B 的接口预留

1A 落完后，1B 可以直接复用：

- `AuditLogsService.record({ action: 'reset_password' | 'deactivate' | 'register', target: 'user', ... })`
- `RequireRole roles={['SUPER_ADMIN']}` 包"全部用户管理"路由
- `dictionaries.ts` 已有 `EMPLOYMENT_STATUS`、`SERVICE_PLATFORM` 可被复用作"用户绑定员工"时的展示
- 前端 `services/http.ts`、`stores/authStore.ts` 已能支持自身手机号修改（当 1B 加 `PUT /users/me` 时只需新加 service 文件）

1A 不预先建任何 1B 的空壳模块/路由/页面，避免脏 placeholder。
