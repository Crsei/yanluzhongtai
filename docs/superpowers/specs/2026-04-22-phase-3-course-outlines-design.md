# Phase 3 — 课程大纲管理 · 实现设计

> 对应需求:[docs/spec/04-Phase3-课程大纲管理.md](../../spec/04-Phase3-课程大纲管理.md)
> 上游:[Phase 1A · 员工模块](./2026-04-22-phase-1a-employees-design.md) / [Phase 1B · 用户与权限管理](./2026-04-22-phase-1b-users-design.md) / [Phase 2 · 学生管理](./2026-04-22-phase-2-students-design.md)
> 下游预留:Phase 4(课程详细信息与学生选课)/ Phase 5(薪酬)

## 1. 范围与决策摘要

Phase 3 聚焦课程大纲的版本化管理与板块/条目的 CRUD,是课程板块数据底座的落地。本阶段不触碰 `Course` 模型本身(Phase 4),也不涉及 `Enrollment`(Phase 4)。

**硬性依赖**:本 Phase 在实施顺序上必须在 Phase 2 之后,因为复用 Phase 2 交付的 `apps/web/src/components/EmployeePicker.tsx` 组件(计划授课老师选择)。若 Phase 2 尚未落地,需先完成或提前把 `EmployeePicker` + `excludeResigned` 开关从 Phase 2 spec 里抽出来作为先决条件。

Phase 3 复用 Phase 1A/2 已落地的基础设施:`StorageService`(MinIO presign 直传,下载空白模板使用)、`AuditLogsService`、`RequireAuth`/`RequireRole`、`services/storage.ts`、`services/http.ts` 的 `downloadAuthed`、`constants/dictionaries.ts` 模式、Phase 2 新建的 `EmployeePicker` 跨模块组件。

| # | 决策 | 选择 | 备注 |
| --- | --- | --- | --- |
| Q1 | 大纲页路由 | `/courses/outline` 子路由,`/courses` 仍为 `ModulePage` 占位 | Phase 4 落地 `/courses` 时 `/courses/outline` URL 零迁移 |
| Q2 | 板块 display name 存储 | 新增 `CourseSection` Prisma model(per 大纲版本) | 支持板块排序元数据;`CourseOutlineItem.sectionCode` 通过 `(outlineVersionId, code)` 语义关联 |
| Q3 | `isActive` 语义 | "最新创建 = 活跃",全局唯一,自动维护 | 创建新大纲时自动 activate,删除活跃则 `createdAt DESC` 顶上 |
| Q4 | 板块创建 UX | 内联在"向大纲添加"弹窗 | 不新增工具栏按钮,与 spec §2 操作列表吻合 |
| Q5 | 版本号溢出(Z 之后) | 抛错阻止创建 | 业务上 Z 远超极限,触发人工干预 |
| Q6 | 空白模板 | 运行期生成 `kcdg.xlsx`,不入 git | 与 Phase 1A 员工模板同构,由 `/outline/template` 端点返回 xlsx 二进制 |
| Q7 | 导入"覆盖"粒度 | 事务内全量 drop `CourseSection` + `CourseOutlineItem` 后重建 | 版本号不变;Courses 的松 FK (`sectionCode`/`categorySequenceNo`) 保留引用但可能悬空(Phase 3 无 Course 数据,Phase 4+ 再补一致性检查) |
| Q8 | "实际授课老师(自动同步)" | Phase 3 固定返回 `actualTeachers: []` | Phase 4 切真实 groupBy Course.actualTeacherJobNo |
| Q9 | 编辑单条 item | 单独 Modal | 不做行内编辑;双击行或点"编辑"按钮打开 |
| Q10 | 条目内排序 | `sequenceNo` 按数值升序 | schema 存 String(如"01"),service 层 `Number()` 解析排序;非数字值(理论上不会出现)统一排到最末 |

---

## 2. 高层架构

```
┌── apps/web ─────────────────────────────────────┐    ┌── apps/api ─────────────────────────────────┐
│ features/course-outlines/                         │    │ modules/course-outlines/                       │
│   CourseOutlinePage.tsx                           │    │   course-outlines.controller.ts                │
│     └─ 顶部工具条 + 板块分组卡片 Table             │    │   course-outlines.service.ts                   │
│   OutlineVersionDropdown.tsx                      │    │   course-outline-items.service.ts              │
│   AddOutlineItemModal.tsx (+内联新建板块)          │    │   course-outline-import.service.ts             │
│   EditOutlineItemModal.tsx                        │    │   course-outlines.types.ts                     │
│   CreateVersionConfirm.tsx                        │────┤   dto/*.dto.ts                                 │
│   DeleteVersionConfirm.tsx (要求输入版本号)         │    │                                                 │
│   DeleteItemsConfirm.tsx (列出将被删的类别)         │    │   complex: plannedTeacher 展开、actualTeachers │
│   ImportOverwriteDrawer.tsx                       │    │            占位(Phase 3 为 [])                │
│   hooks/useOutline*.ts                            │────┤ modules/storage/  (STORAGE_FOLDERS + 1 项)      │
│ services/course-outlines.ts                       │    │   + course-outlines/import-batches             │
│ constants/dictionaries.ts                         │    │                                                 │
│   + TEACHING_TYPE (建议/实际授课方式)              │    │ common/dictionaries.ts (+ TEACHING_TYPE)       │
│                                                   │    │                                                 │
│ router.tsx: /courses/outline → CourseOutlinePage  │    │ prisma/schema.prisma:                           │
│   /courses 保留 ModulePage 占位                   │    │   + model CourseSection                         │
│                                                   │    │   ~ CourseOutlineVersion index/constraint 补齐 │
│ components/EmployeePicker.tsx (Phase 2 既有,复用) │    │   ~ CourseOutlineItem @@unique + 板块 FK 语义约束│
└───────────────────────────────────────────────────┘    └──────────────────────────────────────────────┘
                                                                              │
                                                          ┌─── infra ────────┴──────┐
                                                          │ Postgres (db)            │
                                                          │ MinIO                    │
                                                          │   folders: course-outlines/import-batches │
                                                          └──────────────────────────┘
```

**典型时序**:

