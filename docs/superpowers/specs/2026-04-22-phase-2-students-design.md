# Phase 2 — 学生管理 · 实现设计

> 对应需求:[docs/spec/03-Phase2-学生管理.md](../../spec/03-Phase2-学生管理.md)
> 上游:[Phase 1A · 员工模块](./2026-04-22-phase-1a-employees-design.md) / [Phase 1B · 用户与权限管理](./2026-04-22-phase-1b-users-design.md)
> 下游预留:Phase 3(课程大纲)/ Phase 4(课程详细信息与学生选课)

## 1. 范围与决策摘要

Phase 2 不再像 Phase 1 那样拆子阶段,单轮一次落地:学生 CRUD、Excel 导入、高级搜索 Drawer、员工选择器、服务档案富字段、年级自动计算、ServiceStatus enum、学号 `YYNNNN` 原子分配,共用一套设计与一份实施计划。

Phase 2 大量复用 Phase 1A 已落地的基础设施,不新造同类轮子:`IdSequenceService`、`StorageService`(MinIO presign 直传)、`AuditLogsService`、`RequireAuth`/`RequireRole`、`services/storage.ts`、`services/http.ts`、`constants/dictionaries.ts` 模式、`useEmployeeMutations` 风格的 TanStack Query 包装。

| # | 决策 | 选择 | 备注 |
| --- | --- | --- | --- |
| Q1 | Phase 2 切分 | 单轮,不拆分 | 学生模块逻辑紧耦合,无法像 1A/1B 那样按独立对象切 |
| Q2 | `serviceStatus` | 升 Prisma enum | 5 个值见 §3;列表排序第一优先级,数据层强约束有价值 |
| Q3 | `detailNotes` 形状 | 通用 `sections[]` JSON | 用户自命名段,每段支持文本+链接+多文件+多图 |
| Q4 | 成绩单 | 新增 `transcriptKeys String[]` 列 | spec §8 强要求但原 schema 缺列,补上 |
| Q5 | 年级计算 | 后端 Service 层即时派生 | 不落 `currentGrade` 列;SQL `CASE` 同步做排序 |
| Q6 | 高级搜索 UX | 右侧 Drawer(420px) | 面板驻留可见,不挤列表;移动端退化全屏 |
| Q7 | 员工选择器范围 | 只列在职;历史离职可展示,不可新选 | 配合 Phase 1 "离职优先改状态" 语义 |
| Q8 | 员工硬删对学生引用 | 沿用 Phase 1A 的 `ConflictException` | 已在 `employees.service.ts:214` 落地,不新增逻辑 |
| Q9 | 剩余课时 | Phase 2 纯手填存储 | Phase 4 课程选课落地后再加自动扣减 |
| Q10 | "已上课程的二级课程类别" | Phase 2 固定返回 `[]` | Phase 3/4 真实实现;前端渲染占位文案 |
| Q11 | 学号 `YYNNNN` 的 `YY` 来源 | `enrollmentYear` | 与员工按 `hireYear` 不同;学号本身就是"入学年份"语义 |
| Q12 | 高级搜索 HTTP 方法 | `POST /students/search` | 6 个条件以上放 query string 不优雅,body 更自然;幂等,非语义资源创建 |

---

## 2. 高层架构

```
┌── apps/web ─────────────────────────────────────┐    ┌── apps/api ─────────────────────────────────┐
│ features/students/                               │    │ modules/students/                             │
│   StudentListPage.tsx                             │    │   students.controller.ts                       │
│     └─ useStudents() / useAdvancedSearch()        │    │   students.service.ts                          │
│   StudentFormModal.tsx (view / edit / create)     │    │   students-import.service.ts                   │
│   StudentDeleteConfirm.tsx                        │    │   students.types.ts                            │
│   StudentImportDrawer.tsx                         │────┤   dto/{create,update,query,search,import}.dto │
│   StudentAdvancedSearchDrawer.tsx (new pattern)   │    │                                                 │
│   ServiceSectionEditor.tsx (sections[] 编辑器)     │    │ common/grade/                                 │
│     └─ TextField + LinkList + FileList + ImageList │    │   grade.ts (computeGrade + gradeSortWeight)   │
│   EmployeePicker.tsx (学管老师/规划师选择器)        │    │                                                 │
│   hooks/useStudents.ts / useStudentMutations.ts    │────┤ common/dictionaries.ts (+ SERVICE_STATUS,      │
│ services/students.ts                              │    │   STUDENT_SOURCE, SERVICE_PLATFORM, grade枚举) │
│ constants/dictionaries.ts (镜像新增枚举)           │    │                                                 │
│                                                   │    │ common/id-sequence/                            │
│ router.tsx: /students → StudentListPage           │    │   + formatStudentNo(year, seq)                 │
│   被 RequireAuth 包裹                              │    │                                                 │
└───────────────────────────────────────────────────┘    │ modules/storage/                               │
                                                          │   dictionaries.STORAGE_FOLDERS 白名单增 3 项    │
                                                          │                                                 │
                                                          │ prisma/schema.prisma:                           │
                                                          │   + enum ServiceStatus                          │
                                                          │   ~ Student.serviceStatus → enum                │
                                                          │   + Student.transcriptKeys String[]             │
                                                          │   + @@index([name])  @@index([serviceStatus])  │
                                                          └──────────────────────────────────────────────┘
                                                                              │
                                                          ┌─── infra ────────┴──────┐
                                                          │ Postgres (db)            │
                                                          │ MinIO                    │
                                                          │   folders: students/{attachments,images,import-batches} │
                                                          └──────────────────────────┘
```

**典型时序**:

