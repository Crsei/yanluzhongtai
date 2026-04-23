# Phase 4B — 课程高级工具与跨 Phase 收尾 · 实现设计

> 对应需求:[docs/spec/05-Phase4-课程信息与学生选课.md](../../spec/05-Phase4-课程信息与学生选课.md) §2 的 Excel 导入 + §7 高级搜索页
> 上游:[Phase 4A · 课程核心闭环](./2026-04-22-phase-4a-courses-core-design.md)
> 本 Phase 同时完成 Phase 2/3 延后项的查询回填与 schema 收尾

## 1. 范围与决策摘要

Phase 4B 是 4A 的运营深度扩展,4 块独立工作:

1. **Excel 导入课程** — 与 Phase 1A/2 import 同构,复用 4A 的 `syncEnrollments` + `reconcileCourseCredits` 管道
2. **独立高级搜索页 `/courses/advanced-search`** — 一体页 + 毛玻璃强视觉筛选面板 + 同页结果展示(spec §7)
3. **跨 Phase 查询回填**:
   - `Student.relatedOutlineCategories` Phase 2 起占位 `[]`,4B 切真实 GROUP BY
   - `CourseOutlineItem.actualTeachers` Phase 3 起占位 `[]`,4B 切真实 GROUP BY
4. **Schema 收尾** — `Course.sectionCode` + `categorySequenceNo` 改可空,Phase 3 `deleteItems` 同事务补 `updateMany` 悬空清空

**硬性依赖**:Phase 4A 必须先上线(本 Phase 复用 `CoursesService.list()` 的 `enrichWithDerivedFields`、`CoursesEnrollmentService`、`CoursesCreditService`、`SectionCategoryCascader`、`StudentPickerModal`、`EmployeePicker`)。

| # | 决策 | 选择 | 备注 |
| --- | --- | --- | --- |
| Q1 | 高级搜索结果展示 | 一体页:筛选 + 结果同页 | `/courses/advanced-search`,URL `?q=...` 同步筛选,可分享 |
| Q2 | "动态增加查询条件" | 同字段多实例 OR,跨字段 AND | 每字段右侧 `[+]`/`[×]` 管理多个输入值 |
| Q3 | 高搜 HTTP 方法 | `POST /courses/search` | 6 字段多值 body 放不下 query string |
| Q4 | `Course.sectionCode` 可空 | 是 | 配合 Phase 3 `deleteItems` 悬空清空;现有数据全非空,`db push` 零风险 |
| Q5 | Phase 3 `deleteItems` 联动 | 事务内加 `Course.updateMany` SET null | 与原本 `courseOutlineItem.deleteMany` 同事务;跨 service 调用 |
| Q6 | `relatedOutlineCategories` 口径 | 学生所有 Enrollment 对应的 `secondaryCategoryName` 去重 | 不限课程状态;spec "已上" 作广义解读 |
| Q7 | `actualTeachers` 口径 | 该 outline item 所有对应 Course 的 `actualTeacherJobNo` GROUP BY | 不限状态;返回 `{ jobNo, name, employmentStatus, courseCount }[]` |
| Q8 | "所属清单内课程名称" 字段解读 | `CourseOutlineItem.secondaryCategoryName` ILIKE 匹配 | 不是 `course.name`(那个是独立的"课程名称"字段) |
| Q9 | Excel 导入列顺序 | 12 列(见 §4.3),不含 courseNo | 选课学生用 `学号1;学号2;...` 分号拼 |
| Q10 | Excel 导入的 reconcile | 逐课 commit 即逐课跑 `reconcileCourseCredits` | 每条课程独立事务,失败行 rollback 不影响其余行(dry-run 无错时 commit 全成功) |
| Q11 | 高搜毛玻璃视觉技术 | CSS `backdrop-filter: blur` + 渐层 `linear-gradient` | 局部 CSS 写在 `AdvancedSearchPage.module.css` 或内联,不污染 AntD token |
| Q12 | 筛选条件 URL 序列化 | `q` 参数里 base64(JSON) | 避免嵌套数组 URL 编码爆炸 |

---

## 2. 高层架构

```
┌── apps/web ─────────────────────────────────────┐    ┌── apps/api ─────────────────────────────────┐
│ features/courses/                                 │    │ modules/courses/                               │
│   CourseListPage.tsx  ←  右上"高级搜索"按钮上架    │    │   courses.controller.ts ← + /search + /import  │
│                          "从 Excel 导入"按钮上架   │    │   courses.service.ts    ← + search()           │
│   AdvancedSearchPage.tsx (新;毛玻璃面板 + 结果表) │    │   courses-import.service.ts (新)               │
│     └─ AdvancedSearchPanel.tsx                    │    │   dto/search-courses.dto.ts (新)               │
│     └─ CourseTable.tsx (从 CourseListPage 抽出)    │────┤   dto/import.dto.ts (新)                       │
│   CourseImportDrawer.tsx (新)                     │    │                                                 │
│ services/courses.ts  ← + search / import          │    │ modules/students/                             │
│                                                   │    │   students.service.ts                          │
│ utils/advanced-search-serializer.ts (新)          │────┤     ~ enrichRelatedOutlineCategories() 真实查询│
│                                                   │    │                                                 │
│ router.tsx: + /courses/advanced-search            │    │ modules/course-outlines/                      │
│                                                   │    │   course-outlines.service.ts                   │
│                                                   │    │     ~ enrichActualTeachers() 真实查询          │
│                                                   │    │   course-outline-items.service.ts              │
│                                                   │    │     ~ deleteItems() + Course 悬空清空事务      │
│                                                   │    │                                                 │
│                                                   │    │ prisma/schema.prisma:                           │
│                                                   │    │   ~ Course.sectionCode:         String → String?│
│                                                   │    │   ~ Course.categorySequenceNo:  String → String?│
└───────────────────────────────────────────────────┘    └──────────────────────────────────────────────┘
```

