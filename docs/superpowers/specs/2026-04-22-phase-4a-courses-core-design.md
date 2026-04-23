# Phase 4A — 课程信息与学生选课(核心闭环)· 实现设计

> 对应需求:[docs/spec/05-Phase4-课程信息与学生选课.md](../../spec/05-Phase4-课程信息与学生选课.md) §2 除 Excel 导入与高级搜索之外的全部功能
> 上游:[Phase 1A · 员工模块](./2026-04-22-phase-1a-employees-design.md) / [Phase 2 · 学生管理](./2026-04-22-phase-2-students-design.md) / [Phase 3 · 课程大纲](./2026-04-22-phase-3-course-outlines-design.md)
> 姊妹设计(下一迭代):**Phase 4B** — Excel 导入课程 + 独立高级搜索页(强视觉)+ Phase 2/3 延后查询回填

## 1. 范围与决策摘要

Phase 4 整体被拆为两个子阶段:

- **4A(本设计)** — Course CRUD + Enrollment 差集维护 + 课程状态/课时自动计算 + 课时扣减(completion-triggered)+ 课程编号 `TTKKYYNNN` 原子分配 + 选课学生多选弹窗 + 板块/二级类别联动 + 普通搜索
- **4B(下一迭代)** — Excel 导入课程、独立高级搜索页(毛玻璃强视觉)、Phase 2 `Student.relatedOutlineCategories` / `Student.remaining*Credits` 列表自动同步验收、Phase 3 `CourseOutlineItem.actualTeachers` 真实查询、`Course.sectionCode` 悬空清空 + schema 改可空

4A 完成即形成"加课→选学生→填实际时长→扣减学生剩余课时→状态流转"的最小业务闭环,可独立上线验收。

**硬性依赖**:实施顺序必须是 Phase 1 → 2 → 3 → 4A。
- Phase 2 的 `EmployeePicker`(实际授课老师选)、`Student` 模型与 `remaining*Credits` 字段、`SERVICE_PLATFORM` 字典
- Phase 3 的 `CourseOutlineVersion` / `CourseSection` / `CourseOutlineItem`、`TEACHING_TYPE` 字典、`isActive` 版本语义

| # | 决策 | 选择 | 备注 |
| --- | --- | --- | --- |
| Q1 | Phase 4 切分 | 4A 核心闭环 / 4B 运营深度工具 | 单 PR 体量与风险均可控 |
| Q2 | 课时扣减时机 | completion-triggered | `durationMinutes` 填写后才扣 `creditHours × 选课学生` |
| Q3 | 公共/私教桶映射 | 字典驱动 `TEACHING_TYPE_BUCKET` | 默认 公共课→public,其余(1v1/小班课/录播/其他)→private |
| Q4 | `IdSequence` 扩三元组键 | 加 `subKey String @default("")`,主键升 `(kind, year, subKey)` | course 子键为 `TT+KK`(板块代码+2 位类别序号);employee/student 旧调用零改动(subKey="") |
| Q5 | `creditHours` / `status` | 不落表,后端 compute at read | 与 Phase 2 `currentGrade` 同模式;schema 现有两列**删除**(Course 0 行,安全 drop) |
| Q6 | 排序 `plannedAt DESC` 里未排期怎么放 | 未排期(plannedAt NULL)排最末 | SQL `ORDER BY "plannedAt" DESC NULLS LAST` |
| Q7 | 公共与私教 credit 单位 | 统一 `creditHours`(非 minutes) | `Student.remaining*Credits` 已是 `Decimal(8,2)`,语义"课时"(45min/单位),扣减额 = 课时本身 |
| Q8 | 删除课程对学生 credit | 在事务内等价"先改到 duration=NULL(全额退)再 delete" | 只要课程是已完成态,所有选课学生按其 bucket 补回对应 creditHours |
| Q9 | 退选 / 改员学生 | Enrollment diff + credit 反应 | 学生从课程里被移除 + 课程已完成 → 该学生桶 credit 补回;新增学生 + 课程已完成 → 该学生桶扣减 |
| Q10 | 高级搜索 / Excel 导入按钮 | **4A 不渲染**,4B 再引入 | 不留灰按钮占位,避免用户误点;spec §4 的"最右侧高级搜索" 4B 补齐 |
| Q11 | 页面右上角"课程大纲"跳转 | `<Button>` 蓝色 link,跳 `/courses/outline` | spec §4 明确"页面右上角单独放置" |
| Q12 | 选课学生弹窗过滤 | 不按 serviceStatus 强过滤 | 全量学生都可选;已完成/取消服务的学生在选项里附 `<Tag>` 标识,由运营判断 |

---

## 2. 高层架构

```
┌── apps/web ─────────────────────────────────────┐    ┌── apps/api ─────────────────────────────────┐
│ features/courses/                                 │    │ modules/courses/                               │
│   CourseListPage.tsx                              │    │   courses.controller.ts                        │
│     └─ 工具按钮 + 搜索框 + 右上"课程大纲"跳转     │    │   courses.service.ts                           │
│   CourseFormModal.tsx (view/create/edit)          │    │   courses-enrollment.service.ts                │
│     └─ SectionCategoryCascader 板块↔类别联动     │    │   courses-credit.service.ts (核心:reconcile)    │
│     └─ EmployeePicker (Phase 2 既有,复用)        │    │   courses.types.ts                             │
│     └─ StudentPickerModal 打开选课弹窗           │────┤   dto/{create,update,query,enroll}.dto.ts     │
│   StudentPickerModal.tsx (多选 + 搜索)            │    │                                                 │
│   CourseDeleteConfirm.tsx (强提醒)                │    │ common/course/                                │
│   hooks/useCourses.ts / useCourseMutations.ts     │    │   course-status.ts (computeStatus + sort weight)│
│ services/courses.ts                               │────┤   credit-hours.ts (durationMinutes → hours)    │
│ components/EmployeePicker.tsx (Phase 2 既有)     │    │   course-no.ts (format + parse TTKKYYNNN)      │
│ components/SectionCategoryCascader.tsx (新增,    │    │                                                 │
│   跨模块复用候选)                                 │    │ common/dictionaries.ts (+ TEACHING_TYPE_BUCKET)│
│                                                   │    │                                                 │
│ router.tsx: /courses → CourseListPage             │    │ common/id-sequence/                            │
│  (取代 ModulePage;/courses/outline 保持不变)     │    │   id-sequence.service.ts (+ course 方法)        │
│                                                   │    │                                                 │
│                                                   │    │ prisma/schema.prisma:                           │
│                                                   │    │   ~ IdSequence + subKey,PK 升 (kind,year,sub) │
│                                                   │    │   ~ Course - 移除 creditHours / status 字段    │
└───────────────────────────────────────────────────┘    └──────────────────────────────────────────────┘
```

