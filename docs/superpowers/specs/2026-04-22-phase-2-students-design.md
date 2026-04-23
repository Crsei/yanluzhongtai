# Phase 2 — 学生模块 · 实现设计

> 对应需求：[docs/spec/03-Phase2-学生管理.md](../../spec/03-Phase2-学生管理.md)
> 上游：[Phase 1A · 员工模块](./2026-04-22-phase-1a-employees-design.md)、[Phase 1B · 用户与账号管理](./2026-04-22-phase-1b-users-design.md)

## 1. 范围与决策摘要

本阶段交付学生管理的完整闭环：

- 学生 CRUD（带关联保护）
- Excel 批量导入（模板 → dry-run → commit）
- 列表 + 普通搜索 + 高级搜索（Drawer + URL 持久化）
- 学管老师 / 规划师员工选择器（`<EmployeePicker>` 通用组件）
- 后端年级自动计算 + 排序
- 审计日志（`student.xxx` 语义）

不引入新基础设施：`IdSequenceService` / `AuditLogsService` / `StorageService` 均已在 Phase 1A 落地；`MustChangePasswordGuard` 等 Phase 1B 能力默认继承。测试继续走"人工 curl + 浏览器"，不引入测试框架。

| # | 决策 | 选择 | 备注 |
| --- | --- | --- | --- |
| Q1 | 删除语义 | 硬删 + 关联保护 | 任一 `Enrollment` 存在 → 409；禁删同时建议将 `serviceStatus` 改为 `COMPLETED` / `TERMINATED` |
| Q2 | `serviceStatus` | Prisma enum | 枚举 + `_LABELS` + `_SORT` 字典，与 `EmploymentStatus` 对称 |
| Q3 | Excel 导入 | 完整闭环 | 模板涵盖全部标量字段；附件 / JSON 不通过导入写入 |
| Q4 | 高级搜索 UX | Drawer + URL query | 当前筛选条件显示为 tag 行，支持链接分享 |
| Q5 | 老师选择器 | AntD `Select` 远程搜索 | 封装 `<EmployeePicker>` 组件，Phase 3 课程可复用 |
| Q6 | 年级计算 | 后端单点计算 | 9 月 1 日切学年；列表排序 / 高级搜索 / 详情展示共用 |
| Q7 | 服务字段扩展 | 新增 4 个字段 | `+transcriptKeys` `+overallPlanText` `+policyText` `+attachmentKeys` |
| Q8 | AuditLog action | `student.xxx` 前缀 | 扩 `AuditLogsService`，让 `*.update` 也触发字段级拆条 |
| Q9 | 入学年份可改性 | 锁死 | `UpdateStudentDto` 忽略 `enrollmentYear`；错录走删除重建 |

默认项（与 Phase 1A 一致，不另行征询）：

- **权限**：`GET /students`、`GET /students/:id` 登录即可；写操作（POST / PUT / DELETE、`/students/import/*`）`@Roles(SUPER_ADMIN, ADMIN)`
- **分页**：默认 `pageSize=50`
- **学号流水**：`IdSequenceService.allocate('student', enrollmentYear)`；格式 `YYNNNN`，`YY = enrollmentYear % 100`，`NNNN` 四位左补零
- **Storage folder 白名单追加**：`students/attachments`、`students/import-batches`
- **普通搜索**：`name | studentNo | phone` ILIKE；子序匹配同 Phase 1A 继续延后
- **"二级课程类别" 占位**：后端 DTO 返 `relatedCourseCategories: []`，前端只读区域文案"待课程模块上线后自动同步"

---

## 2. 高层架构

```
┌── apps/web ─────────────────────────────────────┐    ┌── apps/api ─────────────────────────────────┐
│ features/students/                                │    │ modules/students/                             │
│   StudentListPage.tsx                              │    │   students.controller.ts                       │
│     ├─ useStudents()  TanStack Query              │    │   students.service.ts                          │
│     ├─ AdvancedSearchDrawer + URL params          │    │   students-import.service.ts                   │
│     └─ ActiveFilterTags                           │    │   students.types.ts                            │
│   StudentFormModal.tsx (view / edit / create)     │    │   dto/{create,update,query,import}-student.dto.ts │
│     ├─ EmployeePicker (counselor / planner)       │    │                                                 │
│     ├─ StudentAttachmentUpload                    │    │ modules/employees/                            │
│     ├─ DetailNotesEditor (multi-section JSON)     │────┤   （已存在，Phase 2 新增 "通过 jobNo 查询" 支持）│
│     └─ ServiceFieldBlock (text/links/files)       │    │                                                 │
│   StudentDeleteConfirm.tsx                         │    │ modules/audit-logs/                           │
│   StudentImportDrawer.tsx                          │    │   audit-logs.service.ts（扩：*.update 字段级）  │
│                                                   │    │                                                 │
│ components/EmployeePicker.tsx (共享组件)           │    │ common/dictionaries.ts (扩: SERVICE_STATUS / │
│ services/students.ts                              │    │   SERVICE_PLATFORM / STUDENT_SOURCE /          │
│ services/employees.ts (扩：findByJobNo)            │    │   STORAGE_FOLDERS)                              │
│ services/storage.ts (已存在)                       │    │                                                 │
│ hooks/useStudents.ts                               │    │ prisma/schema.prisma:                           │
│ hooks/useStudentMutations.ts                       │    │   + enum ServiceStatus                          │
│ constants/dictionaries.ts (镜像后端扩展)          │    │   ~ Student.serviceStatus → enum               │
│                                                   │    │   + Student.transcriptKeys / overallPlanText / │
│ router.tsx: /students → StudentListPage            │    │     policyText / attachmentKeys                 │
└───────────────────────────────────────────────────┘    └──────────────────────────────────────────────┘
```