**典型时序**:

```
高级搜索 - 一体页:
  web  /courses 页右上 "高级搜索" 按钮 → 路由跳 /courses/advanced-search
  web  AdvancedSearchPage 挂载:解析 URL q → 反序列化成 panelState
  web  AdvancedSearchPanel 渲染 6 字段 + 每字段的多个实例输入
  web  用户点"查询" → 打包 filters → courseApi.search(filters)
  web  CourseTable 渲染结果 + 分页
  web  URL 更新为 /courses/advanced-search?q=base64(JSON)
  api  CoursesController.search → service.search(dto):
       1. 构造 WhereInput:每字段内部值 OR(IN/contains),字段间 AND
       2. 复用 4A 的 buildOrderBy / enrichWithDerivedFields
       3. 返回 { items, total, page, pageSize }

Excel 导入课程:
  web  CourseImportDrawer(与 EmployeeImportDrawer 同构)
  web  下载模板 → /api/courses/import/template
  web  上传填好的文件 → uploadToStorage('courses/import-batches', file) → fileKey
  web  api.post('/courses/import/dry-run', { fileKey })
  api  importService.dryRun:
       1. 解析 xlsx → 12 列校验
       2. 大纲版本名 → 查 CourseOutlineVersion,不存在 → error
       3. 板块代码+类别序号 → 查 CourseOutlineItem,不存在 → error
       4. 实际授课老师工号 → 查 Employee,已离职 → error
       5. 学号列拆分 → 查 Student,不存在 → error
       6. 返回 { totalRows, validRows, errors }
  web  errors 为空 → 用户确认 → api.post('/courses/import/commit', { fileKey })
  api  importService.commit:
       每行走独立事务:
         1. formatCourseNo + idSequence.allocateCourse(TT, KK, year)
         2. prisma.$transaction:
            - create Course
            - syncEnrollments (新课,oldIds=[])
            - reconcileCourseCredits (oldState=empty, newState=填写字段)
            - auditLog: create + enroll
       汇总 { created, errors: [] } 返回;任一行失败不影响其余行,失败行进 errors 回显

Phase 3 delete item 联动(跨 service 触发):
  api  CourseOutlineItemsService.deleteItems(ids):
       prisma.$transaction:
         - deleteMany CourseOutlineItem ids
         - (4B 新增) updateMany Course
             where: { outlineVersionId: 各 item.outlineVersionId, sectionCode: item.sectionCode, categorySequenceNo: item.sequenceNo }
             data: { sectionCode: null, categorySequenceNo: null }
       auditLog: 每条 item delete + 每条 Course 更新各写 1 条

Student 详情打开时的真实查询:
  api  StudentsService.findOne(id):
       (旧) return { ...student, relatedOutlineCategories: [] }
       (新) return { ...student, relatedOutlineCategories: await this.enrichRelatedOutlineCategories(id) }
       enrichRelatedOutlineCategories(studentId):
         1. 查 enrollments where studentId
         2. 对每条 enrollment 的 courseId:join Course + CourseOutlineItem
         3. 收集 secondaryCategoryName 去重

课程大纲页打开时的真实老师汇总:
  api  CourseOutlinesService.getVersion(id):
       items: await this.enrichActualTeachers(items)
       enrichActualTeachers(items):
         对每条 item,查 Course where outlineVersionId + sectionCode + categorySequenceNo
         GROUP BY actualTeacherJobNo → join Employee
         actualTeachers = [{ jobNo, name, employmentStatus, courseCount }]
```

---

## 3. Prisma schema 增量

```prisma
model Course {
  // ...
  sectionCode        String?        // ← 改:String → String?
  categorySequenceNo String?        // ← 改:String → String?
  // ...
  @@index([plannedAt])
  @@index([sectionCode, categorySequenceNo])  // index 仍有效,nullable 列上的索引 Postgres 支持
}
```

**变更说明**:

- `sectionCode` / `categorySequenceNo` 改可空是为了让 Phase 3 `deleteItems` 能把指向已删除 outline item 的 Course 清空关联,保留课程本身(不删)。
- 现有数据全是 NOT NULL 字符串,`prisma db push` 执行 `ALTER COLUMN DROP NOT NULL` 零风险。
- 所有 DTO / 前端 TypeScript 类型、`enrichWithDerivedFields` 的 sectionMap 查询、高搜 filter builder 都需要 null-safe 处理。
- **`Course.outlineVersionId` 不变**(早就 nullable,schema 已 `onDelete: SetNull`)。

---

## 4. 领域约定

### 4.1 高级搜索请求/响应形状

**`SearchCoursesDto`**(`apps/api/src/modules/courses/dto/search-courses.dto.ts`):

```ts
export class SearchCoursesDto {
  /** 每个字段是"多值数组",非空数组 = 该字段激活;空数组或缺省 = 不参与过滤 */
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  courseName?: string[]              // course.name 对每值 ILIKE '%v%'

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  outlineCategoryName?: string[]     // CourseOutlineItem.secondaryCategoryName ILIKE(spec §7 "所属清单内课程名称")

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  sectionCode?: string[]             // course.sectionCode IN

  @IsOptional() @IsArray() @IsIn(TEACHING_TYPE as unknown as string[], { each: true }) @ArrayMaxSize(20)
  actualTeachingType?: string[]      // course.actualTeachingType IN

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(50)
  studentIds?: string[]              // enrollments join:course 有任一该学生

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  actualTeacherJobNos?: string[]     // course.actualTeacherJobNo IN

  @IsOptional() @IsInt() @Min(1) page?: number
  @IsOptional() @IsInt() @Min(1) @Max(200) pageSize?: number
}
```