```
列表查询(普通搜索):
  web  StudentListPage 挂载
  web  useStudents({ keyword, page }) → api.get('/students?...')
  api  StudentsController.list → StudentsService.list
       1. Prisma 过滤 (keyword ILIKE name/studentNo/phone/school)
       2. raw SQL ORDER BY: serviceStatus weight, grade weight, name ASC
       3. map → 计算 currentGrade 注入列表项
  web  渲染表格 + 工具按钮联动

高级搜索:
  web  点击"高级搜索" → StudentAdvancedSearchDrawer 滑出
  web  填 6 字段 → api.post('/students/search', { conditions, page })
  api  StudentsController.search → StudentsService.search
       1. 将 conditions 构造成 Prisma WhereInput
       2. 复用 buildSortedListQuery
  web  列表刷新 + 顶部显示"已应用筛选 (N 项) [清除]"标签

新增学生:
  web  点击"添加学生" → StudentFormModal(mode='create')
  web  (可选) EmployeePicker 选 counselor/planner
  web  (可选) ServiceSectionEditor 编辑 sections + 附件 → storage presign 直传
  web  表单提交 → api.post('/students', { ..., enrollmentYear, ... })
  api  StudentsController.create → service.create:
       1. validate DTO (class-validator + 字典白名单)
       2. idSequence.allocate('student', enrollmentYear)
       3. formatStudentNo → YYNNNN
       4. prisma.student.create + auditLogsService.record
  web  Modal 关闭 + invalidate ['students']

编辑学生:
  web  勾 1 行 → 编辑 → StudentFormModal(mode='edit')
  web  提交 → api.put('/students/:id', body)
  api  service.update:
       1. 取 before 快照
       2. 除 detailNotes / sections / array 列作整体替换外,其余字段级 diff
       3. AuditLog 多条(field-level)

删除学生:
  web  勾 1 行 → 删除 → StudentDeleteConfirm 强提醒
  web  确认 → api.delete('/students/:id')
  api  service.remove:
       1. 取快照 → prisma.student.delete (Enrollment cascade)
       2. AuditLog.before

Excel 导入:
  web  StudentImportDrawer(与 EmployeeImportDrawer 同构)
  web  下载模板 → /api/students/import/template
  web  上传 → uploadToStorage('students/import-batches', file) → fileKey
  web  api.post('/students/import/dry-run', { fileKey })
  api  importService.dryRun:
       1. 解析 xlsx → 字段校验(姓名/性别/入学年/...)
       2. 学管/规划工号:检查员工存在 + 未离职
       3. 返回 { totalRows, validRows, errors }
  web  用户确认 → api.post('/students/import/commit', { fileKey })
  api  importService.commit:
       1. 重新 parse + validate(防 TOCTOU)
       2. 按 enrollmentYear 聚合 → idSequence.allocateBatch('student', year, count)
       3. prisma.student.createMany + auditLog.createMany (事务)
       4. 返回 { created, errors: [] }
```

---

## 3. Prisma schema 增量

`apps/api/prisma/schema.prisma`:

```prisma
enum ServiceStatus {
  NOT_STARTED              // 未开始
  IN_SERVICE               // 正常服务中
  ON_HOLD                  // 服务暂缓
  CANCELLED_OR_TERMINATED  // 取消或终止
  COMPLETED                // 服务完成
}

model Student {
  id                      String        @id @default(cuid())
  studentNo               String        @unique
  name                    String
  gender                  String
  enrollmentYear          Int
  graduationYear          Int
  school                  String?
  major                   String?
  counselorJobNo          String?
  plannerJobNo            String?
  phone                   String?
  email                   String?
  servicePlatform         String
  source                  String
  serviceStatus           ServiceStatus @default(NOT_STARTED)  // ← 改:String → enum
  totalPublicCredits      Decimal?      @db.Decimal(8, 2)
  totalPrivateCredits     Decimal?      @db.Decimal(8, 2)
  remainingPublicCredits  Decimal?      @db.Decimal(8, 2)
  remainingPrivateCredits Decimal?      @db.Decimal(8, 2)
  serviceChecklistUrl     String?
  serviceChecklistKeys    String[]
  overallPlanUrl          String?
  policyKeys              String[]
  transcriptKeys          String[]                             // ← 新增:成绩单多文件
  detailNotes             Json?                                 // 约定形状见 §4.1
  scheduleKeys            String[]
  note                    String?
  enrollments             Enrollment[]
  createdAt               DateTime      @default(now())
  updatedAt               DateTime      @updatedAt

  @@index([name])                                               // ← 新增:排序第三优先级
  @@index([serviceStatus])                                      // ← 新增:排序第一优先级
}
```

**变更说明**:

- `serviceStatus` 由 `String` 升 enum;当前项目学生数据 0 行,`pnpm prisma:push --accept-data-loss` 可处理。
- `transcriptKeys` 是纯新增列,向下兼容,老记录(无,因为 0 行)默认空数组。
- 索引:`@@index([serviceStatus])` 配合排序第一优先级查询效率;`@@index([name])` 与员工表同策略,支持姓名升序。年级排序靠运行期 `CASE WHEN` 派生,不建索引(enrollmentYear/graduationYear 原字段本身就已可被索引覆盖,但列表场景命中率低,先不建)。
- **迁移路径**:沿用 `prisma db push`,开发者在拉代码后跑 `pnpm prisma:generate && pnpm prisma:push`。无新增 env。

---

## 4. 领域约定

### 4.1 `detailNotes` JSON 形状

**完整形状**:
```ts
type ServiceSection = {
  id: string           // cuid,前端生成;删除一段时直接 filter 这条
  title: string        // 用户自命名,如 "英语一对一进度"
  body: string         // 纯文本(后续可升 markdown,但 Phase 2 不做渲染)
  links: string[]      // 外链 URL,允许空
  fileKeys: string[]   // MinIO key (folder: students/attachments)
  imageKeys: string[]  // MinIO key (folder: students/images)
}

type DetailNotes = {
  sections: ServiceSection[]
}
```

**约束**:
- 后端用 class-validator 自定义验证器 `IsDetailNotes()` 校验结构;遇到未知顶层 key 或 section 缺字段直接 400。
- `sections` 数组最大 50 段;每段 `body` 最大 5000 字符;`links/fileKeys/imageKeys` 各最多 50 项。越界用意是防止滥用 Json 列。
- 空学生的默认值是 `null`(不强制 `{ sections: [] }`),避免无价值 diff 噪声。
- **diff 策略**:`update()` 把整个 `detailNotes` 视作不可拆字段,写 1 条 `fieldName='detailNotes'` 的 AuditLog,`before/after` 存完整 JSON 字符串。不做 section-level diff(复杂度收益不匹配)。

