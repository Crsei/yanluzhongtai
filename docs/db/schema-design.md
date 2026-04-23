# 数据库设计说明

Source of truth：`apps/api/prisma/schema.prisma`。本文件解释字段语义、索引策略和跨表约定；读 schema 时请同时看此文件。

## 1. 枚举

| enum | 值 | 用途 |
| --- | --- | --- |
| `UserRole` | `SUPER_ADMIN` / `ADMIN` / `MEMBER` | 账号角色；访客为"未登录"，不占用 enum 值 |
| `EmploymentStatus` | `FULL_TIME` / `PART_TIME` / `RESIGNED` | 员工在职状态 |
| `ServiceStatus` | `NOT_STARTED` / `IN_SERVICE` / `PAUSED` / `TERMINATED` / `COMPLETED` | 学生服务状态 |
| `QuickLinkPageType` | `DATA_TABLE` / `SOP` | Phase 6 QuickLink 所属页面 |
| `QuickLinkKind` | `NAVIGATE` / `COPY` / `DOWNLOAD` | Phase 6 QuickLink 点击行为 |

## 2. 模型

### 2.1 账号与员工

- **`User`**：手机号 `phone` 作为唯一登录凭证；`passwordHash` bcrypt；`deactivatedAt` 做软删除（Guard 在请求中实时校验）；`mustChangePassword` 控制首次改密拦截。
- **`Employee`**：工号 `jobNo` 唯一；`servingFor` 为字符串数组（服务归属多选）；`attachmentKeys` 存 MinIO object key 数组；`@@index([name])` 支持姓名 ILIKE。

### 2.2 学生与选课

- **`Student`**：学号 `studentNo` 唯一；`counselorJobNo` / `plannerJobNo` 指向 `Employee.jobNo`（非外键，因为允许指向离职员工）；多个 `*Keys` 字段存 MinIO object key 数组；`detailNotes` 存 JSON 以支撑"多段式详情备注"；`@@index([name])` + `@@index([enrollmentYear])`。
- **`Enrollment`**：复合主键 `(studentId, courseId)`；级联删除：删学生或课程都会级联清理 Enrollment。业务层额外保护：`Student` 存在 `Enrollment` 时拒绝删除（409）。

### 2.3 课程大纲

- **`CourseOutlineVersion`**：`versionName` 唯一；`isActive` 控制"当前激活版本"，service 层事务内保证全局至多一个 active；`@@index([isActive])`。
- **`CourseSection`**：`@@unique([outlineVersionId, code])`；级联删除于 `CourseOutlineVersion`。
- **`CourseOutlineItem`**：`@@unique([outlineVersionId, sectionCode, sequenceNo])` 保证同一节内序号唯一；级联删除于 `CourseOutlineVersion`；`@@index([outlineVersionId, sectionCode])` 加速按节查询。

### 2.4 课程实体

- **`Course`**：课程编号 `courseNo` 唯一（`TTKKYYNNN`）；`outlineVersionId` 可为空（删除 outline version 时 SetNull）；`outlineItemId` 冗余保留 outline item 的引用。
- 派生字段：`status` 不存 DB（`computeCourseStatus(plannedAt, durationMinutes, now)` 读时派生）；`creditHours` 在写入时由 `computeCreditHours(durationMinutes)` 计算并存盘（便于薪酬侧直接复用）。
- 索引：`@@index([plannedAt])` / `@@index([sectionCode, categorySequenceNo])` / `@@index([actualTeacherJobNo])`。

### 2.5 薪酬

- **`PayrollSettlement`**：结算事件表；单条记录代表一次"为 (teacher, period) 结 XX 小时"的动作；`subtotalPayable` / `subtotalPaid` 是冗余快照，避免每次列表都重新聚合；`@@index([employeeJobNo, settlementPeriod])`。业务约束：同 `(employeeJobNo, settlementPeriod)` 的所有行 `hourlyRate` 必须一致。
- **`PayrollManualRecord`**：手动劳务 / 扣除补录；与 `PayrollSettlement` 职责分离，列表页把两类行分别渲染；只支持新增 + 删除，不支持编辑。

### 2.6 Phase 6：快捷入口 / 审计

- **`QuickLink`**：数据表 / SOP 卡片；`pageType` 区分页面；`kind` 区分点击行为；`sortOrder` 为整数，service 层给新插入项分配 `max + 10`，拖拽保存时重排为 `(idx+1) * 10`；`@@index([pageType, category, sortOrder])`。
- **`AuditLog`**：所有写操作的留痕；`operatorId` 指 `User.id`（用户删除时 SetNull，保留历史行）；`fieldName` 非空表示"字段级 diff"的一条，否则是"事件级"的一条（create / delete / reorder 等）。
  - 索引：`@@index([createdAt])` 支撑 180 天清理 + 时间倒序分页；`@@index([operatorId])` 支撑按操作人筛选；`@@index([targetType, targetId])` 支撑按对象反查。
  - 保留策略：`AuditLogsRetentionService` 每天 03:00 `deleteMany({ createdAt: { lt: now - 180d } })`。

### 2.7 辅助：编号分配

- **`IdSequence`**：复合主键 `(kind, year)`；`lastSeq` 单调递增，删除不回收。
- 使用 kind：
  - `"employee"` — 员工工号 `YYNNN`
  - `"student"` — 学生学号 `YYNNNN`
  - `"course:<TT><KK><YY>"` — 课程编号 `TTKKYYNNN`（复合 kind 字符串，见 `common/course-no`）

## 3. 删除策略

| 表 | 物理删 | 软删 | 特殊 |
| --- | --- | --- | --- |
| `User` | 不做 | `deactivatedAt` + Guard 实时拒绝 | 最后一个 `SUPER_ADMIN` 不可注销 |
| `Employee` | 允许 | — | 若被任意学生 / 课程 / 薪酬引用 `jobNo` → 409 |
| `Student` | 允许 | — | 若存在 `Enrollment` → 409 |
| `CourseOutlineVersion` | 允许 | — | 若有 `Course.outlineVersionId` 引用 → service 层阻止 |
| `Course` | 允许 | — | 级联清理 `Enrollment` |
| `QuickLink` | 允许 | — | 每次 delete 写 `quick_link.delete` audit |
| `AuditLog` | 自动（180 天 cron）| — | 清理任务不再追加 audit |

## 4. 大字段 / 附件字段策略

- 附件字段统一存 MinIO object key 字符串数组（`attachmentKeys` / `transcriptKeys` / `scheduleKeys` / `policyKeys` / `serviceChecklistKeys`）；前端按 key 通过 `/api/storage/downloads/sign` 拿 presign 下载。
- 长文本字段（`overallPlanText` / `policyText` / `resumeText` / `note` / `detailNotes`）直接存表；`detailNotes` 为 JSON 以支持多段结构。
- Phase 6 `QuickLinkKind=DOWNLOAD` 的静态文件不进 DB，走 `apps/web/public/templates/<file>` 静态路径。

## 5. 审计字段约定

- 写侧统一走 `AuditLogsService.record({ operatorId, action, targetType, targetId, before?, after? })`。
- `action === "update" || action.endsWith(".update")` 且同时传 `before` + `after` 时，service 自动按字段 diff 拆多条；仅 `create` / `delete` / 事件型 action 保留单条。
- `action` 命名约定：`<domain>.<verb>`（如 `student.create` / `course.update` / `quick_link.reorder`）；兼容早期无前缀的 `create` / `update` / `delete` / `settle` 等。
- `targetType` 与业务表名对齐（`student` / `course` / `payroll_settlement` / `quick_link` 等）；`User` 模块保留历史 `"User"` 大写形式。