**响应**:复用 4A 的 `CourseListResponse`;结构完全一致,列表页与高搜页共用同一表组件。

**SQL 生成规则**:

```ts
function buildWhere(dto: SearchCoursesDto): Prisma.CourseWhereInput {
  const and: Prisma.CourseWhereInput[] = []

  if (dto.courseName?.length) {
    and.push({ OR: dto.courseName.map(v => ({ name: { contains: v, mode: 'insensitive' } })) })
  }
  if (dto.outlineCategoryName?.length) {
    // 通过 CourseOutlineItem 间接过滤
    and.push({
      AND: [
        { outlineVersionId: { not: null } },
        { sectionCode: { not: null } },
        { categorySequenceNo: { not: null } },
        {
          outlineVersion: {
            items: {
              some: {
                OR: dto.outlineCategoryName.map(v => ({ secondaryCategoryName: { contains: v, mode: 'insensitive' } })),
                // AND sectionCode + sequenceNo 对齐当前 Course(防跨板块误命中)
              },
            },
          },
        },
      ],
    })
    // 注:Prisma 不直接支持"关联对象的多列等值与当前 Course 的多列对齐"的复合条件;
    //     service 层在调用 findMany 前后用一次 in-memory filter 保证同板块同序号(见 §5.2)
  }
  if (dto.sectionCode?.length)        and.push({ sectionCode: { in: dto.sectionCode } })
  if (dto.actualTeachingType?.length) and.push({ actualTeachingType: { in: dto.actualTeachingType } })
  if (dto.actualTeacherJobNos?.length) and.push({ actualTeacherJobNo: { in: dto.actualTeacherJobNos } })
  if (dto.studentIds?.length)          and.push({ enrollments: { some: { studentId: { in: dto.studentIds } } } })

  return and.length === 0 ? {} : { AND: and }
}
```

### 4.2 URL 序列化 `apps/web/src/utils/advanced-search-serializer.ts`

```ts
export function encodePanelState(state: PanelState): string {
  // 过滤掉空数组,避免冗余
  const clean = Object.fromEntries(Object.entries(state).filter(([, v]) => Array.isArray(v) ? v.length > 0 : v != null))
  const json = JSON.stringify(clean)
  return typeof btoa !== 'undefined' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json).toString('base64')
}

export function decodePanelState(q: string): PanelState {
  try {
    const json = typeof atob !== 'undefined' ? decodeURIComponent(escape(atob(q))) : Buffer.from(q, 'base64').toString()
    return JSON.parse(json) as PanelState
  } catch {
    return {}
  }
}
```

`PanelState` 与 `SearchCoursesDto` 形状一致(6 字段 × 数组 + 分页);前端侧同步 URL `?q=` 以 base64 存储,刷新/分享链接状态持久。

### 4.3 Excel 导入模板字段

模板列(顺序):

| 列头(中文) | 字段 | 必填 | 约束 |
| --- | --- | --- | --- |
| 课程名称 | name | ✅ | 文本,≤200 |
| 大纲版本名 | outlineVersionName | ✅ | 必须存在于 `CourseOutlineVersion.versionName` |
| 板块代码 | sectionCode | ✅ | 2 大写字母;`(outlineVersionId, sectionCode)` 必须在 `CourseSection` 内 |
| 类别序号 | categorySequenceNo | ✅ | 2 位数字字符串;`(outlineVersionId, sectionCode, sequenceNo)` 必须在 `CourseOutlineItem` 内 |
| 计划授课时间 | plannedAt | ⬜ | `YYYY-MM-DD HH:mm` 或 `YYYY-MM-DD`;空时 `status=未排期`,year 用当前系统年 |
| 授课时长(min) | durationMinutes | ⬜ | 非负整数 |
| 实际授课方式 | actualTeachingType | ⬜ | ∈ `TEACHING_TYPE` |
| 实际授课老师工号 | actualTeacherJobNo | ⬜ | 员工存在且未离职 |
| 选课学生学号 | studentNos | ⬜ | 分号分隔;每个学号必须在 Student 表;拆解后去重 |
| 回放链接 | replayUrl | ⬜ | URL |
| 视频链接 | videoUrl | ⬜ | URL |
| 资源链接 | resourceUrl | ⬜ | URL |
| 备注 | note | ⬜ | ≤5000 |

模板行首放一条示例行(与 Phase 1A 员工模板一致)。template 运行期生成,返回 `Buffer`。

### 4.4 毛玻璃面板视觉约定

`AdvancedSearchPage.module.css` 或内联:

```css
.panel {
  position: relative;
  border-radius: 24px;
  padding: 32px 40px;
  background: linear-gradient(135deg, rgba(190, 220, 255, 0.45), rgba(235, 245, 255, 0.3));
  backdrop-filter: blur(12px);
  box-shadow: 0 8px 32px rgba(120, 150, 220, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.panel-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 24px;
}

.field-row {
  /* 单字段行 + [+]/[×] 副按钮 */
  display: flex;
  gap: 8px;
  align-items: center;
}

.submit-full {
  /* spec §7 "底部设置通栏主查询按钮" */
  width: 100%;
  margin-top: 24px;
  height: 48px;
  font-size: 16px;
}

.results-zone {
  /* 与面板视觉隔离:回归普通白卡 */
  margin-top: 48px;
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
}
```

