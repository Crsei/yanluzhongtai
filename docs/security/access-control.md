# 访问控制说明

## 1. 角色模型

| 角色 | 来源 | 访问范围 |
| --- | --- | --- |
| 超级管理员 `SUPER_ADMIN` | `UserRole` enum | 全部模块 + 账号注册 / 重置 / 注销 / 任意角色调整 |
| 管理员 `ADMIN` | `UserRole` enum | 全部业务模块；`MEMBER → ADMIN` 升级；不能注销账号，不能重置密码 |
| 一般成员 `MEMBER` | `UserRole` enum | 员工 / 学生 / 课程 / 数据表 / SOP / 关于；不可访问薪酬与日志 |
| 访客 | 未登录 | 仅 SOP 与 关于；其余路径跳 `UnauthorizedPage kind="guest"` |

## 2. 落地点

### 2.1 API 级

- 全局 `APP_GUARD` 注册顺序：`JwtAuthGuard` → `RolesGuard` → `MustChangePasswordGuard`（`apps/api/src/app.module.ts`）。
- 装饰器：
  - `@Public()`（`modules/auth/decorators/public.decorator.ts`）— 豁免 JWT；当前用于 `/auth/login` / `/auth/refresh` / `/health` / `/public/sop-links`。
  - `@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)` — 写端点限管理员 / 超管。
  - `@CurrentUser()` — 从请求注入 `AuthUser`。
- `MustChangePasswordGuard` 白名单：`GET /auth/me` 与 `POST /users/me/initial-password-change`；其他路径返回 `403 { code: "MUST_CHANGE_PASSWORD" }`。
- 注销账号 (`deactivatedAt != null`)：`JwtStrategy` / `RefreshStrategy` 在 `validate()` 里实时拒绝；`AuthService.login()` 在 `findByPhone` 后也再查一次。

### 2.2 Web 级

- 路由级：`features/auth/RequireAuth.tsx` + `features/auth/RequireRole.tsx` 包装在 `router.tsx` 的对应路由上。
- 按钮级：页面组件内通过 `useAuthStore` 读 `user.role`，条件渲染 4 个管理按钮（员工 / 学生 / 课程 / QuickLink 列表均如此）。
- 标签页级：`UserSettingsLayout` 承载 `/user-settings` 与 `/users`；`AppShell` 的用户 Popover 通过 `window.open('/user-settings', '_blank')` 打开。
- 未授权态：不硬跳 `/login`，保留 `AppShell` 壳，内容区展示 `UnauthorizedPage`，只有点击"前往登录"才跳登录页。

### 2.3 文件上传

- `MINIO_BUCKET` 默认 `yanlu-assets`；API 启动时自动创建 bucket。
- presign PUT 的 `folder` 必须在 `common/dictionaries.ts::STORAGE_FOLDERS` 白名单内：`employees/attachments`、`employees/import-batches`、`students/attachments`、`students/import-batches`、`course-outlines/import-batches`、`courses/import-batches`。任何新增上传用途都要回到这张白名单注册。
- presign GET 按 object key 签发；业务层可在签发前做二次校验（例如学生详情的附件 key 是否真属于该学生）。

## 3. 审计

- 所有写操作通过 `AuditLogsService.record({ operatorId, action, targetType, targetId, before?, after? })` 留痕。
- 更新动作在同时传 `before + after` 时按字段级拆条写入；其他动作（create / delete / settle / reorder 等）写单条。
- 180 天过期由 `AuditLogsRetentionService` 每天 03:00 自动清理。
- 管理员可通过 `/logs` 页面查询（`GET /api/audit-logs`）。

## 4. 当前边界 / 非目标

- Access Token 有效期 15 分钟；过期前已签发 token 仍可用——即"立即注销账号"最长存在 15 分钟窗口，Phase 1B 起的已知 trade-off，不引入 token blocklist。
- 敏感字段脱敏：仅在 `GET /api/audit-logs` 的"操作人"列展示手机号后 4 位，其余字段保留原值；后续如需 PII 脱敏应在 service 层统一加。
- 文件访问权限：当前仅"鉴权后可发起 presign"；并未按对象 ACL 区分哪些 key 归哪个租户 / 学生。单租户内部使用暂不需要，正式多租户化时再补。

## 5. 相关代码位置

- `apps/api/src/modules/auth/`：登录 / refresh / logout / me / 三个 Guard / 两个 Passport Strategy / `@Public` / `@Roles` / `@CurrentUser` 装饰器。
- `apps/api/src/modules/users/`：自助与 admin 用户管理。
- `apps/api/src/modules/audit-logs/`：写侧 + 读侧 + retention cron。
- `apps/web/src/features/auth/`：路由级权限包装、未授权页、强制改密页。
- `apps/web/src/services/http.ts`：401 refresh + 403 `MUST_CHANGE_PASSWORD` 拦截。
- `apps/web/src/stores/authStore.ts`：session / user / hydrated 状态。
- `docs/spec/00-全局约束与实施路线.md` §3 / §4.1：权限矩阵与鉴权基线。