```
进入页面:
  web  CourseOutlinePage 挂载
  web  useOutlineVersions() → api.get('/course-outlines/versions')
       返回 [{ id, versionName, isActive, itemCount, createdAt }]
  web  默认选中 isActive=true 的版本;若无任何版本,工具条右半部禁用、主体渲染"暂无大纲,请创建"
  web  useOutline(activeVersionId) → api.get('/course-outlines/versions/:id')
       返回 { version, sections: [{ code, name, displayOrder }], items: [{...}] }
  web  按 section.displayOrder 分组渲染白色卡片;每卡片内 Table 按 sequenceNo 升序

创建新大纲:
  web  点击"创建新大纲" → CreateVersionConfirm 弹警告
       "即将创建新空白大纲,新版本将自动设为活跃。是否继续?"
  web  确认 → api.post('/course-outlines/versions')
  api  service.createVersion:
       1. 取当前 isActive 版本 → 解析 YY + 字母
       2. 根据当前日历年决定 YY(跨年则重置)
       3. 递增字母;若 latestLetter == 'Z' 且年份未跨 → throw 409
       4. prisma.$transaction:
          - updateMany isActive=false
          - create { versionName, isActive: true }
       5. auditLog.record({ action: 'create', targetType: 'course_outline_version', ... })
  web  成功 → 下拉自动切到新版本;invalidate ['outline-versions']

向大纲添加(含内联新建板块):
  web  点"向大纲添加" → AddOutlineItemModal
       字段:板块选择(Select,支持"+ 新建板块")、序列号、二级课程类别、
             建议授课方式、计划授课老师、教案URL
  web  若用户选"+ 新建板块" → 弹出内嵌的"板块代码 + 板块名称 + 排序"录入
  web  提交 → api.post(`/course-outlines/versions/:versionId/items`, body)
  api  course-outline-items.service.addItem:
       1. 如果 body.newSection 存在 → 校验 code 在本版本内唯一 → 事务内建 CourseSection
       2. 否则 body.sectionCode 必须在本版本已有 sections 中
       3. prisma.courseOutlineItem.create
       4. auditLog.record({ action: 'create', targetType: 'course_outline_item', ... })

编辑 item:
  web  勾 1 条 → 启用"编辑" → EditOutlineItemModal 打开
  web  提交 → api.put(`/course-outlines/items/:itemId`, body)
  api  service.updateItem:
       1. 取 before 快照
       2. 应用更新;sectionCode 变更需验证目标 section 在同版本内存在
       3. auditLog field-level diff

从大纲删除(勾选 1+ 条):
  web  启用"从大纲删除" → DeleteItemsConfirm 弹窗
       "即将删除以下二级课程类别:<列出每条 name>。
        若现有课程引用了这些分类,对应课程的分类将变为空值。是否继续?"
  web  确认 → api.delete('/course-outlines/items', { body: { ids: [...] } })
  api  service.deleteItems(ids):
       1. 取每条 before 快照
       2. prisma.$transaction:
          - prisma.courseOutlineItem.deleteMany({ where: { id: in ids } })
          - Phase 3 暂无 Course 引用,不做跨表 update;Phase 4 会补 Course 悬空检测
       3. 每条写 1 条 auditLog

创建新版本(导入并覆盖):
  web  点"导入并覆盖" → ImportOverwriteDrawer
  web  下载模板 → /api/course-outlines/template (二进制 xlsx,运行期生成)
  web  上传填好的文件 → uploadToStorage('course-outlines/import-batches', file) → fileKey
  web  api.post('/course-outlines/versions/:id/import/dry-run', { fileKey })
  api  import.service.dryRun:
       1. 解析 xlsx → 校验列齐全 + 每行枚举值
       2. 检查板块代码+名称一致性(同一 code 不能出现不同 name)
       3. 检查 planned teacher jobNo 存在且未离职
       4. 返回 { totalRows, validRows, uniqueSections, errors }
  web  errors 为空 → 用户再次确认 → api.post(`/course-outlines/versions/:id/import/commit`, { fileKey })
  api  import.service.commit:
       1. 重新 parse + validate
       2. prisma.$transaction:
          - 删除本版本全部 CourseSection + CourseOutlineItem(cascade 自动)
          - 按 unique (code, name) 建 CourseSection,displayOrder 按模板首次出现顺序
          - createMany CourseOutlineItem 挂新 section
          - auditLog.record({ action: 'import_overwrite', targetType: 'course_outline_version', ... })

删除当前大纲:
  web  点"删除当前大纲" → DeleteVersionConfirm 高风险弹窗
       "即将永久删除版本 2024C,此动作不可恢复。
        请输入版本号以确认:[___________]"
  web  输入匹配 → 启用"确认删除"
  web  api.delete(`/course-outlines/versions/:id`)
  api  service.deleteVersion:
       1. 取 before 快照
       2. prisma.$transaction:
          - 若当前 isActive,先找 createdAt DESC 且 id != 本身的下一个版本 → 该版本 isActive=true
          - prisma.courseOutlineVersion.delete (cascade 清 Section + Item)
       3. auditLog
```

---

## 3. Prisma schema 增量

`apps/api/prisma/schema.prisma`:

```prisma
model CourseOutlineVersion {
  id           String              @id @default(cuid())
  versionName  String              @unique              // 例: "课程大纲-24A"
  isActive     Boolean             @default(false)
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
  sections     CourseSection[]                           // ← 新增反向关系
  items        CourseOutlineItem[]
  courses      Course[]

  @@index([isActive])                                   // ← 新增:活跃版本查询
}

model CourseSection {                                    // ← 全新 model
  id               String @id @default(cuid())
  outlineVersionId String
  code             String                                // 例: "GP"
  name             String                                // 例: "GPA提升"
  displayOrder     Int    @default(0)                    // 板块卡片排序
  outlineVersion   CourseOutlineVersion @relation(fields: [outlineVersionId], references: [id], onDelete: Cascade)

  @@unique([outlineVersionId, code])
}

model CourseOutlineItem {
  id                    String               @id @default(cuid())
  outlineVersionId      String
  sectionCode           String                                    // 语义 FK 到 CourseSection(outlineVersionId, code)
  sequenceNo            String                                    // 存 "01"/"02",SQL 侧转 int 排序
  secondaryCategoryName String
  suggestedTeachingType String
  plannedTeacherJobNo   String?
  lessonPlanUrl         String?
  outlineVersion        CourseOutlineVersion @relation(fields: [outlineVersionId], references: [id], onDelete: Cascade)

  @@unique([outlineVersionId, sectionCode, sequenceNo])            // ← 新增:同版本同板块序列号不重复
  @@index([outlineVersionId, sectionCode])
}
```