**页面背景**:`CourseListPage` 保持默认浅冷灰(spec §0 §5.1);`AdvancedSearchPage` 自己在外层 `<div>` 加 `background: linear-gradient(180deg, #eef5ff 0%, #f7faff 100%)`,只影响本页。

---

## 5. 后端详设 (apps/api)

### 5.1 依赖增补

无新增三方包。`exceljs` / `minio` / `class-validator` 继续沿用。

### 5.2 `courses.service.ts` 补充 `search()`

```ts
async search(dto: SearchCoursesDto): Promise<CourseListResponse> {
  const page = dto.page ?? 1
  const pageSize = dto.pageSize ?? 50
  const skip = (page - 1) * pageSize

  const baseWhere = buildWhere(dto)  // §4.1

  let courses: Course[]
  let total: number

  if (dto.outlineCategoryName?.length) {
    // 需要 in-memory 二次过滤:确保 OutlineItem 的 sectionCode+sequenceNo 与 Course 的 sectionCode+categorySequenceNo 对齐
    const preliminary = await this.prisma.course.findMany({ where: baseWhere, orderBy: [{ plannedAt: { sort: 'desc', nulls: 'last' } }, { courseNo: 'asc' }] })
    const allowedPairs = await this.prisma.courseOutlineItem.findMany({
      where: { OR: dto.outlineCategoryName.map(v => ({ secondaryCategoryName: { contains: v, mode: 'insensitive' } })) },
      select: { outlineVersionId: true, sectionCode: true, sequenceNo: true },
    })
    const allowed = new Set(allowedPairs.map(p => `${p.outlineVersionId}::${p.sectionCode}::${p.sequenceNo}`))
    const filtered = preliminary.filter(c =>
      c.outlineVersionId && c.sectionCode && c.categorySequenceNo &&
      allowed.has(`${c.outlineVersionId}::${c.sectionCode}::${c.categorySequenceNo}`)
    )
    total = filtered.length
    courses = filtered.slice(skip, skip + pageSize)
  } else {
    ;[courses, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({ where: baseWhere, skip, take: pageSize, orderBy: [{ plannedAt: { sort: 'desc', nulls: 'last' } }, { courseNo: 'asc' }] }),
      this.prisma.course.count({ where: baseWhere }),
    ])
  }

  const items = await this.enrichWithDerivedFields(courses)  // 4A 既有
  return { items, total, page, pageSize }
}
```

**实现说明**:`outlineCategoryName` 字段需要"关联 OutlineItem 的多列与 Course 的多列对齐"Prisma 不直接支持,用二次内存过滤兜底。数据规模(单次查询百级别 courses)可接受;若未来上量,升级成 `prisma.$queryRaw` JOIN。

### 5.3 `courses-import.service.ts`

```ts
@Injectable()
export class CoursesImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly idSequence: IdSequenceService,
    private readonly enroll: CoursesEnrollmentService,
    private readonly credit: CoursesCreditService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async generateTemplate(): Promise<Buffer> { /* exceljs 组装 12 列 + 1 示例行 */ }

  async dryRun(fileKey: string): Promise<ImportReport> {
    const buffer = await this.storage.readObject(fileKey)
    const { rows, errors: parseErrors } = await this.parse(buffer)
    const validated = await this.validate(rows)  // 异步:需要查 version/section/item/student/employee
    return { totalRows: rows.length, validRows: validated.rows.length, errors: [...parseErrors, ...validated.errors] }
  }

  async commit(fileKey: string, operatorId: string): Promise<ImportCommitResult> {
    const { rows } = await this.parse(await this.storage.readObject(fileKey))
    const validated = await this.validate(rows)
    if (validated.errors.length > 0) return { created: 0, errors: validated.errors }

    let created = 0
    const rowErrors: ImportRowError[] = []

    for (const row of validated.rows) {
      try {
        const year = row.data.plannedAt ? row.data.plannedAt.getFullYear() : new Date().getFullYear()
        const seq = await this.idSequence.allocateCourse(row.data.sectionCode, row.data.categorySequenceNo, year)
        const courseNo = formatCourseNo({ sectionCode: row.data.sectionCode, categorySequenceNo: row.data.categorySequenceNo, year, seq })

        await this.prisma.$transaction(async tx => {
          const course = await tx.course.create({ data: { ...row.data, courseNo } })
          await this.enroll.syncEnrollments(tx, course.id, [], row.studentIds)
          await this.credit.reconcileCourseCredits(tx,
            { durationMinutes: null, actualTeachingType: null, enrolledStudentIds: [] },
            { durationMinutes: course.durationMinutes, actualTeachingType: course.actualTeachingType, enrolledStudentIds: row.studentIds },
          )
          await tx.auditLog.create({ data: { operatorId, action: 'create', targetType: 'course', targetId: course.id, afterValue: JSON.stringify({ ...course, studentIds: row.studentIds }) } })
        })
        created++
      } catch (err) {
        rowErrors.push({ row: row.rowNumber, field: 'commit', message: (err as Error).message })
      }
    }

    return { created, errors: rowErrors }
  }

  private async validate(rows: ParsedRow[]) {
    // 批量预取:outlineVersions / sections / items / students / employees
    // 单行校验时用 map 命中,减少 N+1 查询
    // 对每行填充 `data: Prisma.CourseCreateInput`(不含 courseNo)+ `studentIds: string[]`
    // ...略
  }
}
```

**与 4A 不同的地方**:导入是**多行并发 create**,但逐行独立事务(而非单一大事务)—— 一行失败不回滚已成功的其它行。与 Phase 1A 员工导入"整批校验通过才 commit"的策略不同:课程导入场景里一行失败(如并发 seq 分配超 999)不应阻塞其它行。失败行进 `errors` 回显,运营手动修正后再导入剩余行。