**典型时序**：

```
列表 + 高级搜索:
  web  用户打开 /students?studentNo=26&grade=大三
  web  useStudents({ studentNo, grade, ... }) → api.get('/students?...')
  api  StudentsController.list → service.list
       1. Prisma.$queryRaw：ORDER BY serviceStatusPriority ASC, gradePriority DESC, namePinyin ASC
       2. 每行附带 grade 字段（后端 CASE 计算）
       3. 分页
  web  渲染表格、ActiveFilterTags；点 "高级搜索" → AdvancedSearchDrawer
  web  Drawer "确定" → setSearchParams → useStudents 触发新一次请求

新增学生:
  web  "添加学生" → StudentFormModal (mode='create')
  web  counselorJobNo 字段用 <EmployeePicker> 远程搜索
  web  submit → api.post('/students', dto)
  api  service.create:
       1. DTO 校验 + dictionaries 白名单
       2. idSequenceService.allocate('student', dto.enrollmentYear)
       3. prisma.student.create + auditLogs.record({ action: 'student.create', target, after })

编辑学生:
  web  勾选 1 行 → "编辑"
  web  enrollmentYear 字段 disabled，副标"入学年份创建后不可修改"
  api  service.update：jobNo / id / studentNo / enrollmentYear 永远忽略输入；其它字段走 field-level 审计

删除学生:
  api  service.remove:
       1. prisma.enrollment.count({ where: { studentId } }) > 0 → 409
       2. 否则 prisma.student.delete + auditLogs.record({ action: 'student.delete', before })

Excel 导入（同 Phase 1A 骨架）:
  dry-run: 解析 + 校验，不入库；返回 { totalRows, validRows, errors }
  commit:  再校验 → 按 enrollmentYear 分组 allocateBatch → $transaction.createMany + 每行 student.create 审计
```

---

## 3. Prisma schema 变更

`apps/api/prisma/schema.prisma`：

```prisma
enum ServiceStatus {
  NOT_STARTED   // 未开始
  IN_SERVICE    // 正常服务中
  PAUSED        // 服务暂缓
  TERMINATED    // 取消或终止
  COMPLETED     // 服务完成
}

model Student {
  id                       String       @id @default(cuid())
  studentNo                String       @unique
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
  serviceStatus            ServiceStatus @default(NOT_STARTED)   // ← 改：String → enum
  totalPublicCredits       Decimal?     @db.Decimal(8, 2)
  totalPrivateCredits      Decimal?     @db.Decimal(8, 2)
  remainingPublicCredits   Decimal?     @db.Decimal(8, 2)
  remainingPrivateCredits  Decimal?     @db.Decimal(8, 2)
  serviceChecklistUrl      String?
  serviceChecklistKeys     String[]
  overallPlanUrl           String?
  overallPlanText          String?                                // ← 新增：总规划文本
  policyKeys               String[]
  policyText               String?                                // ← 新增：加分政策文本
  detailNotes              Json?
  scheduleKeys             String[]
  transcriptKeys           String[]                               // ← 新增：成绩单附件
  attachmentKeys           String[]                               // ← 新增：通用附件 / 图片
  note                     String?
  enrollments              Enrollment[]
  createdAt                DateTime     @default(now())
  updatedAt                DateTime     @updatedAt

  @@index([name])
  @@index([enrollmentYear])
}
```

**变更说明**：

- 当前 Student 表无数据（`prisma db push` 做空库初始化），enum 升级无 backfill 压力。
- 新增的 4 个字段都是 `String?` / `String[]`，对空库 push 友好。
- 保留现有 `detailNotes: Json?` 作为"各类服务项详情"通用容器（多段结构化内容，前端 `DetailNotesEditor` 渲染为多 section）。
- 不引入学号 unique 分段索引；`@unique` 直接加在 `studentNo` 上。
- 加 `@@index([enrollmentYear])` — 年级计算、排序、按年份过滤均依赖 `enrollmentYear`，索引覆盖列表接口的主要扫描路径。
- `counselorJobNo` / `plannerJobNo` 保持 `String?`（不建 FK）；与 Phase 1A `Course.actualTeacherJobNo` 的做法一致，避免老师删除时的外键阻断——关联保护由应用层在删员工时显式 `count()` 完成，已在 Phase 1A `EmployeesService.remove` 里检查 `Student.counselorJobNo` / `plannerJobNo`。

**迁移方式**：沿用 `pnpm prisma:generate && pnpm prisma:push`。

---

## 4. 后端详设（apps/api）

### 4.1 `common/dictionaries.ts` 扩展

现有文件追加（不动 Phase 1A 已有常量）：

```ts
// 学生服务状态 — 对应 Prisma enum ServiceStatus
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

/** spec §4.3 第一优先级：未开始 > 正常服务中 > 服务暂缓 > 取消或终止 > 服务完成 */
export const SERVICE_STATUS_SORT: Record<ServiceStatus, number> = {
  NOT_STARTED: 0,
  IN_SERVICE:  1,
  PAUSED:      2,
  TERMINATED:  3,
  COMPLETED:   4,
};

// 服务群所在平台（学生侧；与员工 EMPLOYEE_SERVING_FOR 不同，是"在哪个社群服务")
export const SERVICE_PLATFORM = [
  "研录保研",
  "研录考研",
  "高途",
  "其他",
] as const;
export type ServicePlatform = (typeof SERVICE_PLATFORM)[number];

// 学生来源
export const STUDENT_SOURCE = [
  "自有流量",
  "研录考研",
  "高途",
  "转介绍",
  "其他",
] as const;
export type StudentSource = (typeof STUDENT_SOURCE)[number];

// 年级显示值（纯前端字典；后端根据入学/毕业年和当前日期计算）
export const GRADE_VALUES = [
  "大一",
  "大二",
  "大三",
  "大四",
  "大五",
  "已毕业",
] as const;
export type GradeValue = (typeof GRADE_VALUES)[number];

/** spec §4.3 第二优先级：大五 > 大四 > 大三 > 大二 > 大一（已毕业在最前还是最后？
 * spec 未明确；已毕业视作"服务完成的一种常态"，与服务状态 COMPLETED 配合由
 * 第一优先级兜底，因此 GRADE_SORT 仅针对在校 5 级做降序，"已毕业" 放最低。 */
export const GRADE_SORT: Record<GradeValue, number> = {
  大五: 0,
  大四: 1,
  大三: 2,
  大二: 3,
  大一: 4,
  已毕业: 5,
};

// Phase 2 新增的 storage folder 白名单
export const STORAGE_FOLDERS = [
  "employees/attachments",
  "employees/import-batches",
  "students/attachments",          // ← Phase 2 新增
  "students/import-batches",       // ← Phase 2 新增
] as const;
```