**变更说明**:

- `CourseSection` 全新表;`outlineVersionId` cascade delete 保证版本删除自动清板块。
- `CourseOutlineItem.sectionCode` 不建硬 FK 到 `CourseSection`,保持现状(Prisma 不支持跨列组合 FK 到 `(outlineVersionId, code)` 这种复合 unique);一致性完全由 service 层守护,这与 Phase 2 的 `counselorJobNo` 松 FK 策略一致。
- `CourseOutlineItem` 新增 `@@unique([outlineVersionId, sectionCode, sequenceNo])`,阻止同板块序列号冲突;DB 层硬约束。
- 当前项目 `CourseOutlineVersion` / `CourseOutlineItem` 均无生产数据(首次实装),`prisma db push` 无需 backfill。
- **迁移路径**:开发者拉代码后跑 `pnpm prisma:generate && pnpm prisma:push`。无新增 env。

---

## 4. 领域约定

### 4.1 版本号算法 `common/course-outline-version/version-name.ts`

```ts
export const VERSION_NAME_PREFIX = '课程大纲-'

export type ParsedVersion = { year: number; letter: string }  // letter ∈ 'A'..'Z'

export function parseVersionName(name: string): ParsedVersion | null {
  const m = /^课程大纲-(\d{2})([A-Z])$/.exec(name)
  if (!m) return null
  return { year: 2000 + Number(m[1]), letter: m[2] }
}

export function formatVersionName(year: number, letter: string): string {
  const yy = String(year).slice(-2).padStart(2, '0')
  return `${VERSION_NAME_PREFIX}${yy}${letter}`
}

/**
 * 给定当前最新版本(可为 null)与当前日历年,计算下一个版本名。
 * 规则:
 *   - 无最新版本:当年 A
 *   - 最新.year < 今年:跨年重置为今年 A
 *   - 最新.year == 今年 且 letter < 'Z':letter+1
 *   - 最新.year == 今年 且 letter == 'Z':throw
 *   - 最新.year > 今年(理论上服务器时钟倒退):按最新.year 继续递增 letter
 */
export function computeNextVersionName(
  latest: ParsedVersion | null,
  nowYear: number,
): string {
  if (!latest) return formatVersionName(nowYear, 'A')
  if (latest.year < nowYear) return formatVersionName(nowYear, 'A')
  if (latest.letter === 'Z') {
    throw new Error(`已达 ${latest.year} 年度版本上限(Z),请在下一年度创建`)
  }
  const nextLetter = String.fromCharCode(latest.letter.charCodeAt(0) + 1)
  return formatVersionName(latest.year, nextLetter)
}
```

service 层调用:`const latest = await prisma.courseOutlineVersion.findFirst({ where: { isActive: true } })`;解析 → 算 → 创建。算法**不**扫全表取最大,只看 `isActive` 版本(Q3 语义保证 active = 最新)。

### 4.2 字典新增(`common/dictionaries.ts`)

```ts
// ---- 建议/实际授课方式 ----
export const TEACHING_TYPE = ['公共课', '1v1', '小班课', '录播', '其他'] as const
export type TeachingType = (typeof TEACHING_TYPE)[number]

// ---- 存储目录白名单(追加 1 项)----
export const STORAGE_FOLDERS = [
  'employees/attachments',
  'employees/import-batches',
  'students/attachments',
  'students/images',
  'students/import-batches',
  'course-outlines/import-batches',  // ← 新增
] as const
```

**取值说明**:`TEACHING_TYPE` 的 5 个值是初版提议(spec 未列举具体枚举),审稿可改。审稿通过后,Excel 导入模板、单条 item add/edit 弹窗的 `<Select>`、Phase 4 课程详情的"实际授课方式"都会复用该字典。

### 4.3 导入模板字段

模板列(顺序):

| 列头(中文) | 字段 | 必填 | 约束 |
| --- | --- | --- | --- |
| 板块代码 | sectionCode | ✅ | 2 字母,大写 A-Z |
| 板块名称 | sectionName | ✅ | 同 sectionCode 多行必须同名 |
| 板块排序 | sectionDisplayOrder | ⬜ | 正整数;未填按首次出现顺序 |
| 序列号 | sequenceNo | ✅ | 1-99 正整数,存为 `01`/`02` padded 字符串 |
| 二级课程类别名称 | secondaryCategoryName | ✅ | 文本 |
| 建议授课方式 | suggestedTeachingType | ✅ | ∈ `TEACHING_TYPE` 白名单 |
| 计划授课老师工号 | plannedTeacherJobNo | ⬜ | 必须存在员工且未离职 |
| 教案排期链接 | lessonPlanUrl | ⬜ | URL 格式 |

模板首行加示例行(与 Phase 1A 员工模板同构)。生成逻辑在 `course-outline-import.service.generateTemplate()`,返回 `Buffer`。

### 4.4 实际授课老师汇总(Phase 3 占位)

`CourseOutlineItem` 返回详情时附带:

```ts
actualTeachers: Array<{ jobNo: string; name: string; employmentStatus: string; courseCount: number }>
```

Phase 3 实现返回 `[]`;Phase 4 切真实查询:`GROUP BY actualTeacherJobNo FROM Course WHERE sectionCode = item.sectionCode AND categorySequenceNo = item.sequenceNo AND outlineVersionId = item.outlineVersionId`。

前端 UI 按 spec §7 要求"不允许因为内容过长把行高撑大",实际授课老师列如果 >0 位老师时:只渲染前 2 位姓名 + `[+N 人]` 徽章,点击弹 `Tooltip`/`Popover` 展示完整名单。

---

## 5. 后端详设 (apps/api)

### 5.1 依赖增补

无新增三方包。`exceljs` / `minio` 已在 Phase 1A 引入。

### 5.2 `modules/course-outlines/` 文件结构