### 4.2 年级计算 `common/grade/grade.ts`

```ts
export type GradeLabel = '大一' | '大二' | '大三' | '大四' | '大五' | '已毕业' | null

export function computeGrade(
  enrollmentYear: number | null,
  graduationYear: number | null,
  now: Date = new Date(),
): GradeLabel {
  if (enrollmentYear == null || graduationYear == null) return null
  const y = now.getFullYear()
  if (y > graduationYear) return '已毕业'
  const offset = y - enrollmentYear
  if (offset <= 0) return '大一'
  if (offset === 1) return '大二'
  if (offset === 2) return '大三'
  if (offset === 3) return '大四'
  return '大五'  // offset >= 4
}

/** 排序权重,越小越靠前;与 SQL CASE 严格对齐 */
export function gradeSortWeight(label: GradeLabel): number {
  switch (label) {
    case '大五': return 0
    case '大四': return 1
    case '大三': return 2
    case '大二': return 3
    case '大一': return 4
    case '已毕业': return 5
    case null: return 6
  }
}
```

**前端镜像**:`apps/web/src/utils/grade.ts` 导出同签名函数;仅用于展示和高级搜索 Drawer 下拉,**不用于排序**(排序 100% 靠后端)。两端改动需同步,由 code review 守住。

**SQL 端对齐**:见 §5.3 `buildSortedListQuery` 里的 `CASE`,语义与 `computeGrade` 严格等价。`gradeSortWeight` 的返回值直接写进 SQL CASE 的 THEN 数字里(hardcode)。

### 4.3 字典新增(`common/dictionaries.ts`)

```ts
// ---- 服务状态 ----
export const SERVICE_STATUS = [
  'NOT_STARTED', 'IN_SERVICE', 'ON_HOLD', 'CANCELLED_OR_TERMINATED', 'COMPLETED',
] as const
export type ServiceStatusLiteral = (typeof SERVICE_STATUS)[number]
export const SERVICE_STATUS_LABELS: Record<ServiceStatusLiteral, string> = {
  NOT_STARTED: '未开始',
  IN_SERVICE: '正常服务中',
  ON_HOLD: '服务暂缓',
  CANCELLED_OR_TERMINATED: '取消或终止',
  COMPLETED: '服务完成',
}
/** spec §4.3 第一优先级权重 */
export const SERVICE_STATUS_SORT: Record<ServiceStatusLiteral, number> = {
  NOT_STARTED: 0,
  IN_SERVICE: 1,
  ON_HOLD: 2,
  CANCELLED_OR_TERMINATED: 3,
  COMPLETED: 4,
}

// ---- 学生来源(spec §7 要求作为高级搜索字段,但未列举取值;下列为初版提议,审稿可改)----
export const STUDENT_SOURCE = ['自主咨询', '老生推荐', '机构合作', '校园宣讲', '其他'] as const
export type StudentSource = (typeof STUDENT_SOURCE)[number]

// ---- 服务群所在平台(spec §7 要求作为高级搜索字段,但未列举取值;下列为初版提议,审稿可改)----
export const SERVICE_PLATFORM = ['研录保研', '研录考研', '高途', '其他'] as const
export type ServicePlatform = (typeof SERVICE_PLATFORM)[number]

// ---- 年级展示值(辅助高级搜索下拉)----
export const GRADE_VALUES = ['大一', '大二', '大三', '大四', '大五', '已毕业'] as const
export type GradeValue = (typeof GRADE_VALUES)[number]

// ---- 存储目录白名单(追加 3 项)----
export const STORAGE_FOLDERS = [
  'employees/attachments',
  'employees/import-batches',
  'students/attachments',   // ← 新增
  'students/images',        // ← 新增
  'students/import-batches',// ← 新增
] as const
```

学生的 `gender` 复用 `GENDER` 字典(男/女,与员工共享)。
学生的 `servingFor` 语义不等于员工的 "正服务于";学生叫 "服务群所在平台",用新字典 `SERVICE_PLATFORM`,字段名沿用 schema 的 `servicePlatform`(单值 String)。

### 4.4 学号规则 `IdSequenceService`

新增静态方法:
```ts
static formatStudentNo(year: number, seq: number): string {
  if (seq < 1 || seq > 9999) {
    throw new Error(`学号序号 ${seq} 超出 1-9999 范围`)
  }
  const yy = String(year).slice(-2).padStart(2, '0')
  return `${yy}${String(seq).padStart(4, '0')}`
}
```

- `allocate('student', enrollmentYear)` 复用现成逻辑;存储表 `IdSequence` 首次 `kind='student'` 某年会自动创建行。
- 与员工工号隔离:`(kind, year)` 主键保证不同 kind 互不干扰。
- 删除学生不回收序号(`IdSequence.lastSeq` 只增不减,spec §0 §4.2 要求)。

---

## 5. 后端详设 (apps/api)

### 5.1 依赖增补

`exceljs` / `minio` 已在 Phase 1A 引入,无新包。`class-validator` 已有。

### 5.2 `modules/students/dto/*`