（`STORAGE_FOLDERS` 已在 Phase 1A 存在，Phase 2 只在原数组末尾追加两项。）

### 4.2 `modules/students/`

#### 4.2.1 文件结构

```
modules/students/
  students.module.ts
  students.controller.ts
  students.service.ts
  students-import.service.ts
  students.types.ts
  dto/
    create-student.dto.ts
    update-student.dto.ts
    query-students.dto.ts
    import.dto.ts
  utils/
    grade.ts                 // 年级计算 + 排序 SQL 辅助
```

#### 4.2.2 `students.types.ts`

```ts
import type { Student } from "@prisma/client";

export type StudentListItem = Pick<
  Student,
  | "id" | "studentNo" | "name" | "gender"
  | "school" | "major"
  | "enrollmentYear" | "graduationYear"
  | "remainingPublicCredits" | "remainingPrivateCredits"
  | "serviceStatus" | "servicePlatform"
  | "counselorJobNo" | "plannerJobNo"
> & {
  grade: string | null;   // 后端计算
};

export type StudentListResponse = {
  items: StudentListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type StudentDetail = Student & {
  grade: string | null;
  relatedCourseCategories: string[];   // Phase 2 占位，恒返 []
};
```

#### 4.2.3 `utils/grade.ts` — 年级计算规则