```
course-outlines.module.ts
course-outlines.controller.ts
course-outlines.service.ts            (版本层面 CRUD + isActive 维护)
course-outline-items.service.ts       (item 增删改查 + section 内联创建)
course-outline-import.service.ts      (dry-run / commit / 模板生成)
course-outlines.types.ts
dto/
  create-version.dto.ts
  update-version.dto.ts
  create-item.dto.ts
  update-item.dto.ts
  delete-items.dto.ts
  create-section.dto.ts
  delete-version.dto.ts                (body 带 versionName 二次确认)
  import.dto.ts
```

common 增量:
- `common/course-outline-version/version-name.ts`(§4.1 函数)

### 5.3 HTTP 契约

| 方法 | 路径 | 守卫 | 说明 |
| --- | --- | --- | --- |
| GET | `/course-outlines/versions` | 登录 | 列出所有版本元数据 `{ id, versionName, isActive, itemCount, createdAt }` |
| GET | `/course-outlines/versions/:id` | 登录 | 单版本全量:`{ version, sections, items(含 plannedTeacher 展开, actualTeachers: []) }` |
| POST | `/course-outlines/versions` | `@Roles(SUPER_ADMIN, ADMIN)` | 创建新空白版本;自动设为 isActive |
| DELETE | `/course-outlines/versions/:id` | `@Roles(SUPER_ADMIN, ADMIN)` | body `{ confirmVersionName: string }`;不匹配 400;删除后若是 active 则下一个最新自动顶上 |
| POST | `/course-outlines/versions/:id/items` | `@Roles(SUPER_ADMIN, ADMIN)` | 添加 item;body 可选 `newSection` 内联建板块 |
| PUT | `/course-outlines/items/:itemId` | `@Roles(SUPER_ADMIN, ADMIN)` | 编辑 item |
| DELETE | `/course-outlines/items` | `@Roles(SUPER_ADMIN, ADMIN)` | body `{ ids: string[] }`,批量删 item |
| POST | `/course-outlines/versions/:id/sections` | `@Roles(SUPER_ADMIN, ADMIN)` | (备用)纯新建板块,不添加 item;前端目前走"向大纲添加"内联,该端点 Phase 3 不给 UI 入口 |
| GET | `/course-outlines/template` | `@Roles(SUPER_ADMIN, ADMIN)` | 空白模板 xlsx 二进制 |
| POST | `/course-outlines/versions/:id/import/dry-run` | `@Roles(SUPER_ADMIN, ADMIN)` | body `{ fileKey }` |
| POST | `/course-outlines/versions/:id/import/commit` | `@Roles(SUPER_ADMIN, ADMIN)` | body `{ fileKey }`;**覆盖**本版本 sections + items |

### 5.4 `course-outlines.service.ts` 关键实现

```ts
@Injectable()
export class CourseOutlinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async listVersions(): Promise<VersionListItem[]> {
    const versions = await this.prisma.courseOutlineVersion.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { items: true } } },
    })
    return versions.map(v => ({ id: v.id, versionName: v.versionName, isActive: v.isActive, itemCount: v._count.items, createdAt: v.createdAt }))
  }

  async getVersion(id: string): Promise<VersionDetail> {
    const version = await this.prisma.courseOutlineVersion.findUnique({
      where: { id },
      include: {
        sections: { orderBy: { displayOrder: 'asc' } },
        items: true,
      },
    })
    if (!version) throw new NotFoundException('大纲版本不存在')

    // 计划授课老师 jobNo → 一次性 join 展开
    const teacherJobNos = [...new Set(version.items.map(i => i.plannedTeacherJobNo).filter(Boolean))]
    const teachers = teacherJobNos.length
      ? await this.prisma.employee.findMany({
          where: { jobNo: { in: teacherJobNos as string[] } },
          select: { jobNo: true, name: true, employmentStatus: true },
        })
      : []
    const teacherMap = new Map(teachers.map(t => [t.jobNo, t]))

    const enrichedItems = version.items
      .sort((a, b) => this.sequenceOrder(a.sequenceNo) - this.sequenceOrder(b.sequenceNo))
      .map(item => ({
        ...item,
        plannedTeacher: item.plannedTeacherJobNo ? teacherMap.get(item.plannedTeacherJobNo) ?? null : null,
        actualTeachers: [] as ActualTeacher[],  // Phase 3 占位
      }))

    return { version, sections: version.sections, items: enrichedItems }
  }

  private sequenceOrder(seq: string): number {
    const n = Number(seq)
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER
  }

  async createVersion(operatorId: string): Promise<CourseOutlineVersion> {
    const latest = await this.prisma.courseOutlineVersion.findFirst({ where: { isActive: true } })
    const parsed = latest ? parseVersionName(latest.versionName) : null
    const nextName = computeNextVersionName(parsed, new Date().getFullYear())

    const created = await this.prisma.$transaction(async tx => {
      await tx.courseOutlineVersion.updateMany({ where: { isActive: true }, data: { isActive: false } })
      return tx.courseOutlineVersion.create({ data: { versionName: nextName, isActive: true } })
    })

    await this.auditLogs.record({ operatorId, action: 'create', targetType: 'course_outline_version', targetId: created.id, after: { versionName: created.versionName } })
    return created
  }

  async deleteVersion(id: string, confirmVersionName: string, operatorId: string): Promise<void> {
    const before = await this.prisma.courseOutlineVersion.findUnique({ where: { id } })
    if (!before) throw new NotFoundException('大纲版本不存在')
    if (before.versionName !== confirmVersionName) {
      throw new BadRequestException('版本号确认不匹配')
    }

    await this.prisma.$transaction(async tx => {
      if (before.isActive) {
        const next = await tx.courseOutlineVersion.findFirst({
          where: { id: { not: id } },
          orderBy: { createdAt: 'desc' },
        })
        if (next) await tx.courseOutlineVersion.update({ where: { id: next.id }, data: { isActive: true } })
      }
      await tx.courseOutlineVersion.delete({ where: { id } })  // cascade 清 CourseSection + CourseOutlineItem
    })

    await this.auditLogs.record({ operatorId, action: 'delete', targetType: 'course_outline_version', targetId: id, before: { versionName: before.versionName } })
  }
}
```

