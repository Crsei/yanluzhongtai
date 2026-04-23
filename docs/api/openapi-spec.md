# API 端点一览

**Source of truth**：`apps/api/src/modules/*/`. 本文件按模块分组列出当前已上线端点，作为快速检索。未接入 `@nestjs/swagger` 自动化契约；后续若需要正式 OpenAPI，可在此路径接入。

统一前缀：所有端点都挂在 `/api` 下（`apps/api/src/main.ts` 设的全局前缀）。

鉴权模型：
- 默认所有端点都过 `JwtAuthGuard`，除非用 `@Public()` 显式豁免。
- 写端点额外用 `@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)`。
- `MustChangePasswordGuard` 在 `mustChangePassword=true` 时只放行 `GET /auth/me` 和 `POST /users/me/initial-password-change`，其他路径返回 `403 { code: "MUST_CHANGE_PASSWORD" }`。

## 健康 / 公开

| Method | Path | 角色 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/health` | Public | 健康检查 |
| GET | `/api/public/sop-links` | Public | Phase 6：访客可读的 SOP QuickLink 列表 |

## 认证（`modules/auth`）

| Method | Path | 角色 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | Public | 手机号 + 密码；返回 `accessToken` + 设置 refresh cookie |
| POST | `/api/auth/refresh` | Public | 基于 refresh cookie 换新 accessToken |
| POST | `/api/auth/logout` | 登录 | 清 refresh cookie |
| GET | `/api/auth/me` | 登录 | 当前用户信息（`MustChangePasswordGuard` 白名单）|

## 用户（`modules/users`）

Self-service（任何已登录用户）：

| Method | Path | 说明 |
| --- | --- | --- |
| PATCH | `/api/users/me/phone` | 要求 `currentPassword`；`phone` 冲突时 409 |
| PATCH | `/api/users/me/username` | 纯改名 |
| PATCH | `/api/users/me/password` | 旧密 + 新密；强度 ≥8 + 字母数字；`MustChangePasswordGuard` 会拦截，强制走 initial |
| POST | `/api/users/me/initial-password-change` | 仅在 `mustChangePassword=true` 时可用；成功后清除该标记 |
| POST | `/api/users/me/deactivate` | 要求 `phoneConfirmation` 与当前手机号完全一致 |

Admin（见每个端点的 `@Roles`）：

| Method | Path | 角色 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/users` | ADMIN+ | 列表：关键词（phone/username ILIKE）+ `includeDeactivated` |
| POST | `/api/users` | SUPER_ADMIN | 注册账号；初始密码=手机后 6 位，`mustChangePassword=true`，响应体一次性返回 `initialPassword` |
| PATCH | `/api/users/:id/role` | ADMIN+ | ADMIN 仅可 `MEMBER → ADMIN`；SUPER 可任意；不能改自己；最后一个 SUPER 不可降级 → 409 |
| POST | `/api/users/:id/reset-password` | SUPER_ADMIN | 重置为手机后 6 位 + `mustChangePassword=true`，响应体一次性返回 `tempPassword` |
| POST | `/api/users/:id/deactivate` | SUPER_ADMIN | 要求 `phoneConfirmation`；不能注销自己 |

## 员工（`modules/employees`）

| Method | Path | 角色 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/employees` | 登录 | 列表 + 分页 + 关键词 + 在职状态筛选；`jobNo` 精确过滤 |
| GET | `/api/employees/:id` | 登录 | 详情 |
| POST | `/api/employees` | ADMIN+ | 创建；工号由 `IdSequence` 分配 |
| PUT | `/api/employees/:id` | ADMIN+ | 更新 |
| DELETE | `/api/employees/:id` | ADMIN+ | 被引用时 409 |
| GET | `/api/employees/import/template` | ADMIN+ | 下载 xlsx 模板 |
| POST | `/api/employees/import/dry-run` | ADMIN+ | 请求体 `{ fileKey }`；返回每行校验报告 |
| POST | `/api/employees/import/commit` | ADMIN+ | 有效行入库，无效行跳过，审计每行单独记一条 |

## 学生（`modules/students`）

与员工同构：

| Method | Path | 角色 |
| --- | --- | --- |
| GET | `/api/students` | 登录 |
| GET | `/api/students/:id` | 登录 |
| POST | `/api/students` | ADMIN+ |
| PUT | `/api/students/:id` | ADMIN+ |
| DELETE | `/api/students/:id` | ADMIN+（存在 Enrollment 时 409）|
| GET | `/api/students/import/template` | ADMIN+ |
| POST | `/api/students/import/dry-run` | ADMIN+ |
| POST | `/api/students/import/commit` | ADMIN+ |

## 课程大纲（`modules/course-outlines`）

| Method | Path | 角色 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/course-outlines/versions` | 登录 | 版本列表 |
| GET | `/api/course-outlines/versions/:id` | 登录 | 版本详情（含 sections / items）|
| POST | `/api/course-outlines/versions` | ADMIN+ | 新建版本 |
| DELETE | `/api/course-outlines/versions/:id` | ADMIN+ | 被 Course 引用时 service 层阻止 |
| POST | `/api/course-outlines/versions/:id/items` | ADMIN+ | 追加条目 |
| PUT / DELETE | `/api/course-outlines/items/:id` | ADMIN+ | 更新 / 删除条目 |
| POST | `/api/course-outlines/versions/:id/activate` | ADMIN+ | 切换激活版本（事务内互斥）|
| GET | `/api/course-outlines/import/template` | ADMIN+ | 模板 |
| POST | `/api/course-outlines/import/dry-run` | ADMIN+ | dry-run |
| POST | `/api/course-outlines/import/commit` | ADMIN+ | commit |