**典型时序**:

```
列表查询:
  web  CourseListPage 挂载
  web  useCourses({ keyword, page }) → api.get('/courses?...')
  api  CoursesController.list → CoursesService.list
       1. Prisma findMany + raw SQL ORDER BY "plannedAt" DESC NULLS LAST
       2. batch join 实际授课老师 / 所属板块名 / 选课学生数 到每条
       3. 对每条 map: status = computeStatus(plannedAt, durationMinutes, now)
                     creditHours = computeCreditHours(durationMinutes)
  web  渲染表格 + 工具按钮联动;右上"课程大纲"按钮跳 /courses/outline

添加课程:
  web  点"添加课程" → CourseFormModal(mode='create')
  web  顶部"来自课程大纲版本"下拉默认 = isActive 版本;切换时 Cascader 刷新
  web  SectionCategoryCascader 二级联动:
         板块:CourseSection (当前选中 outlineVersionId 下)
         二级类别:CourseOutlineItem (当前 outlineVersionId + sectionCode) 过滤
       选中类别 → 自动带出 suggestedTeachingType(只读)
  web  (可选) 点"选择学生" → StudentPickerModal → 返回 studentIds[]
  web  (可选) EmployeePicker 选实际授课老师(excludeResigned=false,允许已离职历史)
  web  提交 → api.post('/courses', body)
  api  CoursesController.create → service.create:
       1. validate DTO (outlineVersionId + sectionCode + categorySequenceNo 必须在 CourseOutlineItem 里存在)
       2. 算 YY = plannedAt?.year ?? 当前年
       3. idSequence.allocate('course', YY, subKey = sectionCode + categorySequenceNo)
       4. courseNo = formatCourseNo({ sectionCode, categorySequenceNo, year: YY, seq })
       5. prisma.$transaction:
          - create Course
          - createMany Enrollments for studentIds
          - reconcileCourseCredits({oldState: empty, newState: current})
            → 若 durationMinutes + actualTeachingType 都填了,按 bucket 扣减每位学生
          - auditLog.record: course create + N 条 enroll
  web  Modal 关闭 + invalidate ['courses']

编辑课程:
  web  勾 1 条 → 编辑 → CourseFormModal(mode='edit') 带预填
  web  修改字段(可含选课学生、durationMinutes、actualTeachingType)
  web  提交 → api.put('/courses/:id', body)
  api  service.update:
       1. 取 before snapshot + beforeEnrollments
       2. prisma.$transaction:
          - 更新 Course
          - 对 Enrollments 做差集:新增的 createMany / 移除的 deleteMany
          - reconcileCourseCredits({oldState: before, newState: after})
          - auditLog: course update field-level diff + enroll add/remove

删除课程:
  web  勾 1 条 → 删除 → CourseDeleteConfirm 强提醒
       "删除课程将同时取消学生选课关系;若该课程已完成,会把扣减的课时补还给学生。是否继续?"
  web  确认 → api.delete('/courses/:id')
  api  service.remove:
       1. 取 before + beforeEnrollments
       2. prisma.$transaction:
          - reconcileCourseCredits({oldState: before, newState: empty})
            → 若已完成,全量补还
          - Course.delete (cascade 清 Enrollments)
          - auditLog: delete course + N 条 unenroll

选课学生弹窗:
  web  CourseFormModal 里的"选择学生"按钮 → 打开 StudentPickerModal
  web  弹窗内 useInfiniteQuery 分页拉 /students;顶部搜索框 debounce 300ms
  web  多选勾;底部"确认选择"返回 studentIds[] 给 CourseFormModal
  web  只读文本框接近整行显示学号+姓名 tag;可点 tag 移除
```

---

## 3. Prisma schema 增量

```prisma
model IdSequence {
  kind      String
  year      Int
  subKey    String   @default("")      // ← 新增:复合子键,employee/student 用 "",course 用 "TT+KK"
  lastSeq   Int      @default(0)
  updatedAt DateTime @updatedAt

  @@id([kind, year, subKey])           // ← 主键改三元组
}

model Course {
  id                 String               @id @default(cuid())
  courseNo           String               @unique
  name               String
  outlineVersionId   String?
  sectionCode        String
  categorySequenceNo String
  plannedAt          DateTime?
  actualTeacherJobNo String?
  actualTeachingType String?
  durationMinutes    Int?
  // creditHours     Decimal?  ← 移除(改为后端 compute at read)
  replayUrl          String?
  videoUrl           String?
  resourceUrl        String?
  note               String?
  // status          String?   ← 移除(改为后端 compute at read)
  createdAt          DateTime             @default(now())
  updatedAt          DateTime             @updatedAt
  outlineVersion     CourseOutlineVersion? @relation(fields: [outlineVersionId], references: [id], onDelete: SetNull)
  enrollments        Enrollment[]

  @@index([plannedAt])                 // ← 新增:列表默认排序
  @@index([sectionCode, categorySequenceNo])  // ← 新增:高搜 / 悬空清空查询
}
```

**变更说明**:

- `IdSequence` 主键从 `(kind, year)` 升 `(kind, year, subKey)`。迁移步骤 `prisma db push` 会分两步:先 `ADD COLUMN "subKey" DEFAULT ''`(已有 employee/student 行自动回填空串),再 `DROP/ADD PRIMARY KEY`;因为每个 `(kind, year)` 老组合在新主键下都带 `subKey=''`,唯一性天然保持,不会丢数据。升级后 employee/student 的 `allocateBatch` 继续以 `subKey=''` 命中原有行,`lastSeq` 从已有值继续递增(不重复发号)。
- `Course` 有 0 行生产数据,可直接 drop `creditHours` 与 `status` 列,无需 backfill。`pnpm prisma:push --accept-data-loss` 处理。
- **`Course.sectionCode` 仍非空**(4A 不改)。4B 会改可空,配合 Phase 3 `CourseOutlineItem.deleteItems` 悬空清空。
- 两个 `@@index`:`plannedAt` 支撑列表默认排序;`(sectionCode, categorySequenceNo)` 支撑 4B 悬空检测 + 任何按板块筛选场景。

---

## 4. 领域约定

### 4.1 课程状态算法 `common/course/course-status.ts`

```ts
export type CourseStatus = '未排期' | '已排期' | '进行中' | '已完成'

export function computeStatus(
  plannedAt: Date | null,
  durationMinutes: number | null,
  now: Date = new Date(),
): CourseStatus {
  if (!plannedAt) return '未排期'
  if (durationMinutes != null) return '已完成'
  return now >= plannedAt ? '进行中' : '已排期'
}

/** 排序权重(越小越靠前)— 当前无 spec 要求按状态排序,但未来高搜可能用到 */
export function statusSortWeight(s: CourseStatus): number {
  switch (s) {
    case '未排期': return 3
    case '已排期': return 0
    case '进行中': return 1
    case '已完成': return 2
  }
}
```

**SQL 端**:spec §4 只要求"按计划授课时间降序",不要求按状态排序,所以列表 SQL 不需要 CASE — 直接 `ORDER BY "plannedAt" DESC NULLS LAST, "courseNo" ASC`(plannedAt 并列按 courseNo 升序稳定排序)。

### 4.2 授课课时算法 `common/course/credit-hours.ts`

```ts
/** spec §10:1 课时 = 45 min,四舍五入保留 2 位 */
export function computeCreditHours(durationMinutes: number | null): number | null {
  if (durationMinutes == null) return null
  return Math.round((durationMinutes / 45) * 100) / 100
}
```

前端镜像 `apps/web/src/utils/credit-hours.ts` 一份同签名实现;**只用于展示**,不用于计算扣减(扣减在后端事务里)。

### 4.3 授课方式桶映射(`common/dictionaries.ts` 增量)

```ts
export type CreditBucket = 'public' | 'private'

/** Phase 4A 默认;运营要改的话调这里一处,service 层零改动 */
export const TEACHING_TYPE_BUCKET: Record<TeachingType, CreditBucket> = {
  公共课: 'public',
  '1v1':  'private',
  小班课: 'private',
  录播:   'private',
  其他:   'private',
}

export function bucketOf(t: string | null | undefined): CreditBucket | null {
  if (!t || !(t in TEACHING_TYPE_BUCKET)) return null
  return TEACHING_TYPE_BUCKET[t as TeachingType]
}
```

### 4.4 课程编号算法 `common/course/course-no.ts`

```ts
const COURSE_NO_RE = /^([A-Z]{2})(\d{2})(\d{2})(\d{3})$/

export function formatCourseNo(input: {
  sectionCode: string         // 2 大写字母,如 'GP'
  categorySequenceNo: string  // 2 位数字字符串,如 '01'
  year: number                // 4 位年份
  seq: number                 // 1..999
}): string {
  if (!/^[A-Z]{2}$/.test(input.sectionCode)) throw new Error(`板块代码格式非法:${input.sectionCode}`)
  if (!/^\d{2}$/.test(input.categorySequenceNo)) throw new Error(`类别序号格式非法:${input.categorySequenceNo}`)
  if (input.seq < 1 || input.seq > 999) throw new Error(`课程序号 ${input.seq} 超出 1-999`)
  const yy = String(input.year).slice(-2).padStart(2, '0')
  return `${input.sectionCode}${input.categorySequenceNo}${yy}${String(input.seq).padStart(3, '0')}`
}

export function parseCourseNo(no: string): { sectionCode: string; categorySequenceNo: string; year: number; seq: number } | null {
  const m = COURSE_NO_RE.exec(no)
  if (!m) return null
  return {
    sectionCode: m[1],
    categorySequenceNo: m[2],
    year: 2000 + Number(m[3]),
    seq: Number(m[4]),
  }
}
```

**IdSequence 扩展**:

```ts
// id-sequence.service.ts 追加
async allocateCourse(sectionCode: string, categorySequenceNo: string, year: number): Promise<number> {
  const [first] = await this.allocateCourseBatch(sectionCode, categorySequenceNo, year, 1)
  return first
}

async allocateCourseBatch(
  sectionCode: string, categorySequenceNo: string, year: number, count: number,
): Promise<number[]> {
  if (count < 1) return []
  const subKey = `${sectionCode}${categorySequenceNo}`
  const rows = await this.prisma.$queryRaw<{ lastSeq: number }[]>(Prisma.sql`
    INSERT INTO "IdSequence" ("kind", "year", "subKey", "lastSeq", "updatedAt")
    VALUES ('course', ${year}, ${subKey}, ${count}, now())
    ON CONFLICT ("kind", "year", "subKey")
    DO UPDATE SET "lastSeq" = "IdSequence"."lastSeq" + ${count}, "updatedAt" = now()
    RETURNING "lastSeq"
  `)
  const lastSeq = Number(rows[0].lastSeq)
  const start = lastSeq - count + 1
  return Array.from({ length: count }, (_, i) => start + i)
}
```