### 5.5 `course-outline-items.service.ts`

```ts
async addItem(versionId: string, dto: CreateItemDto, operatorId: string): Promise<CourseOutlineItemDetail> {
  const version = await this.prisma.courseOutlineVersion.findUnique({ where: { id: versionId } })
  if (!version) throw new NotFoundException('大纲版本不存在')

  const created = await this.prisma.$transaction(async tx => {
    // 1. 解析 section:新建 or 选已存在
    let section: CourseSection | null
    if (dto.newSection) {
      // 唯一性:该版本内 code 不冲突
      const conflict = await tx.courseSection.findUnique({ where: { outlineVersionId_code: { outlineVersionId: versionId, code: dto.newSection.code } } })
      if (conflict) throw new ConflictException(`板块代码 ${dto.newSection.code} 在当前大纲版本已存在`)
      section = await tx.courseSection.create({
        data: { outlineVersionId: versionId, code: dto.newSection.code, name: dto.newSection.name, displayOrder: dto.newSection.displayOrder ?? 0 },
      })
    } else {
      section = await tx.courseSection.findUnique({ where: { outlineVersionId_code: { outlineVersionId: versionId, code: dto.sectionCode } } })
      if (!section) throw new BadRequestException('指定板块在当前大纲版本不存在')
    }

    // 2. 创建 item;同版本 (sectionCode, sequenceNo) unique 由 DB 约束保证
    return tx.courseOutlineItem.create({
      data: {
        outlineVersionId: versionId,
        sectionCode: section.code,
        sequenceNo: dto.sequenceNo.padStart(2, '0'),
        secondaryCategoryName: dto.secondaryCategoryName,
        suggestedTeachingType: dto.suggestedTeachingType,
        plannedTeacherJobNo: dto.plannedTeacherJobNo ?? null,
        lessonPlanUrl: dto.lessonPlanUrl ?? null,
      },
    })
  })

  await this.auditLogs.record({ operatorId, action: 'create', targetType: 'course_outline_item', targetId: created.id, after: this.snapshot(created) })
  return this.enrichOne(created)
}

async updateItem(itemId: string, dto: UpdateItemDto, operatorId: string): Promise<CourseOutlineItemDetail> {
  const before = await this.prisma.courseOutlineItem.findUnique({ where: { id: itemId } })
  if (!before) throw new NotFoundException('大纲条目不存在')

  // sectionCode 变更:目标 section 必须在同版本内存在
  if (dto.sectionCode && dto.sectionCode !== before.sectionCode) {
    const target = await this.prisma.courseSection.findUnique({
      where: { outlineVersionId_code: { outlineVersionId: before.outlineVersionId, code: dto.sectionCode } },
    })
    if (!target) throw new BadRequestException('目标板块在当前大纲版本不存在')
  }

  const data = this.buildUpdateData(dto)
  if (Object.keys(data).length === 0) return this.enrichOne(before)

  const after = await this.prisma.courseOutlineItem.update({ where: { id: itemId }, data })
  await this.auditLogs.record({ operatorId, action: 'update', targetType: 'course_outline_item', targetId: itemId, before: this.snapshot(before), after: this.snapshot(after) })
  return this.enrichOne(after)
}

async deleteItems(ids: string[], operatorId: string): Promise<{ deleted: number }> {
  const items = await this.prisma.courseOutlineItem.findMany({ where: { id: { in: ids } } })
  if (items.length === 0) return { deleted: 0 }

  await this.prisma.$transaction(async tx => {
    await tx.courseOutlineItem.deleteMany({ where: { id: { in: ids } } })
    // Phase 3:尚无 Course 数据,不做跨表 update;Phase 4 再补
  })

  for (const item of items) {
    await this.auditLogs.record({ operatorId, action: 'delete', targetType: 'course_outline_item', targetId: item.id, before: this.snapshot(item) })
  }
  return { deleted: items.length }
}
```

### 5.6 `course-outline-import.service.ts`

与 Phase 1A/2 的 import service 同构:`generateTemplate() / dryRun() / commit()`。关键差异:

- `dryRun()` 的错误分类:
  - 必填列缺失(header 级错误)
  - 枚举值非法(建议授课方式不在 `TEACHING_TYPE`)
  - 板块代码/名称不一致(同 code 多次出现对应不同 name)→ error "板块 {code} 名称不一致:{name1} vs {name2}"
  - `(sectionCode, sequenceNo)` 模板内重复
  - plannedTeacherJobNo 无效(员工不存在或已离职)
- `commit()` 事务内:
  ```ts
  await tx.courseOutlineItem.deleteMany({ where: { outlineVersionId: versionId } })
  await tx.courseSection.deleteMany({ where: { outlineVersionId: versionId } })
  await tx.courseSection.createMany({ data: uniqueSections })
  await tx.courseOutlineItem.createMany({ data: items })
  ```
  注意顺序:先删 Item 再删 Section(反向依赖)、先建 Section 再建 Item。
- 返回 `{ createdSections, createdItems, errors: [] }`。
- 不写 per-row AuditLog(几十条 sections + 几百条 items 太吵);只写 1 条 `action: 'import_overwrite'`,`after` 存 `{ sectionCount, itemCount }`。

### 5.7 `course-outlines.controller.ts`

路由与 §5.3 HTTP 契约一一对应;所有写操作 `@Roles(SUPER_ADMIN, ADMIN)`。controller 只做参数解包,业务全转给三个 service。

### 5.8 `app.module.ts` 增量

```ts
imports: [
  ...,
  CourseOutlinesModule,
]
```

`course-outlines.module.ts`:
```ts
@Module({
  imports: [PrismaModule, StorageModule, AuditLogsModule],
  controllers: [CourseOutlinesController],
  providers: [CourseOutlinesService, CourseOutlineItemsService, CourseOutlineImportService],
})
export class CourseOutlinesModule {}
```

### 5.9 配套小改动

- `common/dictionaries.ts`:+ `TEACHING_TYPE`;`STORAGE_FOLDERS` 追加 `course-outlines/import-batches`。
- `common/course-outline-version/version-name.ts`:§4.1 完整实现。
- 无 env 变更。

---

## 6. 前端详设 (apps/web)