### 5.4 `students.service.ts` 的 `enrichRelatedOutlineCategories` 补齐

4B 在 `findOne()` 里把占位替换为真实查询:

```ts
async findOne(id: string): Promise<StudentDetail> {
  const student = await this.prisma.student.findUnique({ where: { id } })
  if (!student) throw new NotFoundException('学生不存在')

  const [counselor, planner, relatedOutlineCategories] = await Promise.all([
    this.resolveEmployee(student.counselorJobNo),
    this.resolveEmployee(student.plannerJobNo),
    this.enrichRelatedOutlineCategories(id),
  ])

  return {
    ...student,
    currentGrade: computeGrade(student.enrollmentYear, student.graduationYear),
    counselor,
    planner,
    relatedOutlineCategories,
  }
}

private async enrichRelatedOutlineCategories(studentId: string): Promise<string[]> {
  // 1. 查该学生的 enrollments → courseIds
  const enrollments = await this.prisma.enrollment.findMany({ where: { studentId }, select: { courseId: true } })
  if (enrollments.length === 0) return []
  const courseIds = enrollments.map(e => e.courseId)

  // 2. 查 courses → 收集 (outlineVersionId, sectionCode, categorySequenceNo) 三元组
  const courses = await this.prisma.course.findMany({
    where: { id: { in: courseIds } },
    select: { outlineVersionId: true, sectionCode: true, categorySequenceNo: true },
  })
  const keys = courses
    .filter(c => c.outlineVersionId && c.sectionCode && c.categorySequenceNo)
    .map(c => ({ outlineVersionId: c.outlineVersionId!, sectionCode: c.sectionCode!, sequenceNo: c.categorySequenceNo! }))
  if (keys.length === 0) return []

  // 3. 查 outline items → 去重 secondaryCategoryName
  const items = await this.prisma.courseOutlineItem.findMany({
    where: { OR: keys },
    select: { secondaryCategoryName: true },
  })
  return [...new Set(items.map(i => i.secondaryCategoryName))].sort()
}
```

### 5.5 `course-outlines.service.ts` 的 `enrichActualTeachers` 补齐

在 `getVersion()` 的 `enrichedItems` map 里,把 `actualTeachers: []` 换成真实查询。

```ts
private async enrichActualTeachers(items: CourseOutlineItem[]): Promise<Map<string, ActualTeacher[]>> {
  // key: `${outlineVersionId}::${sectionCode}::${sequenceNo}`
  if (items.length === 0) return new Map()

  // 一次查所有 courses 对应到 items
  const keys = items.map(i => ({ outlineVersionId: i.outlineVersionId, sectionCode: i.sectionCode, categorySequenceNo: i.sequenceNo }))
  const courses = await this.prisma.course.findMany({
    where: { OR: keys.map(k => ({ AND: [{ outlineVersionId: k.outlineVersionId }, { sectionCode: k.sectionCode }, { categorySequenceNo: k.categorySequenceNo }] })) },
    select: { outlineVersionId: true, sectionCode: true, categorySequenceNo: true, actualTeacherJobNo: true },
  })

  // 2. GROUP BY (item key, actualTeacherJobNo) → count
  const grouped = new Map<string, Map<string, number>>()  // itemKey → (jobNo → count)
  for (const c of courses) {
    if (!c.outlineVersionId || !c.sectionCode || !c.categorySequenceNo || !c.actualTeacherJobNo) continue
    const itemKey = `${c.outlineVersionId}::${c.sectionCode}::${c.categorySequenceNo}`
    const inner = grouped.get(itemKey) ?? new Map()
    inner.set(c.actualTeacherJobNo, (inner.get(c.actualTeacherJobNo) ?? 0) + 1)
    grouped.set(itemKey, inner)
  }

  // 3. 批量查老师
  const allJobNos = new Set<string>()
  grouped.forEach(inner => inner.forEach((_, jn) => allJobNos.add(jn)))
  const teachers = await this.prisma.employee.findMany({ where: { jobNo: { in: [...allJobNos] } }, select: { jobNo: true, name: true, employmentStatus: true } })
  const teacherMap = new Map(teachers.map(t => [t.jobNo, t]))

  // 4. 组装
  const result = new Map<string, ActualTeacher[]>()
  grouped.forEach((inner, itemKey) => {
    const arr: ActualTeacher[] = []
    inner.forEach((count, jobNo) => {
      const t = teacherMap.get(jobNo)
      if (t) arr.push({ jobNo, name: t.name, employmentStatus: t.employmentStatus, courseCount: count })
    })
    result.set(itemKey, arr)
  })
  return result
}
```

调用侧:`getVersion()` 的 enrichedItems map 改为 `actualTeachers: actualTeachersMap.get(key) ?? []`。

### 5.6 `course-outline-items.service.ts` 的 `deleteItems` 事务联动