现有 `allocate(kind, year)` / `allocateBatch(kind, year, count)` 调用 raw SQL 时需要在 `INSERT` 的 columns 里加入 `subKey` 并传 `''`,`ON CONFLICT` 也要补 `subKey` — 这是主键升三元组后的联动改动,不是业务逻辑变更。

### 4.5 学生课时扣减 reconcile

核心服务 `courses-credit.service.ts`:

```ts
type CourseState = {
  durationMinutes: number | null
  actualTeachingType: string | null
  enrolledStudentIds: string[]
}

/**
 * 以"旧状态 refund + 新状态 deduct"的方式统一所有变更。
 * 调用方保证 tx 是活跃的 Prisma 事务。
 */
async function reconcileCourseCredits(
  tx: Prisma.TransactionClient,
  oldState: CourseState,
  newState: CourseState,
): Promise<void> {
  // perStudentDelta: studentId → { public: number, private: number } (正数 = 需要扣,负数 = 补回)
  const delta = new Map<string, { public: number; private: number }>()

  const apply = (state: CourseState, sign: 1 | -1) => {
    const bucket = bucketOf(state.actualTeachingType)
    const hours = computeCreditHours(state.durationMinutes)
    if (!bucket || hours == null) return
    for (const sid of state.enrolledStudentIds) {
      const cur = delta.get(sid) ?? { public: 0, private: 0 }
      cur[bucket] += sign * hours
      delta.set(sid, cur)
    }
  }
  apply(oldState, -1)  // refund 旧
  apply(newState, +1)  // deduct 新

  for (const [sid, d] of delta) {
    if (d.public === 0 && d.private === 0) continue
    await tx.student.update({
      where: { id: sid },
      data: {
        ...(d.public   !== 0 && { remainingPublicCredits:  { decrement: d.public  } }),
        ...(d.private  !== 0 && { remainingPrivateCredits: { decrement: d.private } }),
      },
    })
  }
}
```

**重要语义**:
- 扣减可能让 `remaining*Credits` 变成负数。**4A 接受负余额**(业务上可能预先扣超课时,由运营后续调整)。不加 `>= 0` 约束。
- 若 Student 在 `enrolledStudentIds` 里但已不存在(被删)→ `student.update` 抛 `NotFoundError` → 整个事务回滚,UI 收到 500 错误。此场景极边界(需要在同一事务外并发删学生),由 Prisma 事务隔离兜底。
- `decrement` 是 Prisma 的原子 SQL 操作(`SET x = x - $delta`),并发安全。

### 4.6 Enrollment 差集维护

service 层 `courses-enrollment.service.ts`:

```ts
async function syncEnrollments(
  tx: Prisma.TransactionClient,
  courseId: string,
  oldStudentIds: string[],
  newStudentIds: string[],
): Promise<{ added: string[]; removed: string[] }> {
  const oldSet = new Set(oldStudentIds)
  const newSet = new Set(newStudentIds)
  const added   = newStudentIds.filter(id => !oldSet.has(id))
  const removed = oldStudentIds.filter(id => !newSet.has(id))

  if (removed.length > 0) {
    await tx.enrollment.deleteMany({ where: { courseId, studentId: { in: removed } } })
  }
  if (added.length > 0) {
    await tx.enrollment.createMany({
      data: added.map(sid => ({ courseId, studentId: sid })),
      skipDuplicates: true,
    })
  }
  return { added, removed }
}
```

`skipDuplicates` 防御性处理:复合主键 `(studentId, courseId)` 若重复 insert 会报 P2002,`skipDuplicates` 让事务顺利过。

---

## 5. 后端详设 (apps/api)

### 5.1 依赖增补

无新增三方包。现有 `@nestjs/common` / `prisma` / `class-validator` 全够用。

### 5.2 `modules/courses/dto/*`

```ts
// create-course.dto.ts
export class CreateCourseDto {
  @IsString() @MaxLength(200) name!: string
  @IsString() outlineVersionId!: string
  @IsString() @Matches(/^[A-Z]{2}$/) sectionCode!: string
  @IsString() @Matches(/^\d{2}$/) categorySequenceNo!: string
  @IsOptional() @IsDateString() plannedAt?: string
  @IsOptional() @IsString() actualTeacherJobNo?: string
  @IsOptional() @IsIn(TEACHING_TYPE as unknown as string[]) actualTeachingType?: TeachingType
  @IsOptional() @IsInt() @Min(0) durationMinutes?: number
  @IsOptional() @IsUrl() replayUrl?: string
  @IsOptional() @IsUrl() videoUrl?: string
  @IsOptional() @IsUrl() resourceUrl?: string
  @IsOptional() @IsString() @MaxLength(5000) note?: string
  @IsArray() @IsString({ each: true }) @ArrayUnique() studentIds!: string[]  // 允许 []
}

// update-course.dto.ts:同 create 但所有字段 @IsOptional;
//   sectionCode / categorySequenceNo / outlineVersionId 允许改动但 courseNo 不随之重算(保持 courseNo 稳定)
// query-courses.dto.ts:{ keyword?, page?, pageSize?, status? }
```

**关键规则**:
- `courseNo` 不在 DTO 里接收(自动生成)
- `categorySequenceNo` 输入 `"01"`/`"02"`,DB 存同样字符串
- 板块/类别/大纲版本一致性校验在 service 层(DTO 只做格式)

### 5.3 `courses.service.ts` 关键实现