### 6.1 依赖增补

无新增三方包。AntD 的 `Select` / `Cascader` / `Modal` / `Drawer` / `Table` / `Card` 全覆盖。

### 6.2 `services/course-outlines.ts`

```ts
export const courseOutlinesApi = {
  listVersions: () => api.get<VersionListItem[]>('/course-outlines/versions'),
  getVersion: (id: string) => api.get<VersionDetail>(`/course-outlines/versions/${id}`),
  createVersion: () => api.post<CourseOutlineVersion>('/course-outlines/versions', {}),
  deleteVersion: (id: string, confirmVersionName: string) =>
    api.delete<void>(`/course-outlines/versions/${id}`, { data: { confirmVersionName } }),
  addItem: (versionId: string, body: CreateItemBody) =>
    api.post<CourseOutlineItemDetail>(`/course-outlines/versions/${versionId}/items`, body),
  updateItem: (itemId: string, body: UpdateItemBody) =>
    api.put<CourseOutlineItemDetail>(`/course-outlines/items/${itemId}`, body),
  deleteItems: (ids: string[]) =>
    api.delete<{ deleted: number }>('/course-outlines/items', { data: { ids } }),
  importDryRun: (versionId: string, fileKey: string) =>
    api.post<ImportReport>(`/course-outlines/versions/${versionId}/import/dry-run`, { fileKey }),
  importCommit: (versionId: string, fileKey: string) =>
    api.post<ImportCommitResult>(`/course-outlines/versions/${versionId}/import/commit`, { fileKey }),
  downloadTemplate: () => downloadAuthed('/course-outlines/template', '课程大纲空白模板.xlsx'),
}
```

### 6.3 `features/course-outlines/` 组件

#### `CourseOutlinePage.tsx`

布局严格按 spec §4:

- 标题 `研录课程大纲` 左上对齐
- 顶部工具条(单行):
  - `OutlineVersionDropdown` 左侧
  - `编辑 / 向大纲添加 / 从大纲删除` 中段按钮组
  - `创建新大纲 / 导入并覆盖 / 删除当前大纲` 右段按钮组
  - 最右 `下载空白大纲模板`(AntD `<Button type="link">`,蓝色文本链接风格,spec §7)
- 主体:若当前版本 `sections.length === 0` → `<Empty description="暂无板块,请点击'向大纲添加'开始创建" />`
- 否则:按 `sections` displayOrder 分组渲染白色 `<Card title="{name} ({code})">`;卡内 `<Table>` 首列复选框;列:序列号、二级课程类别名称、建议授课方式、计划授课老师(展开姓名)、实际授课老师(占位 `-` 或 Tag 列表 + 浮窗)、教案排期(lessonPlanUrl 链接)
- 勾选状态跨板块聚合(一个 `selectedItemIds` state 管所有卡内选择),spec §6.1 按钮联动:
  - 勾 1 条 → 启用"编辑"与"从大纲删除"
  - 勾 ≥2 条 → "编辑"禁用;"从大纲删除"保持启用
- 卡片间上下 `marginBottom: 32px`(spec §7 "上下留白较大")

#### `OutlineVersionDropdown.tsx`

- `<Select>` 宽度 220px,options = listVersions 的结果
- 每条 option 显示 `{versionName}` + 若 isActive 加 `<Tag color="blue">当前</Tag>` 右对齐
- 切换 → 更新路由 query `?v=<versionId>` 并 refetch;保证刷新页面后选择持久

#### `AddOutlineItemModal.tsx`

- `<Modal width={720} title="向大纲添加">`
- 表单字段:
  1. **板块** — `<Select>` 带 dropdownRender 定制:顶部列已有 sections,底部 `<Button type="link" icon={<PlusOutlined />}>+ 新建板块</Button>`
     - 点击"+ 新建板块" → Select 切换成内嵌表单:`板块代码 <Input maxLength={2}>` + `板块名称 <Input>` + `排序 <InputNumber>` + `[取消 / 保存]`
     - 保存后该板块以临时对象形式加入 Select options,并自动选中(真正落库在提交 item 时一起做)
  2. 序列号 `<InputNumber min={1} max={99} formatter={v => String(v).padStart(2, '0')}>`
  3. 二级课程类别名称 `<Input>`
  4. 建议授课方式 `<Select options={TEACHING_TYPE_OPTIONS}>`
  5. 计划授课老师 `<EmployeePicker>`(Phase 2 既有组件,复用)
  6. 教案排期链接 `<Input type="url">`
- 底部 `[取消 / 确定]`
- 提交 → `courseOutlinesApi.addItem(versionId, body)`;若带 newSection 则 body 携 `newSection: { code, name, displayOrder }`

#### `EditOutlineItemModal.tsx`

- 与 AddOutlineItemModal 布局相似但:
  - 板块字段改为纯 `<Select>` 只能选已有板块(不允许内联建新板块),因为"编辑"语义不应扩大副作用
  - 序列号可改,后端 DB unique 约束会阻止冲突
- `mode` 参数支持 `view`/`edit`(但 spec §2 未显式要求 view 态,Phase 3 可仅实现 edit;双击行 = 直接 edit,spec 未限制)

#### `CreateVersionConfirm.tsx`

- AntD `Modal.confirm`,icon `<ExclamationCircleFilled>`
- content:`即将创建新空白大纲;新版本将自动设为当前活跃版本,旧版本会自动退出活跃状态。是否继续?`
- okText `确认创建`,cancelText `取消`
- onOk → `courseOutlinesApi.createVersion()`;成功后 `message.success('已创建 {versionName}')` 并切到新版本

#### `DeleteVersionConfirm.tsx`

- AntD `<Modal>`(不用 confirm,因为要内嵌输入框)
- title 红底标题:`删除当前大纲 - 高风险操作`
- content:
  ```
  即将永久删除版本 {versionName},此动作不可恢复。
  该版本下所有板块与条目将一并删除。
  引用此版本的课程会自动解除版本关联。
  请输入版本号以确认:[Input]
  ```
- 底部按钮:`[取消 / 确认删除(红)]`,确认按钮 `disabled={inputValue !== versionName}`
- 成功 → `message.success('版本已删除')` 并切到下一个活跃版本