```ts
async deleteItems(ids: string[], operatorId: string): Promise<{ deleted: number; cascadedCourses: number }> {
  const items = await this.prisma.courseOutlineItem.findMany({ where: { id: { in: ids } } })
  if (items.length === 0) return { deleted: 0, cascadedCourses: 0 }

  let cascadedCourses = 0
  await this.prisma.$transaction(async tx => {
    // 4B 新增:先记录 Course 将要被 set null 的快照
    const orConds = items.map(i => ({ AND: [{ outlineVersionId: i.outlineVersionId }, { sectionCode: i.sectionCode }, { categorySequenceNo: i.sequenceNo }] }))
    const affectedCourses = await tx.course.findMany({ where: { OR: orConds }, select: { id: true, sectionCode: true, categorySequenceNo: true } })
    cascadedCourses = affectedCourses.length

    // 执行悬空清空
    if (affectedCourses.length > 0) {
      await tx.course.updateMany({
        where: { OR: orConds },
        data: { sectionCode: null, categorySequenceNo: null },
      })
    }

    // 删 outline items
    await tx.courseOutlineItem.deleteMany({ where: { id: { in: ids } } })

    // audit:每条 item delete + 每条 Course 字段级 update
    for (const item of items) {
      await tx.auditLog.create({ data: { operatorId, action: 'delete', targetType: 'course_outline_item', targetId: item.id, beforeValue: JSON.stringify(this.snapshot(item)) } })
    }
    for (const c of affectedCourses) {
      await tx.auditLog.createMany({
        data: [
          { operatorId, action: 'update', targetType: 'course', targetId: c.id, fieldName: 'sectionCode',        beforeValue: JSON.stringify(c.sectionCode),        afterValue: JSON.stringify(null) },
          { operatorId, action: 'update', targetType: 'course', targetId: c.id, fieldName: 'categorySequenceNo', beforeValue: JSON.stringify(c.categorySequenceNo), afterValue: JSON.stringify(null) },
        ],
      })
    }
  })

  return { deleted: items.length, cascadedCourses }
}
```

前端 `DeleteItemsConfirm` 文案由 Phase 3 的"若现有课程引用了这些分类,在 Phase 4 落地后变为空值"改为实际生效:**保留原有警示文案**,接口返回的 `cascadedCourses` 可用来在 `message.success` 里展示 `已删除 N 条,同时清空了 M 门课程的分类关联`。

### 5.7 HTTP 契约增量

| 方法 | 路径 | 守卫 | 说明 |
| --- | --- | --- | --- |
| POST | `/courses/search` | 登录 | `SearchCoursesDto` |
| GET | `/courses/import/template` | `@Roles(SUPER_ADMIN, ADMIN)` | xlsx 二进制 |
| POST | `/courses/import/dry-run` | `@Roles(SUPER_ADMIN, ADMIN)` | `{ fileKey }` |
| POST | `/courses/import/commit` | `@Roles(SUPER_ADMIN, ADMIN)` | `{ fileKey }` |

`StorageService.STORAGE_FOLDERS` 追加 `'courses/import-batches'` 一项。

### 5.8 模块装配

`courses.module.ts` 注册:

```ts
@Module({
  imports: [PrismaModule, IdSequenceModule, StorageModule, AuditLogsModule],
  controllers: [CoursesController],
  providers: [CoursesService, CoursesEnrollmentService, CoursesCreditService, CoursesImportService],  // ← + Import
})
export class CoursesModule {}
```

---

## 6. 前端详设 (apps/web)

### 6.1 依赖增补

无新增三方包。

### 6.2 路由改动

```tsx
{
  path: 'courses/advanced-search',
  element: (
    <RequireAuth>
      <AdvancedSearchPage />
    </RequireAuth>
  ),
},
```

`/courses` 列表页的右上角"高级搜索"按钮 4B 上架,点击 `navigate('/courses/advanced-search')`。

### 6.3 `features/courses/` 增量

#### `CourseTable.tsx` 抽取

从 4A 的 `CourseListPage.tsx` 抽出一个 presentational 组件:

```tsx
type Props = {
  items: CourseListItem[]
  total: number
  page: number
  pageSize: number
  loading?: boolean
  selectedRowKeys?: string[]
  onSelect?: (keys: string[]) => void
  onPageChange?: (page: number) => void
}
```

列配置与 4A 保持一致。`CourseListPage` 与 `AdvancedSearchPage` 共用。

#### `AdvancedSearchPage.tsx`

```tsx
export function AdvancedSearchPage() {
  const [params, setParams] = useSearchParams()
  const [panelState, setPanelState] = useState<PanelState>(() => decodePanelState(params.get('q') ?? ''))
  const [appliedState, setAppliedState] = useState<PanelState>(panelState)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  const { data, isLoading } = useQuery({
    queryKey: ['courses', 'search', appliedState, page],
    queryFn: () => coursesApi.search({ ...appliedState, page, pageSize: PAGE_SIZE } as SearchCoursesBody),
  })

  const onSubmit = () => {
    setAppliedState(panelState)
    setPage(1)
    const encoded = encodePanelState(panelState)
    if (encoded === encodePanelState({})) setParams({})  // 空态清 URL
    else setParams({ q: encoded })
  }

  return (
    <div className="advanced-search-page">
      <Typography.Title level={2}>课程高级搜索</Typography.Title>
      <AdvancedSearchPanel value={panelState} onChange={setPanelState} onSubmit={onSubmit} />
      <div className="results-zone">
        <CourseTable
          items={data?.items ?? []}
          total={data?.total ?? 0}
          page={page}
          pageSize={PAGE_SIZE}
          loading={isLoading}
          onPageChange={setPage}
        />
      </div>
    </div>
  )
}
```

#### `AdvancedSearchPanel.tsx`

```tsx
type Props = {
  value: PanelState
  onChange: (next: PanelState) => void
  onSubmit: () => void
}
```

- 毛玻璃 `<div className={styles.panel}>` 外壳
- 6 字段按两列栅格排布:
  - 课程名称 `<FieldRow value={value.courseName} onChange={..} render={v => <Input value={v} />} />`
  - 所属清单内课程名称(同上)
  - 课程所属板块 `<Select options={COURSE_SECTIONS_FROM_ACTIVE_OUTLINE}>`(从所有版本 sections 并集,去重)
  - 实际授课形式 `<Select options={TEACHING_TYPE_OPTIONS}>`
  - 上课学生 `<Button>+ 选择学生</Button>` → 打开 4A 的 `StudentPickerModal`(多选)
  - 实际授课老师 `<EmployeePicker>` 多实例(复用 Phase 2 默认行为:下拉只列在职;历史已离职老师若是筛选目标,用户已能搜到的前提是原本就绑定过 —— 这里的用途是"筛出该老师的课程",下拉展示在职即够)