```ts
@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idSequence: IdSequenceService,
    private readonly enroll: CoursesEnrollmentService,
    private readonly credit: CoursesCreditService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async list(query: QueryCoursesDto): Promise<CourseListResponse> { /* §5.4 */ }
  async findOne(id: string): Promise<CourseDetail> { /* §5.4 */ }
  async create(dto: CreateCourseDto, operatorId: string): Promise<CourseDetail> {
    // 1. 校验 outlineVersionId + sectionCode + categorySequenceNo 存在性
    const item = await this.prisma.courseOutlineItem.findUnique({
      where: {
        outlineVersionId_sectionCode_sequenceNo: {
          outlineVersionId: dto.outlineVersionId,
          sectionCode: dto.sectionCode,
          sequenceNo: dto.categorySequenceNo,
        },
      },
    })
    if (!item) throw new BadRequestException('指定板块/类别/大纲版本组合不存在')

    // 2. 算 YY
    const year = dto.plannedAt ? new Date(dto.plannedAt).getFullYear() : new Date().getFullYear()
    const seq = await this.idSequence.allocateCourse(dto.sectionCode, dto.categorySequenceNo, year)
    const courseNo = formatCourseNo({ ...dto, year, seq })

    // 3. 事务:create Course + createMany Enrollments + reconcile + audit
    const created = await this.prisma.$transaction(async tx => {
      const course = await tx.course.create({
        data: {
          courseNo,
          name: dto.name,
          outlineVersionId: dto.outlineVersionId,
          sectionCode: dto.sectionCode,
          categorySequenceNo: dto.categorySequenceNo,
          plannedAt: dto.plannedAt ? new Date(dto.plannedAt) : null,
          actualTeacherJobNo: dto.actualTeacherJobNo ?? null,
          actualTeachingType: dto.actualTeachingType ?? null,
          durationMinutes: dto.durationMinutes ?? null,
          replayUrl: dto.replayUrl ?? null,
          videoUrl: dto.videoUrl ?? null,
          resourceUrl: dto.resourceUrl ?? null,
          note: dto.note ?? null,
        },
      })

      const { added } = await this.enroll.syncEnrollments(tx, course.id, [], dto.studentIds)

      await this.credit.reconcileCourseCredits(tx,
        { durationMinutes: null, actualTeachingType: null, enrolledStudentIds: [] },
        { durationMinutes: course.durationMinutes, actualTeachingType: course.actualTeachingType, enrolledStudentIds: added },
      )

      return course
    })

    await this.auditLogs.record({ operatorId, action: 'create', targetType: 'course', targetId: created.id, after: this.snapshot(created, dto.studentIds) })
    return this.enrichOne(created)
  }

  async update(id: string, dto: UpdateCourseDto, operatorId: string): Promise<CourseDetail> { /* 对称 create,取 before/newState 调 reconcile */ }
  async remove(id: string, operatorId: string): Promise<void> { /* 等价 newState=empty reconcile + delete */ }
}
```

### 5.4 `list()` 与排序

```ts
async list(query: QueryCoursesDto): Promise<CourseListResponse> {
  const page = query.page ?? 1
  const pageSize = query.pageSize ?? 50
  const skip = (page - 1) * pageSize

  const where: Prisma.CourseWhereInput = {}
  if (query.keyword?.trim()) {
    const k = query.keyword.trim()
    where.OR = [
      { courseNo: { contains: k, mode: 'insensitive' } },
      { name:     { contains: k, mode: 'insensitive' } },
      { actualTeacherJobNo: { contains: k, mode: 'insensitive' } },
    ]
  }

  const [courses, total] = await this.prisma.$transaction([
    this.prisma.course.findMany({
      where, skip, take: pageSize,
      orderBy: [{ plannedAt: { sort: 'desc', nulls: 'last' } }, { courseNo: 'asc' }],
    }),
    this.prisma.course.count({ where }),
  ])

  const items = await this.enrichWithDerivedFields(courses)
  return { items, total, page, pageSize }
}

private async enrichWithDerivedFields(courses: Course[]): Promise<CourseListItem[]> {
  // 1. 批量查老师名
  const teacherJobNos = [...new Set(courses.map(c => c.actualTeacherJobNo).filter(Boolean) as string[])]
  const teachers = teacherJobNos.length
    ? await this.prisma.employee.findMany({ where: { jobNo: { in: teacherJobNos } }, select: { jobNo: true, name: true, employmentStatus: true } })
    : []
  const teacherMap = new Map(teachers.map(t => [t.jobNo, t]))

  // 2. 批量查板块名(从 CourseSection join outlineVersionId + sectionCode)
  const sectionKeys = courses
    .filter(c => c.outlineVersionId)
    .map(c => `${c.outlineVersionId}::${c.sectionCode}`)
  const sections = sectionKeys.length
    ? await this.prisma.courseSection.findMany({
        where: { OR: courses.filter(c => c.outlineVersionId).map(c => ({ outlineVersionId: c.outlineVersionId!, code: c.sectionCode })) },
        select: { outlineVersionId: true, code: true, name: true },
      })
    : []
  const sectionMap = new Map(sections.map(s => [`${s.outlineVersionId}::${s.code}`, s.name]))

  // 3. 批量查选课人数(groupBy Enrollment)
  const counts = courses.length
    ? await this.prisma.enrollment.groupBy({
        by: ['courseId'],
        where: { courseId: { in: courses.map(c => c.id) } },
        _count: true,
      })
    : []
  const countMap = new Map(counts.map(c => [c.courseId, c._count]))

  const now = new Date()
  return courses.map(c => ({
    ...c,
    status: computeStatus(c.plannedAt, c.durationMinutes, now),
    creditHours: computeCreditHours(c.durationMinutes),
    actualTeacher: c.actualTeacherJobNo ? teacherMap.get(c.actualTeacherJobNo) ?? null : null,
    sectionName: c.outlineVersionId ? sectionMap.get(`${c.outlineVersionId}::${c.sectionCode}`) ?? null : null,
    enrolledCount: countMap.get(c.id) ?? 0,
  }))
}
```

`findOne()` 调 `enrichWithDerivedFields` 单条 + 另拉完整 `enrolledStudents: Student[]` (简化形:只返回 id+name+studentNo)。

### 5.5 HTTP 契约