#### `DeleteItemsConfirm.tsx`

- AntD `Modal.confirm`
- title:`确认从大纲删除以下条目?`
- content(spec §6.4):
  ```
  即将删除 N 个二级课程类别:
    - {secondaryCategoryName1}
    - {secondaryCategoryName2}
    ...
  若现有课程引用了这些分类,对应课程的分类将在 Phase 4 课程模块落地后变为空值。
  是否继续?
  ```
- okText `确认删除`(danger);onOk → `courseOutlinesApi.deleteItems(selectedIds)`

#### `ImportOverwriteDrawer.tsx`

与 Phase 1A/2 的 ImportDrawer 同构:

1. 下载模板按钮 → `downloadTemplate()`
2. 上传 `<Upload customRequest>` → `uploadToStorage('course-outlines/import-batches', file)` → fileKey → 自动 `importDryRun(versionId, fileKey)`
3. 预校验报告:`<Statistic>` 展示总行数/有效行数/板块数 + 错误表 `<Table>`
4. **警告提示**(spec §6.3):`<Alert type="warning">导入将覆盖当前版本 {versionName} 的全部板块与条目,版本号不变。原有条目将被永久删除。</Alert>`
5. errors 为空 → 启用"确认导入并覆盖" → `importCommit(versionId, fileKey)` → `message.success` → 关闭 + invalidate

#### hooks

- `hooks/useOutlineVersions.ts`:`useQuery({ queryKey: ['outline-versions'], queryFn: listVersions })`
- `hooks/useOutline.ts`:`useQuery({ queryKey: ['outline', versionId], queryFn: () => getVersion(versionId), enabled: !!versionId })`
- `hooks/useOutlineMutations.ts`:聚合 createVersion / deleteVersion / addItem / updateItem / deleteItems / importCommit;统一 `onSettled: () => qc.invalidateQueries(['outline', versionId])` 与 `['outline-versions']`

### 6.4 `router.tsx` 改动

```tsx
{
  path: 'courses',
  element: (
    <RequireAuth>
      <ModulePage
        title="课程管理"
        summary="课程列表将在 Phase 4 开放;当前可进入课程大纲管理页。"
        milestones={["课程大纲已上线", "课程列表/选课待 Phase 4"]}
        specs={["docs/spec/05-Phase4-课程信息与学生选课.md"]}
      />
    </RequireAuth>
  ),
},
{
  path: 'courses/outline',
  element: (
    <RequireAuth>
      <CourseOutlinePage />
    </RequireAuth>
  ),
},
```

`/courses` 现有 ModulePage 文案略改,加一行"[进入课程大纲]"的内链按钮 → `/courses/outline`,过渡期可用。

### 6.5 `constants/dictionaries.ts` 增量

与后端 `common/dictionaries.ts` 同步:`TEACHING_TYPE` + labels + `TEACHING_TYPE_OPTIONS`。
无需镜像 `STORAGE_FOLDERS`(前端 `services/storage.ts` 已用字符串字面量)。

---

## 7. 错误处理与边界

| 场景 | 后端行为 | 前端表现 |
| --- | --- | --- |
| 无任何版本时访问页面 | `listVersions()` 返回 `[]` | 主体渲染 `<Empty>`,工具条除"创建新大纲"外全禁用 |
| 尝试创建已到 `Z` 的版本 | `409 Conflict: 已达 YY 年度版本上限(Z)` | `message.error` 展示后端文案 |
| 内联新建板块与已有 code 冲突 | `409 Conflict: 板块代码 XX 在当前大纲版本已存在` | `message.error` |
| `(sectionCode, sequenceNo)` unique 冲突 | `409 Conflict: 该板块下序列号 NN 已存在` | `message.error`(前端也在 Modal 提交前做本地预查避免) |
| 删除版本时版本号不匹配 | `400 BadRequest: 版本号确认不匹配` | 确认按钮保持禁用 + 错误提示(正常不该走到后端) |
| 导入模板缺列 | dry-run 返回 `errors: [{ row: 0, field: 'header', message: '缺少列:...' }]` | Drawer 顶 Alert + 禁用"确认导入" |
| 导入文件中 plannedTeacherJobNo 已离职 | dry-run error "该员工已离职" | Drawer 标黄 |
| 导入事务中 DB 约束冲突 | 整个事务回滚,返回 500 | `message.error('导入失败,数据未变更')` |
| 已有版本全部被删 | 后续读 `listVersions()` 返回 `[]` | 同"无任何版本"分支 |
| 一般成员调写接口 | `403 Forbidden` | 前端按角色隐藏写按钮,防御式 `message.error('无操作权限')` |

---

## 8. 验收清单(spec §8 映射)

- [ ] `/courses/outline` 未登录 → Phase 0 `RequireAuth` 跳无权限页
- [ ] 首次进入(无版本)→ 主体 Empty;点"创建新大纲" → 弹警告 → 确认 → 生成 `课程大纲-YYA`,自动成为活跃版本
- [ ] 再次创建 → 自动推到 `课程大纲-YYB`;跨年创建 → 自动重置为 `课程大纲-新YYA`
- [ ] 手动切换版本下拉 → 主体内容刷新为对应版本的板块/条目
- [ ] 版本下拉中 active 版本带 `<Tag>当前</Tag>` 标记
- [ ] 添加 item → 可内联新建板块 + 条目同时落库
- [ ] 添加 item 时同板块序列号冲突 → 409 错误弹回
- [ ] 编辑 item → 弹窗预填字段;保存后列表刷新
- [ ] 勾选 1 条启用"编辑";勾选 2+ 条禁用"编辑",保持"从大纲删除"
- [ ] 从大纲删除 → 弹确认,列出将删除的二级课程类别名称;确认后对应行消失
- [ ] 导入并覆盖 → 下载模板填入 sections + items → 上传预校验 → 确认 → 当前版本 sections/items 被完全替换;版本号不变
- [ ] 导入模板列缺失/枚举非法/板块代码名称不一致 → 预校验标行 + 字段 + 消息
- [ ] 删除当前大纲 → 高风险弹窗,输入版本号后才启用确认;删除后若原是 active,下一个 `createdAt DESC` 版本自动顶上
- [ ] AuditLog:创建版本 / 删除版本 / 添加条目 / 编辑条目 / 删除条目 / 导入覆盖 各写对应记录
- [ ] 下载空白大纲模板按钮为蓝色文本链接风格,非按钮