- 每个字段的 `<FieldRow>` 组件:
  - 默认 1 个输入
  - 右侧 `[+]` 按钮添加同类输入;每实例旁 `[×]` 删除(第一个始终保留)
  - 统一高度 40px
- 底部:`<Button type="primary" className={styles.submitFull}>查询</Button>`
- 点"查询" → onChange 推到父组件 → parent 更新 `appliedState` + URL

#### `CourseImportDrawer.tsx`

与 `EmployeeImportDrawer` / `StudentImportDrawer` 同构,不赘述:
- 下载模板 → `coursesApi.downloadTemplate()`
- 上传 xlsx → `uploadToStorage('courses/import-batches', file)` → `fileKey`
- 预校验 → 展示错误 + 总行/有效行数
- 确认导入 → 调 commit,展示 `已导入 N 条,失败 M 条(见错误表)`
- 成功后 invalidate `['courses']` 并关闭

#### `CourseListPage.tsx` 调整

- 右侧搜索框之后插 "从 Excel 导入" 按钮(4A 预留位置上架)
- 右上角 "高级搜索" 按钮(4A 预留位置上架),点击 `navigate('/courses/advanced-search')`
- 工具条从 4A 的"暂缺两个按钮"状态补齐成 spec §4 完整版
- 使用 `CourseTable` 组件替换原内联 `<Table>`

### 6.4 `services/courses.ts` 增量

```ts
export const coursesApi = {
  ...(既有 4A 方法),
  search: (body: SearchCoursesBody) => api.post<CourseListResponse>('/courses/search', body),
  importDryRun: (fileKey: string) => api.post<ImportReport>('/courses/import/dry-run', { fileKey }),
  importCommit: (fileKey: string) => api.post<ImportCommitResult>('/courses/import/commit', { fileKey }),
  downloadTemplate: () => downloadAuthed('/courses/import/template', '课程导入模板.xlsx'),
}
```

---

## 7. 错误处理与边界

| 场景 | 后端行为 | 前端表现 |
| --- | --- | --- |
| 高搜所有字段为空 | `baseWhere = {}` → 返回全量 | 与列表页等效,筛选面板空状态提示"未设筛选,显示全部" |
| 高搜 `outlineCategoryName` 与 `sectionCode` 冲突(过滤后为空) | 返回 `{ items: [], total: 0 }` | `<Empty>` |
| URL `q=` 解析失败 | decodePanelState 返回 `{}` | 面板展示空态;不报错,用户重填 |
| 导入某行 `outlineVersionName` 找不到 | dry-run `errors: [{ row, field: '大纲版本名', message: '...' }]` | Drawer 标黄行 |
| 导入某行学号缺失 / 已删除 | dry-run error;commit 阶段无此行 | Drawer 展示 |
| 导入单行 commit 抛错(如 seq 超 999)| `rowErrors.push({ row, field: 'commit', message })`;其余行继续 | `message.warning('已导入 N,失败 M,详见错误表')` |
| Phase 3 `deleteItems` 在 4B 后点击,有课程被级联 null | `updateMany` 执行 + auditLog 写 | 前端弹 `message.success('已删除 N,同时清空了 M 门课程的分类')` |
| 学生详情打开瞬间 relatedOutlineCategories 很慢 | 串行 3 次查询,不影响 counselor/planner 渲染(Promise.all 各自独立失败)| `relatedOutlineCategories` 展示 loading skeleton 或 `—` |
| 大纲页 actualTeachers 其中一老师已被硬删(工号失联) | teacherMap 无命中,`enrichActualTeachers` 跳过该 entry | 列表少显示那位;因为 employees 硬删已被 `EmployeesService.remove` 的 counter 保护,实际不可能走到 |

---

## 8. 验收清单(spec §11 4B 映射)

- [ ] `/courses` 右上 "高级搜索" 按钮点击跳 `/courses/advanced-search`
- [ ] 高搜页筛选面板毛玻璃 + 两列网格 + 通栏查询按钮
- [ ] 每字段右侧 `[+]` 可增加同类输入,`[×]` 可删(至少保留 1)
- [ ] 同字段多值 OR,跨字段 AND
- [ ] 查询后下方结果表展示;分页可用;URL 同步 `?q=...`
- [ ] 粘贴 `/courses/advanced-search?q=...` 进浏览器直接打开面板带筛选 + 结果
- [ ] 清空面板点查询 → 返回全量
- [ ] `所属清单内课程名称` = "英语一对一" → 结果里只有 outlineItem.secondaryCategoryName 含"英语一对一"的 course
- [ ] `/courses` "从 Excel 导入" 按钮点击打开 Drawer
- [ ] 下载模板填 3 行(其中 1 行学号列填 3 个学生)→ 上传预校验 → commit → 列表新增 3 条,相关学生 remainingCredits 被扣减(若 durationMinutes+type 都填)
- [ ] 导入行中 1 行大纲版本名错 → dry-run 标红该行,"确认导入"禁用
- [ ] 导入 commit 中某行 seq 溢出 999 → 该行进 errors,其余行正常入库
- [ ] 学生详情打开 → `已上课程的二级课程类别` 列表显示该学生 enrollment 对应的 secondaryCategoryName 去重集合
- [ ] 大纲页打开某版本 → 每条 item 的"实际授课老师(自动同步)" 列显示该 item 对应课程的老师 + 课数徽章
- [ ] Phase 3 `从大纲删除` 触发,对应板块序号被课程引用 → 课程的 sectionCode/categorySequenceNo 变成 null;列表该行"所属板块"显示 `—`
- [ ] Phase 3 删除时 `message.success` 展示 `已删除 N 条,同时清空了 M 门课程的分类关联`
- [ ] AuditLog 对 import 每行 create + enroll 各写一条;`deleteItems` 级联的 Course 字段级 update 也有记录