```ts
/**
 * Spec §6：年级由 enrollmentYear / graduationYear / 当前年月 自动计算。
 * 学年切换点：9 月 1 日。
 */
export function calculateGrade(
  enrollmentYear: number,
  graduationYear: number,
  now: Date = new Date(),
): string | null {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;  // 1..12
  const academicYear = currentMonth >= 9 ? currentYear - enrollmentYear + 1 : currentYear - enrollmentYear;

  if (academicYear < 1) return null;              // 未开始（尚未入学）
  if (currentYear > graduationYear) return "已毕业";
  if (currentYear === graduationYear && currentMonth >= 7) return "已毕业";
  if (academicYear >= 5) return "大五";
  if (academicYear === 4) return "大四";
  if (academicYear === 3) return "大三";
  if (academicYear === 2) return "大二";
  return "大一";
}

/**
 * 年级文本 CASE（用于 $queryRaw 的 SELECT）
 * 返回字符串："大一"|"大二"|...|"已毕业"|NULL
 * 逻辑与 calculateGrade 一一对应；使用 PostgreSQL DATE 函数在查询时刻计算。
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
 * 年级排序权重（用于 Prisma $queryRaw 排序）
 * spec §4.3：大五 > 大四 > 大三 > 大二 > 大一（降序）
 * 返回 SQL CASE 表达式片段，调用方拼进 ORDER BY。
 */
export const GRADE_SORT_SQL = `
  CASE
    WHEN "graduationYear" < EXTRACT(YEAR FROM CURRENT_DATE)::int THEN 5
    WHEN "graduationYear" = EXTRACT(YEAR FROM CURRENT_DATE)::int AND EXTRACT(MONTH FROM CURRENT_DATE) >= 7 THEN 5
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) >= 5 THEN 0
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 4 THEN 1
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 3 THEN 2
    WHEN (CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 9 THEN EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" + 1 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::int - "enrollmentYear" END) = 2 THEN 3
    ELSE 4
  END
`;
```

#### 4.2.4 `students.service.ts` 方法

- **`list(query)`** — 支持 `keyword` / `page` / `pageSize` / `studentNo` / `name` / `grade` / `major` / `source` / `servicePlatform`。
  - 用 `$queryRaw` 按 spec §4.3 三级排序：`serviceStatusPriority ASC, gradePriority ASC, name COLLATE "zh-x-icu" ASC`（ICU 不可用时 fallback `name ASC`，同 Phase 1A）。
  - `serviceStatusPriority` = `CASE serviceStatus WHEN 'NOT_STARTED' THEN 0 WHEN 'IN_SERVICE' THEN 1 ... END`，直接把 `SERVICE_STATUS_SORT` 字典拼进去。
  - `gradePriority` 用 `GRADE_SORT_SQL`（已在 `utils/grade.ts` 定义）。
  - 用 CTE 避免 `GRADE_SORT_SQL` 重复：查询结构为 `WITH s AS (SELECT *, <GRADE_CASE> AS grade_text, <GRADE_SORT_SQL> AS grade_rank FROM "Student") SELECT ... FROM s WHERE ... ORDER BY ...`。
  - `grade` 过滤（spec §7）：若 `query.grade` 存在，CTE 里比对 `WHERE s.grade_text = $grade`；其它过滤字段走标准 `ILIKE` / 等值。
  - 响应：`{ items, total, page, pageSize }`，`items[*].grade` 直接用 CTE 产出的 `grade_text`。
- **`findOne(id)`** — 返 `Student & { grade, relatedCourseCategories: [] }`。`counselorJobNo` / `plannerJobNo` 不做后端 JOIN（前端 `EmployeePicker` 自己回填显示文本）。
- **`create(dto, operatorId)`**
  1. `class-validator` + dictionaries 白名单
  2. `IdSequenceService.allocate('student', dto.enrollmentYear)` → seq
  3. `studentNo = formatStudentNo(dto.enrollmentYear, seq)`
  4. `prisma.student.create({ data: { ...dto, studentNo } })`
  5. `AuditLogsService.record({ action: 'student.create', targetType: 'student', targetId: created.id, before: null, after: created })`
- **`update(id, dto, operatorId)`**
  1. 取 before 快照
  2. 剥离 `jobNo` / `id` / `studentNo` / `enrollmentYear` / `createdAt` 等不可变字段
  3. `prisma.student.update`
  4. `AuditLogsService.record({ action: 'student.update', before, after })` → 字段级
- **`remove(id, operatorId)`**
  1. 取 before 快照（否则删后查不到 jobNo 等用于审计的字段）
  2. `const enrolled = await prisma.enrollment.count({ where: { studentId: id } })` → `>0` 抛 409 `ConflictException("该学生已有选课记录，不可删除。请将服务状态改为服务完成或取消/终止后保留档案。")`
  3. `prisma.student.delete`
  4. `AuditLogsService.record({ action: 'student.delete', before, after: null })`
- **`formatStudentNo(year: number, seq: number): string`**
  - `const yy = String(year % 100).padStart(2, '0')`
  - `const nnnn = String(seq).padStart(4, '0')`
  - 返回 `yy + nnnn`
- **边界**：`IdSequence(kind='student')` 和员工的 `kind='employee'` 共用同一张表，互不干扰；`IdSequenceService` 无需改动。

#### 4.2.5 `students-import.service.ts`

基本骨架对标 `employees-import.service.ts`，列定义改为：

| 列名 | 校验 |
| --- | --- |
| 姓名 | 必填，字符串 |
| 性别 | `@IsIn(GENDER)` |
| 入学年份 | 必填，4 位数字，`>=2000`，`<=当前年+1` |
| 毕业年份 | 必填，4 位数字，`>=enrollmentYear`，`<=enrollmentYear+10` |
| 学校 / 专业 | 可空 |
| 学管老师工号 | 可空；非空时校验"数据库里 employmentStatus ∈ {FULL_TIME, PART_TIME} 的 Employee.jobNo 存在" |
| 规划师工号 | 同上 |
| 服务平台 | `@IsIn(SERVICE_PLATFORM)` 必填 |
| 学生来源 | `@IsIn(STUDENT_SOURCE)` 必填 |
| 服务状态 | 必填；模板填写中文显示值（如"正常服务中"），`validateRow` 用 `Object.entries(SERVICE_STATUS_LABELS)` 反向映射到 `ServiceStatus` enum；未匹配 → error |
| 电话 / 邮箱 | 可空 |
| 公共课总课时 / 1v1 总课时 | 可空，非负 Decimal(8,2) |
| 公共课剩余 / 1v1 剩余 | 可空，非负；若同行 `total` 字段也有值，则 `remaining <= total`（跨字段校验）；`total` 为空时 `remaining` 可独立填写 |
| 备注 | 可空 |

**`dryRun`**：从 MinIO 取 `fileKey` → 解析 → 逐行校验 → 返 `{ totalRows, validRows, errors: [{ row, field, message }] }`，无副作用。

**`commit`**：

1. 再次解析 + 校验（防 TOCTOU）；任一 error → 整批拒绝
2. 按 `enrollmentYear` 分组，`IdSequenceService.allocateBatch('student', year, count)`
3. `prisma.$transaction(async tx => { await tx.student.createMany({ data: rows }); ... })`
4. 对每行独立调用 `AuditLogsService.record({ action: 'student.create', after: row, meta: { importBatchKey: fileKey } })`（事务外，延续 Phase 1A 权衡）
5. 返回 `{ created, errors: [] }`

#### 4.2.6 `dto/`

- `CreateStudentDto`：全部字段 with `@IsIn` / `@IsInt` / `@IsArray` 等；`enrollmentYear` / `graduationYear` 强制 `@IsInt` + 范围；枚举字段 `@IsIn(SERVICE_STATUS)`；`servicePlatform`、`source` 同；`attachmentKeys` / `transcriptKeys` / `scheduleKeys` / `policyKeys` / `serviceChecklistKeys` 均 `@IsArray` + `@IsString({ each: true })`。
- `UpdateStudentDto`：所有字段 `@IsOptional`，**不含** `enrollmentYear`（从 DTO 里删除；即使传入也被 controller 忽略）。
- `QueryStudentsDto`：`keyword?`, `studentNo?`, `name?`, `grade?`, `major?`, `source?`, `servicePlatform?`, `page?`, `pageSize?`。
- `ImportFileKeyDto`：`{ fileKey: string }`（与 Phase 1A 同名 DTO，放学生模块里独立一份，不跨模块 import）。

#### 4.2.7 `students.controller.ts`

| 方法 | 路径 | 守卫 | 说明 |
| --- | --- | --- | --- |
| GET | `/students` | 登录 | 列表，支持 QueryStudentsDto |
| GET | `/students/:id` | 登录 | 详情；含 `grade`、`relatedCourseCategories: []` |
| POST | `/students` | `@Roles(SUPER_ADMIN, ADMIN)` | 新建；自动分学号 |
| PUT | `/students/:id` | `@Roles(SUPER_ADMIN, ADMIN)` | 整体更新；`enrollmentYear` / `studentNo` 忽略输入 |
| DELETE | `/students/:id` | `@Roles(SUPER_ADMIN, ADMIN)` | 硬删 + 关联保护 |
| GET | `/students/import/template` | `@Roles(...)` | 返 xlsx 二进制 |
| POST | `/students/import/dry-run` | `@Roles(...)` | body `{ fileKey }` |
| POST | `/students/import/commit` | `@Roles(...)` | body `{ fileKey }` |

#### 4.2.8 `students.module.ts`

```ts
@Module({
  imports: [AuditLogsModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentsImportService],
})
export class StudentsModule {}
```

（`IdSequenceModule` / `StorageModule` 都是 `@Global()`，无需 `imports`。）

### 4.3 `modules/employees/` 微改

新增一个 **"按 jobNo 查员工"** 的端点或复用现有 `findOne`：

- 若现有 `GET /employees/:id` 只支持 cuid，新增 `GET /employees/by-job-no/:jobNo` 返回 `EmployeeListItem`，给前端 `EmployeePicker` 在**编辑学生时回填已选老师姓名**用。
- 查询接口 `GET /employees` 接收新 query 参数 `jobNo`（精确匹配，多值逗号分隔），在 `EmployeePicker` 打开详情时批量拉已选 jobNo 对应的姓名。

实现上只动 `employees.service.ts::list` 的 `where` 构造（加 `jobNo: { in: [...] }` 分支）+ `query-employees.dto.ts` 加 `jobNo?: string` 字段；controller 零改动。

### 4.4 `modules/audit-logs/` 扩展

`audit-logs.service.ts` 当前：

```ts
if (action !== "update" || !before || !after) { ... behaviour-level ... }
```

为了让 `student.update` 也走字段级路径，改为：

```ts
const isUpdateAction = action === "update" || action.endsWith(".update");
if (!isUpdateAction || !before || !after) { ... behaviour-level ... }
```

纯扩展，对已有调用（`employee.update` 仍传 `action: "update"`）零影响。

### 4.5 `app.module.ts` 增量

```ts
imports: [
  ...,                // Phase 1A / 1B 已有
  StudentsModule,     // ← Phase 2 新增
],
```

---

## 5. 前端详设（apps/web）

### 5.1 依赖

无新增第三方包：AntD `Table`、`Modal`、`Drawer`、`Upload`、`DatePicker`、`Select`、`InputNumber`、`Tag`、`Image` 已可覆盖。URL query 通过 react-router 的 `useSearchParams` 原生解决。

### 5.2 `constants/dictionaries.ts` 扩展

镜像后端扩展（独立文件，不跨 packages）：`SERVICE_STATUS`、`SERVICE_STATUS_LABELS`、`SERVICE_PLATFORM_OPTIONS`、`STUDENT_SOURCE_OPTIONS`、`GRADE_VALUES`。

### 5.3 `services/students.ts`

```ts
export const studentsApi = {
  list: (params: StudentQueryParams) => api.get<StudentListResponse>('/students', { params }),
  detail: (id: string) => api.get<StudentDetail>(`/students/${id}`),
  create: (body: CreateStudentBody) => api.post<StudentDetail>('/students', body),
  update: (id: string, body: UpdateStudentBody) => api.put<StudentDetail>(`/students/${id}`, body),
  remove: (id: string) => api.delete<void>(`/students/${id}`),
  importDryRun: (fileKey: string) => api.post<ImportReport>('/students/import/dry-run', { fileKey }),
  importCommit: (fileKey: string) => api.post<ImportReport>('/students/import/commit', { fileKey }),
  downloadTemplate: () => downloadAuthed('/students/import/template', '学生导入模板.xlsx'),
};
```

### 5.4 `services/employees.ts` 扩展

```ts
findByJobNo: (jobNo: string) => api.get<EmployeeListItem>(`/employees?jobNo=${encodeURIComponent(jobNo)}`).then(r => r.items[0] ?? null),
listByJobNos: (jobNos: string[]) => api.get<EmployeeListItem[]>(`/employees?jobNo=${jobNos.join(',')}&pageSize=${jobNos.length}`).then(r => r.items),
```

（供 `<EmployeePicker>` 在编辑学生时按 jobNo 回填姓名用。）

### 5.5 `components/EmployeePicker.tsx`（新增共享组件）

**签名**：

```tsx
interface EmployeePickerProps {
  value?: string | null;                    // jobNo
  onChange?: (jobNo: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  excludeResigned?: boolean;                // 默认 true — 默认过滤 RESIGNED
  allowClear?: boolean;                     // 默认 true
  style?: React.CSSProperties;
}
```

**行为**：

- AntD `Select`：`showSearch` / `filterOption={false}` / `onSearch` 300ms 防抖触发 `employeesApi.list({ keyword, pageSize: 20, ...(excludeResigned && { employmentStatus: 'FULL_TIME,PART_TIME' }) })`
  - 后端 `employees.service.ts::list` 的 `employmentStatus` 当前只接受单值；本 Phase 需扩展：逗号分隔多值 → Prisma `{ in: [...] }`。同时 `QueryEmployeesDto.employmentStatus` 放宽为 `@IsString()` + 自定义 transform：split(",") 后逐个 `@IsIn(EMPLOYMENT_STATUS)` 校验。
  - `excludeResigned=false` 场景仅用于"编辑学生时回填已离职老师"——此时走 `listByJobNos` 精确匹配，不触发 onSearch 条件过滤。
- 已选值回填：初次挂载若 `value` 非空 → `employeesApi.findByJobNo(value)` 拉一次塞进 options；回填期间 `loading={true}`；回填完成后 `loading={false}`。拉不到（老师被硬删）→ Select 展示 `value` 原值 + "(未找到)" 后缀，不阻断表单保存。
- 选项渲染：`{jobNo} - {name}`，若 `employmentStatus === 'RESIGNED'` 追加 `(已离职)` 后缀。
- `value=null` → 显示 placeholder（默认 "选择员工"）。

### 5.6 `features/students/`

#### 5.6.1 `StudentListPage.tsx`

布局按 spec §4：

- 标题 `学生信息管理`
- 工具按钮组左到右：查看、编辑、添加学生、删除学生、从 Excel 导入
- 中右区域：普通搜索框
- 最右：`高级搜索` 按钮（点开 Drawer）
- `ActiveFilterTags`：若 URL 带高级搜索参数，列表上方显示横排 `<Tag closable>学号:26001</Tag> <Tag closable>年级:大三</Tag>` 等，点 × 删单条（`setSearchParams({..., 学号: undefined})`）
- AntD `<Table rowSelection={{ type: 'checkbox' }}>`，首列复选框
- 列（对应 spec §4.1）：学号、学生姓名、性别、学校、专业、当前年级、公共课剩余、1v1 剩余、服务状态（Tag 带颜色）
- `pageSize: 50`
- 状态联动：与 Phase 1A 同款 `selectedCount` → `canView / canEdit / canDelete`
- 空态：`<Empty description="当前筛选条件下没有学生记录">`

#### 5.6.2 `StudentFormModal.tsx`

按 spec §5：

- `mode: 'create' | 'view' | 'edit'`；`<Modal width={1040} bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}>`
- 双列布局（AntD `<Row><Col span={12}>`），按以下分组：
  - **基础档案**：学号(readonly)、姓名、性别、电话、邮箱、入学年份(create 可填 / edit readonly)、毕业年份、学校、专业
  - **服务归属**：学管老师(EmployeePicker)、规划师(EmployeePicker)、服务状态、服务平台、学生来源
  - **课时**：公共课总课时、公共课剩余、1v1 总课时、1v1 剩余
  - **服务字段**（单列 full width）：服务清单 URL、服务清单附件(Upload)、总规划 URL、总规划文本(TextArea)、加分政策附件、加分政策文本、本学期课表附件、成绩单附件、通用附件、各类服务项详情(DetailNotesEditor)、备注
  - **只读占位**：已上课程的二级课程类别 → `<div className="related-course-categories-placeholder">待课程模块上线后自动同步</div>`
- 当前年级字段：`view` / `edit` 态都 readonly，文案直接从 API 返回的 `detail.grade` 拿；`create` 态显示"保存后自动计算"
- 底部按钮：
  - `view`：`[取消, 编辑]`（编辑按钮需 `RequireRole`）
  - `create` / `edit`：`[取消, 确定]`
- 提交：`createMutation` / `updateMutation`，`invalidateQueries(['students'])`

#### 5.6.3 `StudentAttachmentUpload.tsx` / `DetailNotesEditor.tsx`

- `StudentAttachmentUpload` 是 Phase 1A `EmployeeAttachmentUpload` 的泛化版本：可指定 `folder`（`students/attachments`）和 `accept`（`image/*,.pdf,.doc,.docx,...`），返回受控的 `keys: string[]`。多个字段（`serviceChecklistKeys` / `policyKeys` / `scheduleKeys` / `transcriptKeys` / `attachmentKeys`）都复用同一个组件，`folder` 参数固定 `students/attachments`。
- `DetailNotesEditor`：编辑 `detailNotes: Json`；MVP 简化为"多段式文本区"——数组 `[{ title: string, content: string }]`，`+ 添加段` / 每段 `× 删除` + `title input` + `content TextArea`。spec §8 的"链接 / 文件 / 图片"在每段内作为 markdown/富文本字符串直接写，不做富文本渲染器（延后）。

#### 5.6.4 `StudentDeleteConfirm.tsx`

`Modal.confirm`：

- title: "确认删除该学生？"
- content：spec §6 护栏文案 "删除操作不可恢复。若学生服务结束，建议改为 '服务完成' 或 '取消或终止' 状态保留档案。学号删除后不回收。"
- okText: "确认删除"，`okButtonProps: { danger: true }`
- 409 分支：`message.error(err.message)`（后端返"该学生已有选课记录，不可删除..."）

#### 5.6.5 `StudentImportDrawer.tsx`

三步式 Drawer：

1. 下载模板：`studentsApi.downloadTemplate()`
2. 上传文件：`uploadToStorage('students/import-batches', file)` → `fileKey` → `importDryRun(fileKey)`
3. 预校验报告：`<Table>` 显示 errors；`<Statistic>` 显示 total/valid/error rows
4. 确认导入：无错误时启用 → `importCommit(fileKey)` → `message.success('成功导入 N 名学生')` + `invalidateQueries(['students'])`

#### 5.6.6 `AdvancedSearchDrawer.tsx`

- `<Drawer width={420}>`
- 内部 `<Form layout="vertical">`：学号、姓名、年级(`<Select>`)、专业、学生来源(`<Select>`)、服务群所在平台(`<Select>`)
- "确定" → `setSearchParams({ studentNo, name, grade, major, source, servicePlatform })`（忽略空值）
- "重置" → `setSearchParams({})`
- 取消 → 不写 URL，关 Drawer

#### 5.6.7 `hooks/useStudents.ts` / `hooks/useStudentMutations.ts`

骨架完全复用 Phase 1A `useEmployees` / `useEmployeeMutations`，仅 URL / mutationFn 替换为学生接口；409 分支在 `removeMutation` 的 `onError` 中捕获并展示 `err.message`。

### 5.7 `router.tsx` 替换 `/students` 占位

```tsx
{
  path: 'students',
  element: (
    <RequireAuth>
      <StudentListPage />
    </RequireAuth>
  ),
},
```

页面内对 ADMIN+ 按钮用 `<RequireRole roles={['SUPER_ADMIN', 'ADMIN']} fallback={null}>` 包裹添加/编辑/删除/导入；查看按钮所有登录用户可用。

### 5.8 样式

- `styles.css` 追加 `.related-course-categories-placeholder`、`.active-filter-tag-row`、`.student-detail-section-title` 等轻量 className；大部分组件样式沿用 AntD 默认 + Phase 1A 已有 tokens。

---

## 6. 后端接口契约

| 方法 | 路径 | 守卫 | 请求 | 响应 |
| --- | --- | --- | --- | --- |
| GET | `/api/students` | 登录 | `keyword?, studentNo?, name?, grade?, major?, source?, servicePlatform?, page?, pageSize?` | `{ items: StudentListItem[], total, page, pageSize }` |
| GET | `/api/students/:id` | 登录 | — | `Student & { grade, relatedCourseCategories: [] }` |
| POST | `/api/students` | `@Roles(SUPER_ADMIN, ADMIN)` | `CreateStudentDto` | `Student` |
| PUT | `/api/students/:id` | `@Roles(SUPER_ADMIN, ADMIN)` | `UpdateStudentDto` | `Student` |
| DELETE | `/api/students/:id` | `@Roles(SUPER_ADMIN, ADMIN)` | — | `204` 或 `409` |
| GET | `/api/students/import/template` | `@Roles(...)` | — | xlsx 二进制 |
| POST | `/api/students/import/dry-run` | `@Roles(...)` | `{ fileKey }` | `ImportReport` |
| POST | `/api/students/import/commit` | `@Roles(...)` | `{ fileKey }` | `{ created, errors: [] }` |
| GET | `/api/employees` | 登录 | query 扩 `jobNo?` | 如既有，但 `jobNo` 可用精确匹配/逗号分隔 |

`StudentListItem` JSON：

```ts
{
  id: string
  studentNo: string
  name: string
  gender: '男' | '女'
  enrollmentYear: number
  graduationYear: number
  school: string | null
  major: string | null
  counselorJobNo: string | null
  plannerJobNo: string | null
  remainingPublicCredits: string | null     // Decimal serializes to string
  remainingPrivateCredits: string | null
  servicePlatform: string
  serviceStatus: 'NOT_STARTED' | 'IN_SERVICE' | 'PAUSED' | 'TERMINATED' | 'COMPLETED'
  grade: '大一' | '大二' | '大三' | '大四' | '大五' | '已毕业' | null
}
```

---

## 7. 错误处理与边界

| 场景 | 后端行为 | 前端表现 |
| --- | --- | --- |
| DTO 校验失败 | 400 ValidationError | Form 红字段位 + `message.error` 兜底 |
| `enrollmentYear` 合法性失败（范围/整数）| 400 | Form inline 报错 |
| 学号分配后 `create` 失败 | 事务回滚但 `IdSequence` 已 +1 → 号码空缺 | 用户重试（符合"删除不回收"相同语义） |
| 删除被 Enrollment 引用 | 409 ConflictException | `message.error` spec §6 护栏文案 |
| Excel 缺列 / 枚举值非法 | dry-run 返 errors | Drawer 顶部 Alert，禁用"确认导入" |
| 编辑时传 `enrollmentYear` | DTO 剔除（`UpdateStudentDto` 不含此字段）；即便 raw payload 带它也被 service 层忽略 | 前端 UI 禁用此输入；显示"创建后不可修改" |
| EmployeePicker 选中一个后来离职的老师 | 不自动切换；详情继续显示老工号 + `(已离职)` 后缀 | 视觉提示，不阻断 |
| 普通成员尝试写操作 | 403 ForbiddenException | 按钮前端已隐藏；兜底 `message.error('无操作权限')` |
| 学号超出 `YY9999`（单年 >9999 学生）| `IdSequenceService` 会继续 +1，格式化时 `NNNN` 变 5 位 | 学号变 7 位；业务未到此规模前不处理，spec 也未约束 ceiling |

---

## 8. 验收清单（spec §9 映射）

- [ ] `/students` 未登录 → Phase 0 守卫跳 `/login`
- [ ] `/students` 登录 → 见列表 + 工具按钮 + 搜索框 + 高级搜索按钮
- [ ] 列表默认排序三级：服务状态 > 年级降序 > 姓名升序
- [ ] 列表分页 50/页
- [ ] 勾选联动：0 → 全禁；1 → 全启；≥2 → 查看/编辑禁，删除启
- [ ] 新建学生：学号自动 `YYNNNN`；同年份学生连续递增；删除后 `IdSequence.lastSeq` 不变
- [ ] 学号格式：例 2026 入学第 3 位 → `260003`
- [ ] 入学年份 view/edit 态 disabled
- [ ] 年级自动计算正确：2023 入学 / 2027 毕业 / 当前 2026-04 → `大三`（2023→2024 大一，2024→2025 大二，2025→2026 大三，2026-04 在 9 月前仍是大三）
- [ ] 年级自动计算边界：2022 入学 / 2026 毕业 / 2026-07 → `已毕业`（7 月进入毕业月份）
- [ ] 学管老师 / 规划师选择器支持按姓名或工号搜索；选中后以 `{jobNo} - {name}` 显示
- [ ] 编辑学生时，已选老师若已离职，选择器仍回显 `(已离职)` 后缀
- [ ] 高级搜索：多条件组合 AND；URL 带参数刷新可恢复；tag 行支持单条删除
- [ ] Excel 导入完整流程：模板 → 填 3 行 → 上传 → dry-run → commit → 列表新增 3 条
- [ ] Excel 导入中 `counselorJobNo` 填写不存在的工号 → dry-run 报错
- [ ] 删除一个无 `Enrollment` 学生 → 成功
- [ ] 删除一个有 `Enrollment` 的学生 → 409，前端展示护栏文案
- [ ] 服务附件上传（成绩单 / 通用附件 / 课表等）→ MinIO 生成对象；详情点击文件名可下载
- [ ] AuditLog：每次 create / update / delete 写入；`student.update` 多字段编辑 → 字段级多条
- [ ] `MustChangePasswordGuard`（Phase 1B）对所有 `/students/*` 端点拦截生效（首次改密前打开 /students 被 403 + 跳改密页）

---

## 9. 范围边界（明确**不**做）

- 学号回收 / 软删除 / 批量删除 / 批量导出（Excel 导入只做写入；导出延后）
- 学生登录账号绑定（Phase 2 不与 `User` 关联，不涉及学生 self-service）
- 学生照片专用字段（通用 `attachmentKeys` 兜底）
- "加分政策" / "总规划" 的富文本编辑器（文本字段用 `<TextArea>` 明文存储）
- 子序匹配（subsequence match）搜索语义（同 Phase 1A 延后）
- `GRADE_VALUES` 中的"空值"状态在前端表现（返 `null` 时列表显示 `-`）
- "已上课程的二级课程类别" 真实数据（Phase 3 落地）
- 学生服务状态流转的限制（任意状态可互相切换，不建状态机）
- 高级搜索中"创建时间范围"/"最近更新时间" 等时间类条件（spec §7 未列）
- AuditLog 查询页（Phase 6 "关于 → 日志"）
- 学生移动端表单专门优化（沿用 Phase 0 响应式 Drawer；学生详情弹窗在小屏上按 AntD 默认铺满）

---

## 10. 变更文件一览

**新增（后端）**：

- `apps/api/src/modules/students/students.module.ts`
- `apps/api/src/modules/students/students.controller.ts`
- `apps/api/src/modules/students/students.service.ts`
- `apps/api/src/modules/students/students-import.service.ts`
- `apps/api/src/modules/students/students.types.ts`
- `apps/api/src/modules/students/utils/grade.ts`
- `apps/api/src/modules/students/dto/create-student.dto.ts`
- `apps/api/src/modules/students/dto/update-student.dto.ts`
- `apps/api/src/modules/students/dto/query-students.dto.ts`
- `apps/api/src/modules/students/dto/import.dto.ts`

**新增（前端）**：

- `apps/web/src/services/students.ts`
- `apps/web/src/components/EmployeePicker.tsx`
- `apps/web/src/features/students/StudentListPage.tsx`
- `apps/web/src/features/students/StudentFormModal.tsx`
- `apps/web/src/features/students/StudentDeleteConfirm.tsx`
- `apps/web/src/features/students/StudentImportDrawer.tsx`
- `apps/web/src/features/students/StudentAttachmentUpload.tsx`
- `apps/web/src/features/students/DetailNotesEditor.tsx`
- `apps/web/src/features/students/AdvancedSearchDrawer.tsx`
- `apps/web/src/features/students/ActiveFilterTags.tsx`
- `apps/web/src/features/students/hooks/useStudents.ts`
- `apps/web/src/features/students/hooks/useStudentMutations.ts`
- `apps/web/src/features/students/types.ts`

**修改（后端）**：

- `apps/api/prisma/schema.prisma`（`+ enum ServiceStatus`、`Student.serviceStatus → enum`、`+ transcriptKeys / overallPlanText / policyText / attachmentKeys`、`@@index(enrollmentYear)`）
- `apps/api/src/common/dictionaries.ts`（+ `SERVICE_STATUS*`、`SERVICE_PLATFORM`、`STUDENT_SOURCE`、`GRADE_VALUES`、`GRADE_SORT`、`STORAGE_FOLDERS` 扩两项）
- `apps/api/src/modules/audit-logs/audit-logs.service.ts`（`*.update` 也触发字段级）
- `apps/api/src/modules/employees/dto/query-employees.dto.ts`（`+ jobNo?`）
- `apps/api/src/modules/employees/employees.service.ts`（`list` 的 `where` 分支支持 `jobNo`）
- `apps/api/src/app.module.ts`（imports 增 `StudentsModule`）

**修改（前端）**：

- `apps/web/src/constants/dictionaries.ts`（镜像后端扩展）
- `apps/web/src/services/employees.ts`（`+ findByJobNo / listByJobNos`）
- `apps/web/src/router.tsx`（`/students` 占位 → `StudentListPage`）
- `apps/web/src/styles.css`（3-5 个新 className）

**不动**：

- `apps/api/src/modules/{course-outlines,courses,payroll,links}/`（仍占位）
- `apps/api/src/modules/auth/*`（Phase 0 / 1B 已完整）
- `apps/api/src/common/id-sequence/*`（Phase 1A 已完整，直接复用）
- `apps/api/src/modules/storage/*`（Phase 1A 已完整）
- 根级 `.env` / `docker-compose.yml`（Phase 2 无新基础设施）

---

## 11. 与 Phase 3+ 的接口预留

Phase 3（课程大纲）/ Phase 4（课程信息）落地后：

- `Student.relatedCourseCategories` 占位字段由 `StudentsService.findOne` 切换为按 `Enrollment → Course → CourseOutlineItem.secondaryCategoryName` 聚合的真实查询。
- 删除学生的关联保护已经检查 `Enrollment`，Phase 3 无需新增护栏。
- `EmployeePicker` 共享组件可直接用于课程模块的"实际授课老师" / "计划授课老师" 字段。
- `AuditLogsService.record({ action: 'student.update_credits', ... })` 等细粒度 action 将由 Phase 5 薪酬模块在"学生课时结算" 流程中产生，本阶段不预留。