测试以手动执行为准;自动化测试基础设施仍不在本阶段范围内。

---

## 9. 范围边界(明确**不**做)

- 真实 Course 数据(→ Phase 4);"实际授课老师(自动同步)"列 Phase 3 固定 `[]`
- Course 对 CourseOutlineItem 的悬空引用检查(→ Phase 4 删除 item 时再补 Course.sectionCode 清空逻辑)
- 大纲版本间的"对比视图" / "批量合并"(spec 未要求)
- 板块独立 CRUD UI(仅允许通过"向大纲添加"弹窗内联创建;spec §2 未提供独立入口)
- 条目的多选批量编辑(只支持批量删除;spec §6.1 勾选 2+ 条禁用编辑)
- 版本号字母 Z 以后的扩展(溢出抛错,不做 AA/AB)
- 移动端大纲页专门优化(沿用 Phase 0 响应式,板块卡片在窄屏自然堆叠)
- 导入模板的 xlsx 实体文件入 git(每次运行期生成;不落盘到 `res/kcdg.xlsx`)
- 自动化测试基础设施

---

## 10. 变更文件一览

**新增(后端)**:

- `apps/api/src/common/course-outline-version/version-name.ts`
- `apps/api/src/modules/course-outlines/course-outlines.module.ts`
- `apps/api/src/modules/course-outlines/course-outlines.controller.ts`
- `apps/api/src/modules/course-outlines/course-outlines.service.ts`
- `apps/api/src/modules/course-outlines/course-outline-items.service.ts`
- `apps/api/src/modules/course-outlines/course-outline-import.service.ts`
- `apps/api/src/modules/course-outlines/course-outlines.types.ts`
- `apps/api/src/modules/course-outlines/dto/create-version.dto.ts`
- `apps/api/src/modules/course-outlines/dto/delete-version.dto.ts`
- `apps/api/src/modules/course-outlines/dto/create-item.dto.ts`
- `apps/api/src/modules/course-outlines/dto/update-item.dto.ts`
- `apps/api/src/modules/course-outlines/dto/delete-items.dto.ts`
- `apps/api/src/modules/course-outlines/dto/create-section.dto.ts`
- `apps/api/src/modules/course-outlines/dto/import.dto.ts`

**修改(后端)**:

- `apps/api/prisma/schema.prisma`(+ `CourseSection`、`@@unique` + `@@index` 补齐、`CourseOutlineVersion.sections` 反向关系)
- `apps/api/src/app.module.ts`(+ `CourseOutlinesModule`)
- `apps/api/src/common/dictionaries.ts`(+ `TEACHING_TYPE` / `STORAGE_FOLDERS` +1)

**新增(前端)**:

- `apps/web/src/services/course-outlines.ts`
- `apps/web/src/features/course-outlines/CourseOutlinePage.tsx`
- `apps/web/src/features/course-outlines/OutlineVersionDropdown.tsx`
- `apps/web/src/features/course-outlines/AddOutlineItemModal.tsx`
- `apps/web/src/features/course-outlines/EditOutlineItemModal.tsx`
- `apps/web/src/features/course-outlines/CreateVersionConfirm.tsx`
- `apps/web/src/features/course-outlines/DeleteVersionConfirm.tsx`
- `apps/web/src/features/course-outlines/DeleteItemsConfirm.tsx`
- `apps/web/src/features/course-outlines/ImportOverwriteDrawer.tsx`
- `apps/web/src/features/course-outlines/types.ts`
- `apps/web/src/features/course-outlines/hooks/useOutlineVersions.ts`
- `apps/web/src/features/course-outlines/hooks/useOutline.ts`
- `apps/web/src/features/course-outlines/hooks/useOutlineMutations.ts`

**修改(前端)**:

- `apps/web/src/router.tsx`(`/courses/outline` 新子路由;`/courses` ModulePage 文案略改 + 加内链按钮)
- `apps/web/src/constants/dictionaries.ts`(+ `TEACHING_TYPE` 镜像)
- `apps/web/src/styles.css`(板块卡片留白、工具条单行布局补丁,按需)

**不动**:

- `apps/api/src/modules/{courses,payroll,links}/`(仍占位)
- `apps/web/src/features/{auth,employees,students,user-settings,users}/`(Phase 1/2 完整)
- `apps/web/src/components/EmployeePicker.tsx`(Phase 2 既有,直接复用)
- `docker-compose.yml`、任何 env(Phase 3 不引入新外部依赖)

---

## 11. 与后续 Phase 的接口预留

Phase 3 落完后,Phase 4(课程信息与选课)可以直接用:

- `CourseOutlineVersion.isActive = true` 的版本作为新建课程时 `outlineVersionId` 默认值(spec 05 §5 "默认取最新版本")
- `CourseSection(outlineVersionId, code, name)` 作为课程弹窗"课程所属板块"下拉数据源
- `CourseOutlineItem(outlineVersionId, sectionCode, sequenceNo, secondaryCategoryName, suggestedTeachingType)` 作为 Phase 4 新建课程时"二级课程类别"联动数据源(§5 "课程所属板块和二级课程类别联动"、"建议授课方式 从大纲自动带出")
- `actualTeachers` 字段 Phase 4 切真实 groupBy Course.actualTeacherJobNo,大纲页前端零改动
- 删除 item 时的 `Course.sectionCode` 悬空处理:Phase 4 删除 Student 的思路类似,在 `deleteItems` 事务内补一次 `prisma.course.updateMany({ where: { outlineVersionId, sectionCode, categorySequenceNo }, data: { sectionCode: null, categorySequenceNo: null } })`(届时再改 schema 允许 null 或加审计字段)
- `TEACHING_TYPE` 字典 Phase 4 课程详情的"实际授课方式"直接复用
- `EmployeePicker` 组件 Phase 4 "实际授课老师" 选择直接复用,无需新增

Phase 3 不预先建任何 Phase 4+ 的空壳模块/路由/页面,保持 `modules/{courses,payroll,links}/` 占位目录的现状。