```ts
// create-student.dto.ts
export class CreateStudentDto {
  @IsString() @MaxLength(50) name!: string
  @IsIn(GENDER as unknown as string[]) gender!: Gender
  @IsInt() @Min(1900) @Max(2100) enrollmentYear!: number
  @IsInt() @Min(1900) @Max(2100) graduationYear!: number
  @IsOptional() @IsString() @MaxLength(100) school?: string
  @IsOptional() @IsString() @MaxLength(100) major?: string
  @IsOptional() @IsString() counselorJobNo?: string
  @IsOptional() @IsString() plannerJobNo?: string
  @IsOptional() @IsString() @Matches(/^1[3-9]\d{9}$/) phone?: string
  @IsOptional() @IsEmail() email?: string
  @IsIn(SERVICE_PLATFORM as unknown as string[]) servicePlatform!: ServicePlatform
  @IsIn(STUDENT_SOURCE as unknown as string[]) source!: StudentSource
  @IsIn(SERVICE_STATUS as unknown as string[]) serviceStatus!: ServiceStatusLiteral
  @IsOptional() @IsNumberString() totalPublicCredits?: string  // 前端 Decimal 走字符串
  @IsOptional() @IsNumberString() totalPrivateCredits?: string
  @IsOptional() @IsNumberString() remainingPublicCredits?: string
  @IsOptional() @IsNumberString() remainingPrivateCredits?: string
  @IsOptional() @IsUrl() serviceChecklistUrl?: string
  @IsOptional() @IsArray() @IsString({ each: true }) serviceChecklistKeys?: string[]
  @IsOptional() @IsUrl() overallPlanUrl?: string
  @IsOptional() @IsArray() @IsString({ each: true }) policyKeys?: string[]
  @IsOptional() @IsArray() @IsString({ each: true }) transcriptKeys?: string[]
  @IsOptional() @IsArray() @IsString({ each: true }) scheduleKeys?: string[]
  @IsOptional() @Validate(IsDetailNotesValidator) detailNotes?: DetailNotes
  @IsOptional() @IsString() @MaxLength(5000) note?: string
}

// update-student.dto.ts:同上但所有字段 @IsOptional
// query-students.dto.ts:{ keyword?, page?, pageSize?, serviceStatus? }
// search-students.dto.ts:{ studentNo?, name?, grade?, major?, source?, servicePlatform?, page?, pageSize? }
// import.dto.ts:{ fileKey: string } - 与 employees 同
```

**`IsDetailNotesValidator`** — 自定义 class-validator 装饰器,校验 `DetailNotes` 结构(见 §4.1 约束)。实现放在 `apps/api/src/common/validators/is-detail-notes.validator.ts`。

### 5.3 `students.service.ts` 关键实现

```ts
@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idSequence: IdSequenceService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async list(query: QueryStudentsDto): Promise<StudentListResponse> { ... }
  async search(dto: SearchStudentsDto): Promise<StudentListResponse> { ... }
  async findOne(id: string): Promise<StudentDetail> { ... }
  async create(dto: CreateStudentDto, operatorId: string): Promise<StudentDetail> { ... }
  async update(id: string, dto: UpdateStudentDto, operatorId: string): Promise<StudentDetail> { ... }
  async remove(id: string, operatorId: string): Promise<void> { ... }
  private buildSortedListQuery(where, skip, take): Prisma.Sql { ... }
  private enrichWithGradeAndEmployees(students: StudentRow[]): Promise<StudentListItem[]> { ... }
  private snapshot(s: Student): Record<string, unknown> { ... }
}
```

**`buildSortedListQuery`** 核心 SQL:

```sql
SELECT /* LIST_SELECT 列 */
FROM "Student"
WHERE <conditions>
ORDER BY
  CASE "serviceStatus"
    WHEN 'NOT_STARTED' THEN 0
    WHEN 'IN_SERVICE' THEN 1
    WHEN 'ON_HOLD' THEN 2
    WHEN 'CANCELLED_OR_TERMINATED' THEN 3
    WHEN 'COMPLETED' THEN 4
  END ASC,
  CASE
    WHEN "enrollmentYear" IS NULL OR "graduationYear" IS NULL THEN 6
    WHEN EXTRACT(YEAR FROM now())::int > "graduationYear" THEN 5
    WHEN EXTRACT(YEAR FROM now())::int - "enrollmentYear" >= 4 THEN 0
    WHEN EXTRACT(YEAR FROM now())::int - "enrollmentYear" = 3 THEN 1
    WHEN EXTRACT(YEAR FROM now())::int - "enrollmentYear" = 2 THEN 2
    WHEN EXTRACT(YEAR FROM now())::int - "enrollmentYear" = 1 THEN 3
    ELSE 4
  END ASC,
  "name" ASC
LIMIT $take OFFSET $skip
```

LIST_SELECT 列集合(列表页需要):
```ts
const LIST_SELECT = {
  id: true, studentNo: true, name: true, gender: true,
  enrollmentYear: true, graduationYear: true,
  school: true, major: true,
  remainingPublicCredits: true, remainingPrivateCredits: true,
  serviceStatus: true, counselorJobNo: true, plannerJobNo: true,
} as const
```

`enrichWithGradeAndEmployees(students)`:
1. 收集全部 counselor/planner jobNo 去重,一次 `prisma.employee.findMany({ where: { jobNo: { in: [...] } }, select: { jobNo, name, employmentStatus } })`。
2. 对每行注入 `currentGrade = computeGrade(enrollmentYear, graduationYear)`。
3. 对每行注入 `counselor` / `planner` 展开对象,**包含 `employmentStatus`** 以便前端标识"已离职"。
4. 返回 `StudentListItem[]`。

**`search()`**:将 `SearchStudentsDto` 转成 `Prisma.StudentWhereInput`;`grade` 搜索需要反推 enrollment/graduation 范围:`大一` → enrollmentYear 在当前自然年;`大二` → 当前年 - 1;...;`已毕业` → graduationYear < 当前年;直接拼 SQL 而非 Prisma 动态 where 更清晰。

**`create()`**:

```ts
async create(dto, operatorId) {
  const seq = await this.idSequence.allocate('student', dto.enrollmentYear)
  const studentNo = IdSequenceService.formatStudentNo(dto.enrollmentYear, seq)
  const created = await this.prisma.student.create({ data: { ...dto, studentNo, ... } })
  await this.auditLogs.record({ operatorId, action: 'create', targetType: 'student', targetId: created.id, after: this.snapshot(created) })
  return this.enrichOne(created)
}
```

**`update()`** 的 AuditLog 拆分策略:
- 原子字段(name / gender / enrollmentYear / school / major / phone / email / servicePlatform / source / serviceStatus / counselorJobNo / plannerJobNo / note / 4 个 Decimal 课时字段 / 2 个 `*Url`)走 field-level diff,每个变动字段写 1 条 AuditLog
- 数组字段(`serviceChecklistKeys` / `policyKeys` / `transcriptKeys` / `scheduleKeys`)整体替换,写 1 条 AuditLog(`fieldName` 为该数组列名,before/after 存 JSON stringified 数组)
- `detailNotes`(内部含 `sections[]`)整体替换,写 1 条 `fieldName='detailNotes'` 的 AuditLog,不做 section-level 拆分