---

## 9. 范围边界(明确**不**做)

- 查询结果导出 Excel(spec 未要求)
- AND/OR 条件树 / 嵌套分组查询(已否决,Q2 决策)
- 保存的筛选组合(`user_filter_presets`,需要新表,spec 无要求)
- 搜索历史记录
- 筛选面板的"关闭某字段"功能(spec §7 只说"增加条件",未说"减少")— 保留所有 6 字段在面板上始终可见
- 全文检索(PostgreSQL `tsvector`;当前 ILIKE 够用)
- 移动端高搜页专门重设计(两列网格可接受响应式压缩成单列)
- 自动化测试基础设施

---

## 10. 变更文件一览

**新增(后端)**:

- `apps/api/src/modules/courses/courses-import.service.ts`
- `apps/api/src/modules/courses/dto/search-courses.dto.ts`
- `apps/api/src/modules/courses/dto/import.dto.ts`

**修改(后端)**:

- `apps/api/prisma/schema.prisma`(`Course.sectionCode` / `categorySequenceNo` 改 String?)
- `apps/api/src/modules/courses/courses.controller.ts`(+ `search` / `import/template` / `import/dry-run` / `import/commit`)
- `apps/api/src/modules/courses/courses.service.ts`(+ `search(dto)`)
- `apps/api/src/modules/courses/courses.module.ts`(provider + `CoursesImportService`)
- `apps/api/src/modules/courses/courses.types.ts`(+ `ActualTeacher` / `SearchCoursesBody` / import 类型)
- `apps/api/src/modules/students/students.service.ts`(`findOne` 的 `relatedOutlineCategories` 切真实;+ `enrichRelatedOutlineCategories`)
- `apps/api/src/modules/course-outlines/course-outlines.service.ts`(`getVersion` 的 `actualTeachers` 切真实;+ `enrichActualTeachers`)
- `apps/api/src/modules/course-outlines/course-outline-items.service.ts`(`deleteItems` 事务内加 `Course.updateMany` + audit)
- `apps/api/src/common/dictionaries.ts`(`STORAGE_FOLDERS` + `'courses/import-batches'`)

**新增(前端)**:

- `apps/web/src/features/courses/AdvancedSearchPage.tsx`
- `apps/web/src/features/courses/AdvancedSearchPanel.tsx`
- `apps/web/src/features/courses/AdvancedSearchPage.module.css`(或同文件内联 styled-jsx)
- `apps/web/src/features/courses/CourseTable.tsx`(从 `CourseListPage` 抽出)
- `apps/web/src/features/courses/CourseImportDrawer.tsx`
- `apps/web/src/utils/advanced-search-serializer.ts`

**修改(前端)**:

- `apps/web/src/services/courses.ts`(+ `search` / `importDryRun` / `importCommit` / `downloadTemplate`)
- `apps/web/src/features/courses/CourseListPage.tsx`(上架"高级搜索"与"从 Excel 导入"按钮;用 `CourseTable` 组件取代内联表格)
- `apps/web/src/router.tsx`(+ `/courses/advanced-search` 子路由)
- `apps/web/src/features/courses/types.ts`(+ `PanelState` / `SearchCoursesBody` / `ActualTeacher`)
- `apps/web/src/features/students/StudentFormModal.tsx`(若原占位文案"待课程模块上线后自动同步"需替换成真实列表渲染;依赖于是否展示 relatedOutlineCategories,Phase 2 已有只读区域 —— 4B 只是后端切真实,前端若已按 `student.relatedOutlineCategories` 渲染则零改动)
- `apps/web/src/features/course-outlines/CourseOutlinePage.tsx`(实际授课老师列的 tooltip/badge,若 Phase 3 已按 `item.actualTeachers` 渲染则零改动)

**不动**:

- `apps/api/prisma/schema.prisma` 除 `Course.sectionCode/categorySequenceNo` 外的字段
- `apps/api/src/modules/{employees,users,auth,payroll,links,audit-logs,storage}/`
- `apps/web/src/features/{auth,employees,user-settings,users}/`
- `apps/web/src/components/{EmployeePicker,SectionCategoryCascader}.tsx`(4A 既有,直接复用)
- 任何 env / docker-compose / CLAUDE.md

---

## 11. 与 Phase 5 的接口预留

Phase 4 全部落完后,Phase 5(薪酬)可直接用:

- `CoursesService.search()` 承载任意过滤维度(老师 + 时间范围)产出该老师的课程集
- `computeCreditHours(course.durationMinutes)` + `TEACHING_TYPE_BUCKET[course.actualTeachingType]` = 薪酬结算的课时桶
- `AuditLog` 对导入、高搜、deleteItems 级联的所有变更留痕,便于 Phase 5 结算时的"这个员工当月实际授课课时" 有审计来源
- `CourseOutlineItem.actualTeachers` 的 GROUP BY 查询模式可复用到薪酬"老师-课程-课时"报表

Phase 4B 不预先建 Phase 5 的空壳模块/路由/页面,保持 `modules/payroll` / `features/payroll` 占位的现状。