## 课程（`modules/courses`）

| Method | Path | 角色 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/courses` | 登录 | 列表 + 分页 + 关键词 + 状态 + 多条件筛选；返回派生 `status` |
| GET | `/api/courses/:id` | 登录 | 详情（含选课学生快照）|
| POST | `/api/courses` | ADMIN+ | 创建；`courseNo` 由大纲 item + 年份驱动分配 |
| PUT | `/api/courses/:id` | ADMIN+ | 更新；不接受修改 `courseNo` 与年份 |
| DELETE | `/api/courses` | ADMIN+ | 请求体 `{ ids: string[] }`；批量删除 |
| GET | `/api/courses/import/template` | ADMIN+ | 模板 |
| POST | `/api/courses/import/dry-run` | ADMIN+ | dry-run |
| POST | `/api/courses/import/commit` | ADMIN+ | commit |

## 薪酬（`modules/payroll`）

整个模块以 `@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)` 挂在 controller 上。

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/payroll` | 按 (teacher, period) 聚合；支持 `search` / `onlyUnsettled` / `fromPeriod` / `toPeriod` |
| GET | `/api/payroll/row/:jobNo/:period` | 单行详情：用于结算 Modal 的"剩余可结上限" |
| GET | `/api/payroll/courses?teacherJobNo=&period=` | 当前 (teacher, period) 下的已完成课程列表 |
| POST | `/api/payroll/settlements` | 新增结算事件；首次需给 `hourlyRate`，后续被一致性校验 |
| POST | `/api/payroll/manual-records` | 新增手动劳务 / 扣除 |
| DELETE | `/api/payroll/manual-records/:id` | 删除手动记录 |

## 快捷入口（`modules/quick-links`）

| Method | Path | 角色 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/public/sop-links` | Public | 仅返回 SOP 分组 |
| GET | `/api/quick-links?pageType=DATA_TABLE\|SOP` | 登录 | 分组列表，组内按 `sortOrder` |
| POST | `/api/quick-links` | ADMIN+ | 新增；`sortOrder` 自动分配 `max+10` |
| PATCH | `/api/quick-links/:id` | ADMIN+ | 更新；不允许改 `pageType` |
| DELETE | `/api/quick-links/:id` | ADMIN+ | 删除 |
| POST | `/api/quick-links/reorder` | ADMIN+ | 请求体 `{ pageType, items: [{id, sortOrder}] }`；事务批量 |

## 审计日志（`modules/audit-logs`）

| Method | Path | 角色 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/audit-logs` | ADMIN+ | 分页 50；支持 `operatorId` / `targetType` / `action` / `fromDate` / `toDate` 过滤；`createdAt desc`；`operator` 联查用户名 / 手机 |

写侧不暴露 HTTP：`AuditLogsService.record()` 由各业务 service 调用。

后台任务：`AuditLogsRetentionService` — `@Cron(EVERY_DAY_AT_3AM)`，删除 180 天前的行。

## 对象存储（`modules/storage`）

| Method | Path | 角色 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/storage/uploads/sign` | 登录 | 请求体 `{ folder, filename }`；返回 presign PUT URL + objectKey |
| GET | `/api/storage/downloads/sign?key=` | 登录 | 返回 presign GET URL |

`folder` 必须在 `common/dictionaries.ts::STORAGE_FOLDERS` 白名单内，禁止任意路径写入。

## 统一错误响应

所有 4xx / 5xx 返回 JSON：

```json
{ "statusCode": 403, "message": "...", "code": "MUST_CHANGE_PASSWORD" }
```

- `code` 字段可选，用于前端拦截器识别（当前已用：`MUST_CHANGE_PASSWORD`）。
- 409 常见于业务约束冲突（如"员工被学生引用"）；前端直接把 `message` 交由 `message.error` 展示。
- 400 / 422 由 `class-validator` ValidationPipe 抛出；`message` 是 string[]，前端取第一条。