**`remove()`**:

```ts
async remove(id, operatorId) {
  const before = await this.prisma.student.findUnique({ where: { id } })
  if (!before) throw new NotFoundException('学生不存在')
  await this.prisma.student.delete({ where: { id } })  // Enrollment cascade
  await this.auditLogs.record({ operatorId, action: 'delete', targetType: 'student', targetId: id, before: this.snapshot(before) })
}
```

Phase 2 不检查被其它对象引用——`Enrollment` 由 schema `onDelete: Cascade` 处理,课程/薪酬暂未实施。

### 5.4 `students-import.service.ts`

Excel 导入列:
```
姓名, 性别, 入学年份, 毕业年份, 学校, 专业, 手机, 邮箱,
服务平台, 学生来源, 服务状态, 学管老师工号, 规划师工号
```

**不含**:`detailNotes`、各 `*Keys`、`*Url`、`remaining*Credits`、`total*Credits`、`note`。富字段与附件不适合表格录入,保留在详情弹窗。

**校验**:
- 必填:姓名、性别、入学年、毕业年、服务平台、学生来源、服务状态
- 枚举:`gender ∈ GENDER`,`servicePlatform ∈ SERVICE_PLATFORM`,`source ∈ STUDENT_SOURCE`,`serviceStatus ∈ SERVICE_STATUS`
- 日期整数:入学年、毕业年在 `1900..2100`
- 手机:`/^1[3-9]\d{9}$/`(可空)
- 邮箱:`@IsEmail` 语义(可空)
- 学管老师 / 规划师工号:若填了必须存在员工且 `employmentStatus != RESIGNED`;不存在 → error,`RESIGNED` → error "该员工已离职"

**`commit()`** 与 1A 同构:按 `enrollmentYear` 聚合调 `allocateBatch('student', year, count)`,在单事务内 `createMany` + `auditLog.createMany`。序号分配发生在事务外(与 Phase 1A 同样的"工号不回收"权衡,见 `employees-import.service.ts` §133-134 注释)。

### 5.5 `students.controller.ts` 路由

| 方法 | 路径 | 守卫 | 请求 | 响应 |
| --- | --- | --- | --- | --- |
| GET | `/students` | 登录 | query: `keyword?/page?/pageSize?/serviceStatus?` | `{ items: StudentListItem[], total, page, pageSize }` |
| POST | `/students/search` | 登录 | body: `SearchStudentsDto` | 同上 |
| GET | `/students/:id` | 登录 | — | `StudentDetail` |
| POST | `/students` | `@Roles(SUPER_ADMIN, ADMIN)` | `CreateStudentDto` | `StudentDetail` |
| PUT | `/students/:id` | `@Roles(SUPER_ADMIN, ADMIN)` | `UpdateStudentDto` | `StudentDetail` |
| DELETE | `/students/:id` | `@Roles(SUPER_ADMIN, ADMIN)` | — | `204` |
| GET | `/students/import/template` | `@Roles(SUPER_ADMIN, ADMIN)` | — | xlsx 二进制 |
| POST | `/students/import/dry-run` | `@Roles(SUPER_ADMIN, ADMIN)` | `{ fileKey }` | `ImportReport` |
| POST | `/students/import/commit` | `@Roles(SUPER_ADMIN, ADMIN)` | `{ fileKey }` | `{ created, errors }` |

### 5.6 `app.module.ts` 增量

```ts
imports: [
  ...,
  StudentsModule,
]
```

**`students.module.ts`**:
```ts
@Module({
  imports: [PrismaModule, IdSequenceModule, StorageModule, AuditLogsModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentsImportService],
})
export class StudentsModule {}
```

### 5.7 `students.types.ts`

```ts
export type StudentListItem = Pick<Student, /* LIST_SELECT 字段 */> & {
  currentGrade: GradeLabel
  counselor: { jobNo: string; name: string; employmentStatus: string } | null
  planner:   { jobNo: string; name: string; employmentStatus: string } | null
}

export type StudentDetail = Student & {
  currentGrade: GradeLabel
  counselor: { jobNo: string; name: string; employmentStatus: string } | null
  planner:   { jobNo: string; name: string; employmentStatus: string } | null
  relatedOutlineCategories: string[]   // Phase 2 固定 []
}

export type StudentListResponse = { items: StudentListItem[]; total: number; page: number; pageSize: number }

export type ImportReport = { totalRows: number; validRows: number; errors: Array<{ row: number; field: string; message: string }> }

export type ImportCommitResult = { created: number; errors: ImportReport['errors'] }
```

### 5.8 配套的小改动

- `common/id-sequence/id-sequence.service.ts` — 新增静态 `formatStudentNo`,位置紧跟 `formatEmployeeJobNo`。
- `common/dictionaries.ts` — 追加 §4.3 所有常量与 `STORAGE_FOLDERS` 追加 3 项(注意:这个白名单也被 `storage.controller.ts:20` 的 `signDownload` 用到,学生附件下载即生效)。
- `common/validators/is-detail-notes.validator.ts` — 自定义 class-validator。

---

## 6. 前端详设 (apps/web)

### 6.1 依赖增补

无新增三方包。AntD 的 `Drawer`、`Table`、`Modal`、`Upload`、`Select`、`Cascader`、`InputNumber` 全够用。

### 6.2 `services/students.ts`

```ts
export const studentsApi = {
  list: (params: StudentQueryParams = {}) => api.get<StudentListResponse>(`/students${toQuery(params)}`),
  search: (body: AdvancedSearchBody) => api.post<StudentListResponse>('/students/search', body),
  detail: (id: string) => api.get<StudentDetail>(`/students/${id}`),
  create: (body: CreateStudentBody) => api.post<StudentDetail>('/students', body),
  update: (id: string, body: UpdateStudentBody) => api.put<StudentDetail>(`/students/${id}`, body),
  remove: (id: string) => api.delete<void>(`/students/${id}`),
  importDryRun: (fileKey: string) => api.post<ImportReport>('/students/import/dry-run', { fileKey }),
  importCommit: (fileKey: string) => api.post<ImportCommitResult>('/students/import/commit', { fileKey }),
  downloadTemplate: () => downloadAuthed('/students/import/template', '学生导入模板.xlsx'),
}
```