| 方法 | 路径 | 守卫 | 说明 |
| --- | --- | --- | --- |
| GET | `/courses` | 登录 | `keyword?/page?/pageSize?` |
| GET | `/courses/:id` | 登录 | 含 enrolledStudents 列表 |
| POST | `/courses` | `@Roles(SUPER_ADMIN, ADMIN)` | `CreateCourseDto` |
| PUT | `/courses/:id` | `@Roles(SUPER_ADMIN, ADMIN)` | `UpdateCourseDto` |
| DELETE | `/courses/:id` | `@Roles(SUPER_ADMIN, ADMIN)` | 204 |

**注意**:4A 不开 `/courses/search`(高搜 POST 路径)与 `/courses/import/*`(Excel),这些在 4B。

### 5.6 `app.module.ts` + 模块装配

```ts
imports: [
  ...,
  CoursesModule,
]
```

```ts
// courses.module.ts
@Module({
  imports: [PrismaModule, IdSequenceModule, AuditLogsModule],
  controllers: [CoursesController],
  providers: [CoursesService, CoursesEnrollmentService, CoursesCreditService],
})
export class CoursesModule {}
```

### 5.7 `students/students.service.ts` 与 `course-outlines/*.service.ts` 影响

4A 不动它们的业务逻辑,只读使用。

**唯一轻量改动**:`students.service.ts` 里 `StudentDetail` 已承诺返回 `relatedOutlineCategories: string[]`;Phase 2 固定 `[]`,4A 依然保持 `[]`(真实查询在 4B 实施,理由:不想给 4A 再多加一个跨模块 groupBy)。

---

## 6. 前端详设 (apps/web)

### 6.1 依赖增补

无新增三方包。

### 6.2 `services/courses.ts`

```ts
export const coursesApi = {
  list:   (p: CourseQueryParams = {}) => api.get<CourseListResponse>(`/courses${toQuery(p)}`),
  detail: (id: string) => api.get<CourseDetail>(`/courses/${id}`),
  create: (body: CreateCourseBody) => api.post<CourseDetail>('/courses', body),
  update: (id: string, body: UpdateCourseBody) => api.put<CourseDetail>(`/courses/${id}`, body),
  remove: (id: string) => api.delete<void>(`/courses/${id}`),
}
```

### 6.3 `features/courses/`

#### `CourseListPage.tsx`

spec §4 布局:

- 标题 `学生选课与课程信息管理` 左上对齐
- 右上角 `<Button type="link">课程大纲</Button>` → `navigate('/courses/outline')`
- 工具条(左 → 中 → 右):
  - `查看课程信息 / 编辑课程信息 / 添加课程 / 删除课程`(view/edit/delete 依 spec §6.1 联动)
  - ~~`从 Excel 导入`~~(4A 不渲染)
  - `<Input.Search placeholder="搜索 课程编号 / 课程名 / 老师工号">` 280px
  - ~~`高级搜索` 按钮~~(4A 不渲染)
- `<Table>` 列:课程编号、课程名称、所属板块(`sectionName`)、计划授课时间(formatted)、课程状态(Tag 带色)、授课方式(`actualTeachingType`,未填"—")、实际授课老师(`actualTeacher?.name`,离职显示红 Tag)
- `rowSelection`,`pageSize: 50`
- 按钮联动:查看/编辑/删除单选才启用,≥2 条禁用查看/编辑,删除保留

颜色映射:
```ts
const STATUS_TAG_COLOR: Record<CourseStatus, string> = {
  未排期: 'default',
  已排期: 'blue',
  进行中: 'gold',
  已完成: 'green',
}
```

#### `CourseFormModal.tsx`

- `<Modal width={1040}>` 双列表单 + 内部滚动
- 顶部单行:`来自课程大纲版本 <Select>` 默认选 `isActive=true` 版本;切换会清空 `sectionCode` + `categorySequenceNo`(Cascader 数据源变更)
- 字段按 spec §5 双列:
  - 课程编号(只读,"自动计算/保存后生成" 或实际值)
  - 课程名称 `<Input>`
  - 课程所属板块 + 二级课程类别 `<SectionCategoryCascader>`(一个组件两级联动;详见 §6.4)
  - 计划授课时间 `<DatePicker showTime>`
  - 实际授课方式 `<Select options={TEACHING_TYPE_OPTIONS}>`
  - 建议授课方式 `<Input disabled value={suggestedFromOutline}>`(从选中 OutlineItem 自动带出)
  - 实际授课老师 `<EmployeePicker>`;已离职老师若是课程历史值,通过 Phase 2 定义的 `historicalEmployee` prop 保留展示(下拉本身仍不可新选已离职),这点与学生的学管/规划师语义一致
  - 授课时长 `<InputNumber min={0} suffix="min">`
  - 授课课时(只读)`<Input disabled value={creditHours ?? '—'}>`
  - 课程状态(只读)`<Tag color={STATUS_TAG_COLOR[status]}>{status}</Tag>`
  - 回放/视频/资源链接 3 个 `<Input>`
  - 备注 `<Input.TextArea rows={4}>`
- 选课学生区(单独一行,整行宽):
  - 左侧只读文本框:展示 tag 列表 `<Tag closable>{studentNo} {name}</Tag>`,可点 × 移除
  - 右侧 `<Button>选择学生</Button>` → 打开 StudentPickerModal
- 底部按钮(沿用 Phase 1A §5.2 规则):view 态 `[取消 / 编辑]`,edit/create `[取消 / 确定]`

#### `SectionCategoryCascader.tsx`(新增,放 `apps/web/src/components/`)

一个通用组件,两级级联:

```tsx
type Props = {
  outlineVersionId: string | null
  value: { sectionCode: string; categorySequenceNo: string } | null
  onChange: (v: { sectionCode: string; categorySequenceNo: string; item: CourseOutlineItem } | null) => void
  disabled?: boolean
}
```