### 6.3 `constants/dictionaries.ts` 增量

后端 `common/dictionaries.ts` 的镜像:`SERVICE_STATUS` + labels + tag 颜色映射、`STUDENT_SOURCE` + options、`SERVICE_PLATFORM` + options、`GRADE_VALUES` + options。
`SERVICE_STATUS_TAG_COLOR`:
```ts
export const SERVICE_STATUS_TAG_COLOR: Record<ServiceStatusLiteral, string> = {
  NOT_STARTED: 'default',
  IN_SERVICE: 'blue',
  ON_HOLD: 'gold',
  CANCELLED_OR_TERMINATED: 'red',
  COMPLETED: 'green',
}
```

### 6.4 `utils/grade.ts`

```ts
export function computeGrade(enrollmentYear: number | null, graduationYear: number | null, now = new Date()): GradeLabel { ... }
```
和后端 `common/grade/grade.ts` 保持行为一致。改动需同步,靠 code review + 字典 README 警示。

### 6.5 `features/students/`

#### `StudentListPage.tsx`

布局严格按 spec §4.1:

- 标题 `学生信息管理` 左上对齐
- 工具按钮 `查看 / 编辑 / 添加学生 / 删除学生 / 从 Excel 导入`(ADMIN+ 才见写按钮)
- 工具组右侧 `<div style={{ flex: 1 }}>` 撑开
- 搜索框 `<Input.Search placeholder="搜索 学号 / 姓名 / 电话 / 学校">` 280px
- 搜索框右侧 16px 间隙 + `<Button icon={<FilterOutlined />}>高级搜索</Button>`
- 当高级搜索已应用 → 在表格上方显示 `<Tag>已应用筛选 (N 项)</Tag>` + `<a>清除</a>`
- `<Table rowSelection>` 首列复选框,`pageSize: 50`
- 列:学号、姓名、性别、学校、专业、**当前年级**(从 `currentGrade` 字段)、公共课剩余、1v1 剩余、**服务状态**(Tag 带颜色)
- 按钮联动完全复用 Phase 1A 模式(spec §4.2)
- 高级搜索结果展示时,顶部分页保留;清除后回归普通搜索

#### `StudentFormModal.tsx`

- `mode: 'create' | 'view' | 'edit'`
- `<Modal width={1100}>`(比员工弹窗宽,承载更多字段)
- 内部 `<Form layout="vertical">` + `<Row gutter={24}>` + `<Col span={12}>` 双列
- 学号字段占位"自动计算/保存后生成",`disabled`
- 入学年份 / 毕业年份 `<InputNumber min={1900} max={2100} precision={0} />`(spec §5 "四位整数")
- 年级 `<Input disabled value={currentGrade} />`,灰底,文案"(按入学 / 毕业年自动计算)"
- 学管老师 / 规划师 `<EmployeePicker>` 组件
- 性别 / 服务平台 / 学生来源 / 服务状态 `<Select>` 配合字典 options
- 4 个课时字段 `<InputNumber precision={2} min={0} />`
- 服务清单 URL `<Input placeholder="链接">` + `<StudentAttachmentUpload folder="students/attachments" />` 多文件
- 总规划 URL `<Input>`
- 加分政策 `<StudentAttachmentUpload folder="students/attachments" multiple>`
- 成绩单 `<StudentAttachmentUpload folder="students/attachments" multiple>`
- 本学期课表 `<StudentAttachmentUpload folder="students/attachments" multiple>`
- 各类服务项详情 `<ServiceSectionEditor value={detailNotes} onChange={...} />`
- 已上课程的二级课程类别(只读占位)`<div>(待课程模块上线后自动同步)</div>`
- 备注 `<Input.TextArea rows={4} maxLength={5000} />`
- Modal 内部滚动:`styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}`
- 底部按钮(spec §5.2 复用员工规则):view → [取消 / 编辑],create & edit → [取消 / 确定]

#### `EmployeePicker.tsx`(新,跨模块组件)

```tsx
type EmployeePickerProps = {
  value: string | null          // counselor/plannerJobNo
  onChange: (jobNo: string | null) => void
  placeholder?: string
  disabled?: boolean
  /** 已选中的人如果已离职,组件内展示但不可重新选中 */
  historicalEmployee?: { jobNo: string; name: string; employmentStatus: string }
}
```

实现:
- 内部用 AntD `<Select showSearch filterOption={false} onSearch={...}>`
- 请求 `/api/employees?employmentStatus=FULL_TIME|PART_TIME&keyword=...`(**注意:现有 `query-employees.dto.ts` 已支持 `employmentStatus` 过滤,但只支持单值**;本组件需要同时查 `FULL_TIME` ∪ `PART_TIME`)
- **后端补小改动**:`QueryEmployeesDto.employmentStatus` 改为数组或新增 `excludeResigned: boolean` 开关。采取**新增 `excludeResigned` 开关**方式(改动最局部,不破坏单值查询语义)
- 选项渲染:`{name} ({jobTitle}) — {jobNo}`
- `historicalEmployee` 若存在且与 `value` 匹配且 `employmentStatus==='RESIGNED'`,展示 `<Tag color="red">已离职</Tag>`,下拉 option 列表里**不**出现;但展示标签要在 Select 上呈现
- 放在 `apps/web/src/components/EmployeePicker.tsx`(进 `components/`,不放进 `features/students/`,便于后续课程/薪酬模块复用)

#### `ServiceSectionEditor.tsx`

```tsx
type ServiceSectionEditorProps = {
  value: DetailNotes | null
  onChange: (next: DetailNotes | null) => void
  disabled?: boolean  // view 模式
}
```

UI:
- 顶部 `<Button icon={<PlusOutlined />} onClick={addSection}>添加一段</Button>`(view 模式隐藏)
- 每一段渲染为 AntD `<Card>`:
  - 标题行:`<Input>` 段标题 + `<Button danger icon={<DeleteOutlined />}>删除本段</Button>`
  - `<Input.TextArea rows={4}>` 段 body
  - `<Form.List>` 链接数组,每项一个 `<Input>` + 删除按钮 + "新增链接"
  - `<StudentAttachmentUpload folder="students/attachments" multiple>` 段级附件
  - `<StudentAttachmentUpload folder="students/images" multiple accept="image/*">` 段级图片
- 无段时展示 `<Empty description="暂无服务详情" />`
- 段顺序允许拖拽排序(可选,Phase 2 先不实现,按添加顺序排列)

#### `StudentAttachmentUpload.tsx`

包装 AntD `<Upload>`,复用 `services/storage.ts` 的 `uploadToStorage(folder, file)`。参数:
```tsx
type Props = {
  value: string[]
  onChange: (keys: string[]) => void
  folder: 'students/attachments' | 'students/images'
  multiple?: boolean
  accept?: string
  disabled?: boolean
}
```
- 已上传项点击 → `storageApi.signDownload(key)` 打开
- 图片模式(`folder === 'students/images'`)上传后显示缩略图
- 删除仅前端 filter key,不调后端;MinIO 对象由 bucket lifecycle 清理

#### `StudentAdvancedSearchDrawer.tsx`

- `<Drawer open width={420} placement="right" title="高级搜索" onClose={...}>`
- 内部 `<Form layout="vertical">` 6 字段:
  - 学号 `<Input>`
  - 姓名 `<Input>`
  - 年级 `<Select options={GRADE_VALUES}>`
  - 专业 `<Input>`
  - 学生来源 `<Select options={STUDENT_SOURCE}>`
  - 服务群所在平台 `<Select options={SERVICE_PLATFORM}>`
- 底部固定 `<Space>` `[重置 / 搜索]`
- 移动端(`md` 以下)`placement="bottom"` + 全高

#### `StudentImportDrawer.tsx`

与 `EmployeeImportDrawer.tsx` 同构,仅 fileKey folder 改 `students/import-batches`,API 改 `studentsApi`。

#### `StudentDeleteConfirm.tsx`

AntD `Modal.confirm`:
- title: `确认删除该学生?`
- content: 学生删除后不可恢复;服务档案、附件、历史选课(若有)一并移除。请确认。
- okText: "确认删除",`okButtonProps: { danger: true }`
- 成功后 `message.success('学生已删除')`

#### `hooks/useStudents.ts` / `useStudentMutations.ts`

与员工对应文件完全同构,只是 queryKey 为 `['students', params]` / `['students', 'search', body]`。`removeMutation` 不需要 409 处理(Phase 2 不会有 Conflict)。

### 6.6 `router.tsx` 改动

`/students` 占位换成 `<StudentListPage />`:

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

一般成员(`MEMBER`)仍可见列表与查看(spec §0 §3 允许),写按钮靠页面内按角色隐藏(沿用 `EmployeeListPage` 的 `canManage` 模式)。

---

## 7. 错误处理与边界

| 场景 | 后端行为 | 前端表现 |
| --- | --- | --- |
| DTO 校验失败 | `400 ValidationError` | AntD `Form` 红字段 + `message.error` |
| 学号序号溢出 9999 | `Error: 学号序号 N 超出 1-9999 范围` → 500 | `message.error('学号序号已耗尽,请联系管理员')` |
| 员工选择器选到已离职 | 前端不会选中,API 不会收到 | — |
| 导入文件选择了已离职员工工号 | dryRun 返回 error "该员工已离职" | Drawer 标黄 + 禁用"确认导入" |
| `detailNotes` 超限(>50 段) | `400 ValidationError` | 表单提示 |
| counselor/planner 工号不存在 | create/update DTO 层不校验,入库即可;**前端不让从选择器里选到不存在员工** | — |
| 一般成员调写接口 | `403 Forbidden` | `message.error('无操作权限')`;按钮前端已隐藏 |
| MinIO 上传失败 | fetch PUT 失败 | `message.error('附件上传失败,请重试')` |
| 高级搜索条件全空 | 后端返回全量(spec §7 "若所有筛选项为空,则等价于展示全部学生记录") | 列表刷新 |

---

## 8. 验收清单(spec §9 映射)

- [ ] `/students` 未登录 → Phase 0 `RequireAuth` 跳无权限页
- [ ] `/students` 登录 → 列表 + 工具按钮 + 搜索框,布局对齐 fig09
- [ ] 默认排序:服务状态(未开始→完成)+ 年级(大五→大一→已毕业→空)+ 姓名升序
- [ ] 分页每页 50 条
- [ ] 按钮联动:无勾选禁用查看/编辑/删除;1 条勾选启用;≥2 条禁用查看/编辑,删除保持启用
- [ ] 添加学生弹窗:双列布局,学号"自动计算/保存后生成"只读,入学年/毕业年为 4 位整数输入,年级只读自动计算
- [ ] 添加后学号格式 `YYNNNN`(例:`260001`)
- [ ] 删除学号 `260002` 后再添加 → 得到 `260003`,**不**回收 `260002`
- [ ] 删除前弹确认框
- [ ] 服务档案字段齐全:服务清单、总规划、加分政策、成绩单、本学期课表、各类服务项详情、备注
- [ ] 各类服务项详情可新增多段,每段支持文本+链接+多文件+多图
- [ ] 学管老师/规划师选择器只列在职员工,历史离职学生可见"已离职"红 Tag 但不能被重新选择
- [ ] 列表"公共课剩余"/"1v1 剩余"来自 `remainingPublicCredits`/`remainingPrivateCredits`
- [ ] 高级搜索 Drawer 支持 6 字段 AND 组合,筛选后列表刷新,可清除回归普通搜索
- [ ] 高级搜索全部为空 → 等价全量列表
- [ ] Excel 导入:下载模板 → 填 3 行 → 预校验 → 确认导入 → 列表新增 3 条,学号连续
- [ ] Excel 模板缺列 / 枚举错 / 学管工号不存在或已离职 → 预校验报告标行 + 字段 + 消息,"确认导入"禁用
- [ ] AuditLog 对每次创建/编辑/删除都有记录;编辑改 2 个字段写 2 条 fieldName 不同的记录;`detailNotes` 变动写 1 条整体替换记录