- 内部 `useOutline(outlineVersionId)` 拉全部 sections + items
- `<Cascader>` options:
  - 一级 `<CourseSection>`:`{ value: code, label: `${name} (${code})` }`
  - 二级 `<CourseOutlineItem>`:`{ value: sequenceNo, label: `${sequenceNo} - ${secondaryCategoryName}` }`
- onChange 回调 item 对象,方便父组件读 `suggestedTeachingType` 自动填"建议授课方式"
- 放 `components/`,因为 Phase 4B Excel 导入的"列校验回显"或未来其他地方(薪酬)都可能复用

#### `StudentPickerModal.tsx`

spec §6:

- `<Modal title="选择学生" width={720}>`
- 顶部 `<Input.Search>` debounce 300ms
- 中部 `<Table rowSelection>`:学号 / 姓名 / 年级 / 服务平台 / 服务状态(已完成/取消等的学生带 `<Tag>`)
- 使用 `useInfiniteQuery` 或简化为 `useQuery` 分页 30 条/页,pagination 底部
- 右下角 `[取消 / 确认选择]`
- `onOk` 回调传 `studentIds: string[]` 给 parent,parent 把 tag 列表更新

不强制过滤 serviceStatus(Q12 决策)。

#### `CourseDeleteConfirm.tsx`

AntD `Modal.confirm`:

- title:`确认删除课程 {courseNo} {name}?`
- content:
  > 删除课程将同时取消所有学生的选课关系。
  > 若该课程已完成,扣减的课时将按现在的 `bucket` 自动补回给学生。
  > 此操作不可恢复,是否继续?
- okText `确认删除`,okButtonProps `{ danger: true }`

#### hooks

- `hooks/useCourses.ts`:`useQuery({ queryKey: ['courses', params], queryFn: coursesApi.list, keepPreviousData: true })`
- `hooks/useCourseMutations.ts`:`useMutation` 包装 create/update/remove;`onSettled` invalidate `['courses']` + `['students']`(因为 credit 可能变)

### 6.4 `router.tsx` 改动

```tsx
// 替换 Phase 3 临时占位:
{
  path: 'courses',
  element: (
    <RequireAuth>
      <CourseListPage />   // ← 取代 ModulePage
    </RequireAuth>
  ),
},
{
  path: 'courses/outline',
  element: (
    <RequireAuth>
      <CourseOutlinePage />  // Phase 3 已有
    </RequireAuth>
  ),
},
```

`/courses` 的 ModulePage 文案 + 内链按钮(Phase 3 设计里加的过渡按钮)随本阶段删除。

### 6.5 `constants/dictionaries.ts` 增量

```ts
export const TEACHING_TYPE_BUCKET: Record<TeachingType, 'public' | 'private'> = {
  公共课: 'public',
  '1v1':  'private',
  小班课: 'private',
  录播:   'private',
  其他:   'private',
}
```

---

## 7. 错误处理与边界

| 场景 | 后端行为 | 前端表现 |
| --- | --- | --- |
| 板块/类别/大纲版本组合不存在 | `400 BadRequest: 指定板块/类别/大纲版本组合不存在` | `message.error` 展示后端文案 |
| 课程序号溢出 999 | `Error: 课程序号 N 超出 1-999` → 500 | `message.error('课程序号已耗尽,请调整板块/类别或年份')` |
| 选课学生不存在 | `prisma.student.update` 在 reconcile 里抛 NotFoundError,事务回滚 | `message.error('部分学生已被删除,请刷新后重试')` |
| 实际授课老师工号不存在 | DTO 层不校验(与 Phase 2 counselor/planner 同策略) | 展示时 actualTeacher = null,即显示"—"或工号字面 |
| `actualTeachingType` 不在字典 | DTO `@IsIn(TEACHING_TYPE)` 挡住 | Form 红字段 |
| 删除课程时 Enrollment cascade 触发 | schema `onDelete: Cascade`,自动清 | reconcile 先执行补还 credit |
| `remaining*Credits` 扣成负值 | 接受,不阻塞(Q7 决策) | 学生详情里展示负余额,运营可人工调 |
| Enrollment 重复创建(极边界) | `skipDuplicates: true` 防御 | — |
| 一般成员调写接口 | 403 Forbidden | 前端按角色隐藏写按钮 |
| 并发两个请求同时编辑同一课程 | 两个事务按顺序执行,后到的基于最新 before 状态 reconcile | UI 默认只有 TanStack Query 的 invalidate,不做乐观冲突提示 |

---

## 8. 验收清单(spec §11 4A 部分映射)

- [ ] `/courses` 未登录 → `RequireAuth` 跳无权限页
- [ ] 登录 → `/courses` 渲染列表 + 工具按钮 + 搜索框 + 右上"课程大纲"跳转按钮
- [ ] 点右上"课程大纲" → 跳 `/courses/outline`(Phase 3 页面)
- [ ] 按钮联动:未勾选禁用查看/编辑/删除;勾 1 条启用全部;勾 ≥2 条禁用查看/编辑,删除保留
- [ ] 添加课程弹窗:顶部默认选中 isActive 版本
- [ ] 板块/二级类别 Cascader 联动:板块变 → 类别 options 刷新
- [ ] 选中类别 → "建议授课方式" 自动带出,只读
- [ ] 提交后课程编号符合 `TTKKYYNNN`(例:`GP012600 1`);同 `TT+KK+YY` 再添得到 `...002`
- [ ] 删除 `...002` 后再添 → `...003`,**不**回收
- [ ] "选择学生"弹窗:搜索 / 多选 / 确认 → tag 列表显示所选学生
- [ ] tag 点 × → 从列表移除;若课程已完成,保存后该学生 credit 补回
- [ ] **场景 A**:duration=90 + type=公共课 + 选 3 学生 → 保存后 3 学生各 `remainingPublicCredits -= 2`(因为 90/45=2)
- [ ] **场景 B**(承接 A):改 duration=45(保留 公共课)→ reconcile delta = `(45/45 - 90/45) = -1`,每位学生 `remainingPublicCredits += 1`,净扣减回到 1
- [ ] **场景 C**(承接 B):改 type=1v1(保留 duration=45)→ 3 学生 `remainingPublicCredits += 1`(全额退旧桶),`remainingPrivateCredits -= 1`(新桶扣减)
- [ ] 列表按 `plannedAt DESC NULLS LAST` 排序;未排期排最末
- [ ] 列表"课程状态"按算法显示,颜色按字典
- [ ] 删除课程强提醒后才删;已完成课程删除时所有学生 credit 补还
- [ ] AuditLog:创建/编辑/删除 Course 各对应;Enrollment add/remove 各写 1 条