测试以手动执行为准;自动化测试基础设施仍不在本阶段范围内。

---

## 9. 范围边界(明确**不**做)

- 真实 Enrollment / Course 数据(→ Phase 3/4;`relatedOutlineCategories` 固定 `[]` 占位)
- `remainingPublicCredits` / `remainingPrivateCredits` 自动扣减(→ Phase 4)
- 学生删除对薪酬/课程模块的反向保护(→ Phase 4/5 添加时再评估;Phase 2 删除只走 Enrollment cascade)
- 服务档案段 section 的拖拽排序(可选功能,初版按添加顺序)
- 服务档案段 body 的 Markdown / 富文本渲染(Phase 2 纯文本)
- 学生头像 / 证件照(spec 未强制;可通过通用 sections.imageKeys 承载)
- 拼音首字母搜索、按年级范围搜索(高级搜索只支持 6 字段精确匹配 + contains)
- 学生号跨年度迁移 / 年度滚动补录(学号基于 enrollmentYear,固定)
- 移动端学生表单专门优化(沿用 Phase 0 响应式 + Drawer 的 `md` 断点)
- 自动化测试基础设施

---

## 10. 变更文件一览

**新增(后端)**:

- `apps/api/src/common/grade/grade.ts`
- `apps/api/src/common/validators/is-detail-notes.validator.ts`
- `apps/api/src/modules/students/students.module.ts`
- `apps/api/src/modules/students/students.controller.ts`
- `apps/api/src/modules/students/students.service.ts`
- `apps/api/src/modules/students/students-import.service.ts`
- `apps/api/src/modules/students/students.types.ts`
- `apps/api/src/modules/students/dto/create-student.dto.ts`
- `apps/api/src/modules/students/dto/update-student.dto.ts`
- `apps/api/src/modules/students/dto/query-students.dto.ts`
- `apps/api/src/modules/students/dto/search-students.dto.ts`
- `apps/api/src/modules/students/dto/import.dto.ts`

**修改(后端)**:

- `apps/api/prisma/schema.prisma`(+ `enum ServiceStatus`;`Student.serviceStatus` 升 enum;+ `transcriptKeys`;+ 2 个 `@@index`)
- `apps/api/src/app.module.ts`(+ `StudentsModule`)
- `apps/api/src/common/dictionaries.ts`(+ `SERVICE_STATUS*` / `STUDENT_SOURCE` / `SERVICE_PLATFORM` / `GRADE_VALUES`;`STORAGE_FOLDERS` + 3)
- `apps/api/src/common/id-sequence/id-sequence.service.ts`(+ `formatStudentNo`)
- `apps/api/src/modules/employees/dto/query-employees.dto.ts`(+ `excludeResigned?: boolean`)
- `apps/api/src/modules/employees/employees.service.ts`(`list()` 在 `excludeResigned === true` 时加 `employmentStatus != RESIGNED` where)

**新增(前端)**:

- `apps/web/src/services/students.ts`
- `apps/web/src/utils/grade.ts`
- `apps/web/src/components/EmployeePicker.tsx`
- `apps/web/src/features/students/StudentListPage.tsx`
- `apps/web/src/features/students/StudentFormModal.tsx`
- `apps/web/src/features/students/StudentDeleteConfirm.tsx`
- `apps/web/src/features/students/StudentImportDrawer.tsx`
- `apps/web/src/features/students/StudentAdvancedSearchDrawer.tsx`
- `apps/web/src/features/students/ServiceSectionEditor.tsx`
- `apps/web/src/features/students/StudentAttachmentUpload.tsx`
- `apps/web/src/features/students/types.ts`
- `apps/web/src/features/students/hooks/useStudents.ts`
- `apps/web/src/features/students/hooks/useStudentMutations.ts`

**修改(前端)**:

- `apps/web/src/router.tsx`(`/students` 占位 → `<StudentListPage />`)
- `apps/web/src/constants/dictionaries.ts`(+ `SERVICE_STATUS*` / `STUDENT_SOURCE` / `SERVICE_PLATFORM` / `GRADE_VALUES`)
- `apps/web/src/styles.css`(学生页/弹窗/服务段卡片相关补丁,按需)
- `apps/web/src/services/employees.ts`(若直接查员工的 picker 用到 `excludeResigned`,params 中允许该字段)

**不动**:

- `apps/api/src/modules/{course-outlines,courses,payroll,links}/`(仍占位)
- `apps/web/src/features/{auth,employees,user-settings,users}/`(Phase 1 完整,不碰)
- `docker-compose.yml`(MinIO / Postgres 已就绪)
- 任何 env 新增(Phase 2 不引入新外部依赖)

---

## 11. 与后续 Phase 的接口预留

Phase 2 落完后,Phase 3 (课程大纲)/ Phase 4 (课程与选课)/ Phase 5 (薪酬)可以直接复用:

- `EmployeePicker` 作为跨模块员工选择器(薪酬挑老师、课程挑授课老师都复用)
- `StudentDetail.relatedOutlineCategories` 字段:Phase 3 切真实查询,Student 弹窗前端零改动
- `Student.remainingPublicCredits` / `remainingPrivateCredits`:Phase 4 选课时自动扣减,列表自动反映
- `Student.counselorJobNo` / `plannerJobNo`:Phase 5 薪酬可按规划师维度做学生归组
- `ServiceSectionEditor`:如果后续员工/课程需要同样的"多段富字段"能力,直接复用(泛化成 `SectionEditor<T>`)
- `SERVICE_STATUS` 字典:任何按学生服务状态做列表筛选/报表的场景直接引用
- `common/grade/grade.ts`:后续任何需要展示或排序"当前年级"的视图一律走这里

Phase 2 不预先建任何 Phase 3+ 的空壳模块/路由/页面,保持 `modules/{course-outlines,courses,payroll,links}/` 占位空目录的现状。