手动测试为准;自动化测试基础设施仍不在本阶段范围内。

---

## 9. 范围边界(明确 4A **不**做)

- Excel 导入课程(→ 4B)
- 独立高级搜索页(毛玻璃强视觉、动态条件)(→ 4B)
- Phase 2 `Student.relatedOutlineCategories` 真实 groupBy(→ 4B;4A 保持 `[]`)
- Phase 3 `CourseOutlineItem.actualTeachers` 真实 groupBy(→ 4B;4A 保持 `[]`)
- `Course.sectionCode` 改可空 + Phase 3 delete-item 悬空清空联动(→ 4B)
- 课程序号溢出 999 后的扩位策略(→ 4B 评估;4A 抛错)
- 学生 remaining 余额不得为负的硬约束(4A 接受负值)
- 课程"查看态"模式下选课学生编辑(沿用 Phase 1A:view 态字段全 disabled)
- 移动端课程表单专门优化(沿用 Phase 0 响应式)
- 自动化测试基础设施

---

## 10. 变更文件一览

**新增(后端)**:

- `apps/api/src/common/course/course-status.ts`
- `apps/api/src/common/course/credit-hours.ts`
- `apps/api/src/common/course/course-no.ts`
- `apps/api/src/modules/courses/courses.module.ts`
- `apps/api/src/modules/courses/courses.controller.ts`
- `apps/api/src/modules/courses/courses.service.ts`
- `apps/api/src/modules/courses/courses-enrollment.service.ts`
- `apps/api/src/modules/courses/courses-credit.service.ts`
- `apps/api/src/modules/courses/courses.types.ts`
- `apps/api/src/modules/courses/dto/create-course.dto.ts`
- `apps/api/src/modules/courses/dto/update-course.dto.ts`
- `apps/api/src/modules/courses/dto/query-courses.dto.ts`

**修改(后端)**:

- `apps/api/prisma/schema.prisma`(`IdSequence` + `subKey`,PK 升三元组;`Course` 删 `creditHours` / `status`;+ 两个 `@@index`)
- `apps/api/src/app.module.ts`(+ `CoursesModule`)
- `apps/api/src/common/dictionaries.ts`(+ `TEACHING_TYPE_BUCKET` / `bucketOf`)
- `apps/api/src/common/id-sequence/id-sequence.service.ts`(补 `subKey` 到现有 raw SQL + 新增 `allocateCourse` / `allocateCourseBatch`)

**新增(前端)**:

- `apps/web/src/services/courses.ts`
- `apps/web/src/utils/credit-hours.ts`
- `apps/web/src/utils/course-status.ts`
- `apps/web/src/components/SectionCategoryCascader.tsx`
- `apps/web/src/features/courses/CourseListPage.tsx`
- `apps/web/src/features/courses/CourseFormModal.tsx`
- `apps/web/src/features/courses/CourseDeleteConfirm.tsx`
- `apps/web/src/features/courses/StudentPickerModal.tsx`
- `apps/web/src/features/courses/types.ts`
- `apps/web/src/features/courses/hooks/useCourses.ts`
- `apps/web/src/features/courses/hooks/useCourseMutations.ts`

**修改(前端)**:

- `apps/web/src/router.tsx`(`/courses` ModulePage → `CourseListPage`)
- `apps/web/src/constants/dictionaries.ts`(+ `TEACHING_TYPE_BUCKET`)
- `apps/web/src/styles.css`(选课学生 tag 容器样式、CourseFormModal 内滚动补丁,按需)

**不动**:

- `apps/api/src/modules/{students,course-outlines,payroll,links}/` 的业务逻辑(students 的 `relatedOutlineCategories` 仍 `[]`,course-outlines 的 `actualTeachers` 仍 `[]`)
- `apps/web/src/features/{auth,employees,students,course-outlines,user-settings,users}/`
- `apps/web/src/components/EmployeePicker.tsx`(Phase 2 既有,直接复用)
- `docker-compose.yml`、任何 env

---

## 11. 与 4B 和 Phase 5 的接口预留

4A 落完后,4B 可直接接上:

- `CoursesService.list()` 已经支持 `keyword` 普通搜索 — 4B 高搜只需在 controller 加 `POST /courses/search`,body 带多字段 AND 组合,复用 `enrichWithDerivedFields()`
- `CoursesEnrollmentService` / `CoursesCreditService` 事务化原子 reconcile 已封装 — 4B Excel 导入课程时每行走一次 `create()` 或批量走同样的 reconcile,直接复用
- `StudentPickerModal` 是独立组件,4B 高搜"上课学生"筛选可复用
- `SectionCategoryCascader` 是跨模块组件,4B 高搜"课程所属板块"筛选也复用
- 课程状态 / 课时 / bucket 映射的所有算法都在 `common/course/*` 与 `common/dictionaries.ts`,4B 直接 import

4A 完成后,Phase 5(薪酬)开工时可直接用:

- `Course.actualTeacherJobNo` + `computeCreditHours(durationMinutes)` 作为"老师课时汇总"的直接数据源
- `CoursesService.list` 的过滤参数可扩 `actualTeacherJobNo` / 时间范围 → 直接给薪酬结算页提供候选课程

4A 不预先建任何 4B / Phase 5 的空壳模块/路由/页面,保持 `modules/payroll/links/` 占位目录的现状。
