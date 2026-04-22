# Phase 1B — 用户与账号管理 设计文档

> 本文档是 `docs/spec/02-Phase1-员工与用户管理.md` §8-11 的实现级 spec。Phase 1A 员工模块已完成（33 个 commit, `4aa3032..07001b4`），本 Phase 聚焦 `User` 实体的 CRUD、self-service 账号管理、首次改密强制流程。不再改动 Employee 模块。

## 1. 阶段目标

搭完账号体系，让 SUPER_ADMIN 能注册账号、提升管理员、重置/注销他人，让任何用户能在独立标签页里 self-service 改自己的手机号/姓名/密码、注销自己。Phase 1B 完工后，平台具备完整"账号生命周期"闭环。

## 2. 与规格文档的对应

本 spec 实现 `docs/spec/02-Phase1-员工与用户管理.md` 的以下章节：

| Spec 章节 | 对应实现 |
|---|---|
| §8 用户设置页（独立新标签页） | 前端 `/user-settings` + `UserSettingsLayout` + 权限区渲染 |
| §9 全部用户管理页 | 前端 `/users` + 列表 + 操作列 + 注册按钮 + 返回设置 |
| §10.1 重置密码二次确认 | admin `POST /users/:id/reset-password`（前端弹确认 → 明文新密码展示） |
| §10.2 注销账号两步确认 | admin `POST /users/:id/deactivate`、self `POST /users/me/deactivate`（前端两步对话框，第 2 步再次输入目标手机号） |
| §11 验收 | 用户设置页按角色显示权限区、SUPER_ADMIN 可进全部用户管理、重置密码 + 注销账号具备明确二次确认流程 |

## 3. 设计决策汇总

以下 12 个关键决策在 brainstorming 阶段已与用户对齐：

| # | 决策 | 备注 |
|---|---|---|
| Q1 | 注销：**软删除** + `deactivatedAt` 字段 | 手机号仍占 unique |
| Q2 | self-service 改手机号：**要求当前密码** | admin 不通过 UI 改他人手机号（spec §9 操作列未列）；如真需要走 SQL 手术 |
| Q3 | self-service 改密码：**要求旧密码 + 新密码**（≥8 字符、含字母 + 数字） | |
| Q4 | admin 重置密码：**新密码 = 手机号后 6 位 + `mustChangePassword=true`** | 首次登录强制改密 |
| Q5 | 角色：**支持升与降** | 护栏：不能降自己；不能删最后一个 SUPER_ADMIN |
| Q6 | 角色变更 UI：**`/users` 行内下拉**；用户设置页按钮是跳转 shortcut | |
| Q7 | `/users` **对 ADMIN + SUPER_ADMIN 都开放** | ADMIN 仅能把 MEMBER→ADMIN，其他按钮 disabled |
| Q8 | 注册账号：**phone + username + role 3 字段**；初始密码走 Q4 同一套 | 不绑 Employee |
| Q9 | "最近访问"**复用 `lastLoginAt`**，在登录 + refresh 时更新 | 不新增 `lastActivityAt` |
| Q10 | `/user-settings` 和 `/users` 都走 **`target="_blank"` 独立标签页 + 独立 `UserSettingsLayout`** | |
| Q11 | Session 失效：**Guard 检查 `deactivatedAt`**；不支持重新激活 | |
| Q12 | 审计：**纯 action-level + `user.xxx` 前缀** | 不记 login；密码操作不写 before/after |
| + | **统一注销规则**：任何角色都可自注销；后端统一护栏"若 target 是 SUPER_ADMIN 且为最后一个 → 409" | 自 + admin 两个端点共用 |

## 4. 架构

### 4.1 后端模块（`apps/api`）

- `src/modules/users/` — 从当前"仅 service"扩为完整模块：
  - `users.module.ts`（补 controller 的 declaration；继续导出 service 供 AuthModule 使用）
  - `users.controller.ts`（**新增**）— `/users`、`/users/me`、`/users/:id/*` 共 9 个端点（详见 §6）
  - `dto/register-user.dto.ts`、`dto/change-phone.dto.ts`、`dto/change-username.dto.ts`、`dto/change-password.dto.ts`、`dto/initial-change-password.dto.ts`、`dto/update-role.dto.ts`、`dto/deactivate-user.dto.ts`、`dto/list-users.dto.ts`（**新增**）
  - `users.service.ts`（**扩展**）— 增 `list / register / updatePhoneSelf / updateUsernameSelf / changePassword / initialChangePassword / resetPassword / updateRole / deactivate / countSuperAdmins` 方法
- `src/modules/auth/` — 3 处微调：
  - `strategies/jwt.strategy.ts::validate()` — 查 User 时若 `deactivatedAt != null` → `UnauthorizedException("账号已注销")`
  - `strategies/refresh.strategy.ts::validate()` — 同上护栏
  - `auth.service.ts::login()` — login 响应增字段 `mustChangePassword: boolean`（从 `user.mustChangePassword` 透传）；`refresh` 同样透传
  - **新增**全局 `MustChangePasswordGuard` — 登录后若 `mustChangePassword=true`，除白名单端点（详见 §12）外一律 `ForbiddenException({code:"MUST_CHANGE_PASSWORD"})`
- `src/modules/audit-logs/` — **不改代码**，复用 `AuditLogsService.record()`；action 字符串用新的 `user.xxx` 命名（现有 service 对 action 无枚举约束）

### 4.2 前端模块（`apps/web`）

- `src/layouts/UserSettingsLayout.tsx`（**新增**）— minimal layout：仅一个 header（标题 + "返回设置"或空）+ `<Outlet />`
- `src/features/user-settings/`（**新增**）
  - `UserSettingsPage.tsx` — spec §8 布局：手机号块、员工姓名块、修改密码/注销账号操作、权限区（按角色渲染）
  - `ChangePhoneModal.tsx`、`ChangeUsernameModal.tsx`、`ChangePasswordModal.tsx`、`DeactivateSelfModal.tsx`（两步对话框）
- `src/features/users/`（**新增**）
  - `UsersListPage.tsx` — spec §9 布局：列表 + 操作列 + "注册账号"按钮 + "返回设置"
  - `RegisterUserModal.tsx`、`ResetPasswordDialog.tsx`、`DeactivateUserModal.tsx`（两步）
  - `RoleDropdown.tsx` — 列表行内角色下拉
  - `hooks/useUsers.ts`、`hooks/useUserMutations.ts`（TanStack Query）
- `src/features/auth/ForcePasswordChangePage.tsx`（**新增**）— 首次登录拦截页
- `src/services/users.ts`（**新增**）— 9 个 API wrapper（与后端端点一一对应）
- `src/router.tsx` — 增加 `/user-settings`、`/users`、`/force-password-change` 3 条路由，前两条挂 `<UserSettingsLayout>`，不在 `<AppShell>` 内
- `src/layouts/AppShell.tsx` — 修改 Popover 里"用户设置"按钮：从 `message.info` 改为 `window.open('/user-settings', '_blank')`
- `src/stores/authStore.ts` — `AuthUser` 类型增 `mustChangePassword?: boolean`；login/hydrate/refresh 透传；`setSession` 后若 `mustChangePassword` 为 true 则前端也做一次校验保底

## 5. 数据模型

### 5.1 Schema 变更（`apps/api/prisma/schema.prisma`）

`User` 模型增 2 个字段，其他 model 和 enum 不变：

```prisma
model User {
  id                  String    @id @default(cuid())
  phone               String    @unique
  passwordHash        String
  username            String
  role                UserRole  @default(MEMBER)
  createdAt           DateTime  @default(now())
  lastLoginAt         DateTime?
  deactivatedAt       DateTime?              // ← 新增：null = 在用, 非 null = 已注销
  mustChangePassword  Boolean   @default(false) // ← 新增：首次登录是否需强制改密
  auditLogs           AuditLog[]
}
```

**迁移方式**：`pnpm prisma:push`（沿用 Phase 1A，暂不切 `prisma migrate`）。两个新字段都有默认/可空，对现有行非破坏。

**不变项**：
- `phone @unique` 保持（Q1 软删除不释放手机号）
- `AuditLog` 结构完全复用 Phase 1A，不加字段
- 没有新 table，没有 User↔Employee 关联（Q8 选 B）
- 没有 token blocklist（Q11 选 A）

### 5.2 `AuthUser` 类型（前后端共享契约）

`apps/api/src/modules/auth/auth.types.ts::AuthUser` 当前是 `{ id, phone, username, role }`。本 Phase **不改这个结构**（保持 JWT payload 对应简洁），而是在 `login` / `refresh` / `/auth/me` 的响应 body 里单独带 `mustChangePassword: boolean` 作为顶层字段。

前端 `apps/web/src/features/auth/types.ts` 对应 `AuthUser` 类型：保持原样；`authStore` 内部持有的 session state 增字段 `mustChangePassword: boolean`。

## 6. API 设计

所有端点 URL 前缀 `/api`（由 `main.ts` 全局 prefix 加）。

### 6.1 Self-service 端点（所有已登录用户）

| Method | Path | Body | 行为 |
|---|---|---|---|
| `PATCH` | `/users/me/phone` | `{ newPhone, currentPassword }` | 验密，校验 `newPhone` 格式（`/^1[3-9]\d{9}$/`），改 `User.phone`（受 unique 约束 → 409 重复）；写审计 `user.update_phone` |
| `PATCH` | `/users/me/username` | `{ newUsername }` | 不验密，直接改；写审计 `user.update_username` |
| `PATCH` | `/users/me/password` | `{ oldPassword, newPassword }` | 验旧密；新密校验（≥8 字符 + 字母 + 数字 + 不等于旧密码）；bcrypt 哈希；写审计 `user.change_password`（before/after null）。注意 `mustChangePassword=true` 时此端点被 `MustChangePasswordGuard` 拦截，用户必须走 `/users/me/initial-password-change`|
| `POST` | `/users/me/initial-password-change` | `{ newPassword }` | 仅在 `user.mustChangePassword === true` 时可用（否则 403）；新密校验同上 + 不等于"phone 后 6 位"；bcrypt 哈希；同时清除 `mustChangePassword` 标记；写审计 `user.change_password`；用于 ForcePasswordChangePage |
| `POST` | `/users/me/deactivate` | `{ phoneConfirmation }` | 校验 `phoneConfirmation === user.phone`；**统一护栏**：若 target 是最后一个 SUPER_ADMIN → 409；设 `deactivatedAt=now()`；写审计 `user.deactivate`；响应后前端清 session |

所有 self-service 端点：不标 `@Roles`（默认任意已登录用户可调用）。DTOs 用 class-validator 校验格式。

注意 phone 格式校验已在 Phase 0 `LoginDto` 中使用过；`apps/api/src/modules/auth/dto/login.dto.ts` 可作为 `@Matches` 装饰器的参考。

### 6.2 Admin 端点（SUPER_ADMIN 或部分 ADMIN）

| Method | Path | Body | 允许角色 | 行为 |
|---|---|---|---|---|
| `GET` | `/users` | query: `page, pageSize=50, keyword, includeDeactivated=false` | SUPER_ADMIN, ADMIN | 分页列出；按 `lastLoginAt DESC NULLS LAST, createdAt DESC` 排序；keyword 搜 phone+username ILIKE；`includeDeactivated=true` 时返回所有，否则仅 `deactivatedAt IS NULL` |
| `POST` | `/users` | `{ phone, username, role }` | SUPER_ADMIN | 注册：`passwordHash = bcrypt(phone.slice(-6), 12)`；`mustChangePassword=true`；role ∈ {MEMBER, ADMIN, SUPER_ADMIN}；写审计 `user.register`；响应体 `{ id, phone, username, role, initialPassword }` |
| `PATCH` | `/users/:id/role` | `{ role }` | SUPER_ADMIN or ADMIN | **后端分支护栏**：若 operator 是 ADMIN，仅允许 `target.role===MEMBER && newRole===ADMIN`，其他 403；若 operator 是 SUPER_ADMIN，允许任意切换，但：①不能改自己（id 相同 → 403）；②不能把最后一个 SUPER_ADMIN 降级（→ 409）；写审计 `user.update_role` |
| `POST` | `/users/:id/reset-password` | 空 | SUPER_ADMIN | 计算 `newPassword = target.phone.slice(-6)`；bcrypt hash；`mustChangePassword=true`；**响应体返回 `{ tempPassword: string }`**；写审计 `user.reset_password`（before/after null） |
| `POST` | `/users/:id/deactivate` | `{ phoneConfirmation }` | SUPER_ADMIN | 校验 `phoneConfirmation === target.phone`；**统一护栏**：target 若是最后一个 SUPER_ADMIN → 409；不能 deactivate 自己（`/users/me/deactivate` 专供 self）→ 403；设 `deactivatedAt=now()`；写审计 `user.deactivate` |

**关于 "注册/重置/注销 admin 只限 SUPER_ADMIN"**：这是 §3 Q7 矩阵里的决定。ADMIN 进 `/users` 页仅能看列表 + 给 MEMBER 升 ADMIN；其他按钮前端 disabled + 后端 `@Roles` 双保险。

**关于 "admin 不能改他人 phone / username"**：spec §9 操作列只列了"重置密码、注销账号"，没列"编辑信息"。本 Phase 不实现 admin 改他人 phone/username 的 UI 与端点；真有这种 corner case（比如用户手机号被人换掉），SUPER_ADMIN 通过 SQL 手术处理。

### 6.3 Auth 流程微调

| Method | Path | 现状 | Phase 1B 变更 |
|---|---|---|---|
| `POST` | `/auth/login` | 响应 `{accessToken, expiresIn, user}` | 响应体增 **`mustChangePassword: boolean`**（从 `user.mustChangePassword` 透传）；若 `deactivatedAt != null` → 401 |
| `POST` | `/auth/refresh` | 响应 `{accessToken, expiresIn, user}` | 响应体增 **`mustChangePassword: boolean`**；若 `deactivatedAt != null` → 401 |
| `GET` | `/auth/me` | 响应 `{user}` | 响应体增 **`mustChangePassword: boolean`** |
| `POST` | `/auth/logout` | 清 cookie | 不变 |

`JwtStrategy.validate()` 和 `RefreshStrategy.validate()` 都加一句：从 DB 拿到 User 后若 `deactivatedAt != null` 抛 `UnauthorizedException("账号已注销")`。

## 7. 核心流程

### 7.1 注册账号（admin）

```
前端: SUPER_ADMIN 在 /users 点 "注册账号" → RegisterUserModal
  fields: phone, username, role(默认 MEMBER)
  confirm → POST /users
后端:
  1. 校验 phone 唯一（unique 冲突 → 409）
  2. bcrypt.hash(phone.slice(-6), 12)
  3. 创建 User { mustChangePassword: true }
  4. AuditLogsService.record({
       action: "user.register",
       targetType: "User",
       targetId: created.id,
       before: null,
       after: { phone, username, role }
     })
  5. 响应 { id, phone, username, role, initialPassword: phone.slice(-6) }
前端: Modal 展示"初始密码为 <phone最后6位>, 请告知用户首次登录后强制改密"
```

### 7.2 `mustChangePassword` 首次改密流程

**触发点**：
1. 用户被 admin 重置密码后首次登录
2. 新注册用户首次登录

**流程**：
```
1. 用户 POST /auth/login → 响应 { ..., mustChangePassword: true }
2. 前端 authStore.setSession 后检测到此标记 → navigate("/force-password-change", { replace: true })
3. ForcePasswordChangePage 渲染: 仅含 "新密码 + 确认新密码" 两输入框（不要求旧密码）
4. 用户提交 → POST /users/me/initial-password-change { newPassword }
   - 后端校验 user.mustChangePassword === true（否则 403）
   - 新密强度校验 + 不等于 user.phone.slice(-6)（防止用户保留临时密）
   - bcrypt + update { passwordHash, mustChangePassword: false } + 写审计 user.change_password
5. 前端收到 200 → authStore 更新 mustChangePassword=false → navigate("/") 进入 AppShell 主界面
```

**全局拦截**（§12 详述）：在 `mustChangePassword=true` 期间，后端 `MustChangePasswordGuard` 拒绝所有非白名单端点。前端 axios 拦截器遇 `403 + code=MUST_CHANGE_PASSWORD` 时强制跳 `/force-password-change`。

### 7.3 注销流程

**Self-service**（spec §10.2）：
```
1. /user-settings 点 "注销账号" → DeactivateSelfModal 第 1 步: "您确定注销手机号 138****1234 的账号吗？"
2. 用户点确定 → 第 2 步: "请再次输入您的手机号以确认: ____"
3. 用户输入完整手机号；前端 onChange 时比对，不一致则"确认"按钮保持 disabled
4. 点击确认 → POST /users/me/deactivate { phoneConfirmation }
5. 后端校验 phoneConfirmation === user.phone + 最后一个 SUPER_ADMIN 护栏 → 设 deactivatedAt → 写审计
6. 前端 authStore.clearSession → window.close() 关闭当前独立标签 → 或主标签无事发生, 下次 refresh 时 401
```

**Admin 注销他人**（spec §9 操作列 + §10.2）：
```
1. /users 操作列点 "注销" → DeactivateUserModal 第 1 步: "您确定注销 138****1234 (张三) 吗？"
2. 确定 → 第 2 步: "请再次输入目标手机号 138****1234 以确认: ____"
3. 比对通过 → POST /users/:id/deactivate { phoneConfirmation }
4. 后端:
   - id === operator.id → 403 (admin 端点禁止自注销, 要求走 /me)
   - phoneConfirmation !== target.phone → 400
   - target 是最后一个 SUPER_ADMIN → 409
   - 通过 → 设 deactivatedAt → 写审计
5. 前端刷新列表; target 用户下次请求时 401
```

### 7.4 角色变更（升 + 降）

```
/users 列表行角色列 = RoleDropdown
  选项根据 operator 角色过滤:
    operator=ADMIN, target.role=MEMBER → 可选 ["ADMIN"]（仅提升一级）
    operator=ADMIN, target.role=ADMIN → disabled
    operator=ADMIN, target.role=SUPER_ADMIN → disabled
    operator=SUPER_ADMIN, target.id===operator.id → disabled (不能改自己)
    operator=SUPER_ADMIN, 其他 → 全部三个角色可选
  选中新角色 → 弹 Ant Modal.confirm "确定将 <user> 设为 <newRole>?" → 
  PATCH /users/:id/role { role: newRole }
后端:
  1. operator === target → 403
  2. target 是 SUPER_ADMIN, newRole != SUPER_ADMIN, countSuperAdmins() === 1 → 409
  3. ADMIN operator 限 MEMBER→ADMIN
  4. 通过 → update + 审计 user.update_role
```

### 7.5 重置他人密码（admin, spec §10.1）

```
/users 操作列点 "重置密码" → ResetPasswordDialog
  "您确定重置 138****1234 (张三) 的密码? 新密码为其手机号后 6 位, 对方下次登录时将强制改密。"
  确定 → POST /users/:id/reset-password
后端:
  1. target.phone.slice(-6) 作为新密
  2. bcrypt hash + update { passwordHash, mustChangePassword: true }
  3. 写审计 user.reset_password
  4. 响应 { tempPassword: "xxxxxx" }
前端: Dialog 显示"新密码: xxxxxx (请告知用户)"; 关闭后不再展示
```

## 8. 前端路由与页面

### 8.1 路由表（`src/router.tsx`）

```
/                        AppShell
  ├─ index → RootEntryRedirect
  ├─ employees            EmployeeListPage (RequireAuth)
  ├─ students ... (other Phase placeholders, unchanged)
/user-settings            UserSettingsLayout (RequireAuth)        ← NEW
  └─ index → UserSettingsPage
/users                    UserSettingsLayout (RequireAuth + RequireRole[SUPER_ADMIN, ADMIN])  ← NEW
  └─ index → UsersListPage
/force-password-change    ForcePasswordChangePage (RequireAuth)   ← NEW, no layout
/login                    LoginPage
```

### 8.2 `UserSettingsLayout`

结构：
```jsx
<Layout>
  <Header>
    <Typography.Title level={3}>{pageTitle}</Typography.Title>
    {showBackButton && <Button onClick={() => navigate("/user-settings")}>返回设置</Button>}
  </Header>
  <Content>
    <Outlet />
  </Content>
</Layout>
```

页面通过 `useOutletContext` 或 context 传 `pageTitle`、`showBackButton`。Sider 和移动端 drawer 不渲染。配色延用 `styles.css` 全局 token。

### 8.3 `/user-settings` 页（spec §8）

**布局**：
```
[用户设置 (标题)]

[卡片 1] 绑定手机号     13800138000          [修改]
[卡片 2] 员工姓名       张三                 [修改]

[操作区]
  [修改密码] [注销账号]

[权限区] (根据角色条件渲染, MEMBER 不显示)
  SUPER_ADMIN 看到:
    [设置管理员]  [设置超级管理员]  [中台全部用户管理]
  ADMIN 看到:
    [设置管理员]
```

点"设置管理员" / "设置超级管理员" / "中台全部用户管理" 都是 `window.open('/users', '_blank')`（或 `navigate`，因为已在独立标签页里）。三个按钮目前点了都去 `/users`，未来可以加 query string（例 `?action=promote-to-admin`）做预筛，但 Phase 1B 不做。

### 8.4 `/users` 页（spec §9）

**列表字段**：注册手机号、用户名、用户权限（角色下拉）、注册时间（createdAt）、最近访问时间（lastLoginAt）、操作

**操作列**：
- `[重置密码]` —— SUPER_ADMIN 可点；ADMIN 见 disabled
- `[注销账号]` —— SUPER_ADMIN 可点；ADMIN 见 disabled；target 已注销 → 整行灰显 + 所有按钮 disabled
- （目标是自己）所有编辑按钮 disabled

**工具区按钮**：
- `[注册账号]`（SUPER_ADMIN 可见，ADMIN disabled）
- `[返回设置]`（右上角，所有角色可见）
- 搜索框：keyword 搜 phone / username
- 过滤 switch：`[显示已注销]` 默认 off

**分页**：每页 50，与 `/employees` 一致。

**TanStack Query**：`useUsers(queryParams)`、`useUserMutations()` 暴露 `register / updatePhone / updateUsername / changePassword / resetPassword / updateRole / deactivate` mutations。

### 8.5 `/force-password-change` 页

极简表单 + 一个内容卡片：
- 说明文案："您的密码刚被重置/初始化，请设置新密码以继续使用系统"
- 输入：新密码、确认新密码
- 提交 → `POST /users/me/initial-password-change { newPassword }`

走专用端点而不是 `/users/me/password` 的好处：
- 不需要前端自算 `phone.slice(-6)` 作为 oldPassword（避免规则散落到前端）
- 后端只允许 `mustChangePassword=true` 时调用，其他场景 403，意图明确
- 同一审计 action `user.change_password` 复用

### 8.6 Popover 按钮（`AppShell`）

当前 `AppShell.tsx::UserPanelAuthenticated` 里 "用户设置" 按钮是 `onClick={() => message.info("用户设置将在后续阶段实现")}`。改为：

```tsx
onClick={() => window.open("/user-settings", "_blank", "noopener")}
```

## 9. 权限与能力矩阵

| 能力 | MEMBER | ADMIN | SUPER_ADMIN | 触发点（UI） |
|---|---|---|---|---|
| 登录 / 登出 / refresh | ✅ | ✅ | ✅ | LoginPage / AppShell popover |
| 改自己手机号（需当前密码）| ✅ | ✅ | ✅ | `/user-settings` ChangePhoneModal |
| 改自己员工姓名 | ✅ | ✅ | ✅ | `/user-settings` ChangeUsernameModal |
| 改自己密码（需旧密） | ✅ | ✅ | ✅ | `/user-settings` ChangePasswordModal |
| 注销自己 | ✅ | ✅ | ✅ (但受"最后一个 SA"护栏) | `/user-settings` DeactivateSelfModal |
| 进入 `/users` 列表 | ❌ | ✅ | ✅ | Popover/设置页按钮 |
| 注册新账号 | — | ❌ | ✅ | `/users` RegisterUserModal |
| 把 MEMBER → ADMIN | — | ✅ | ✅ | `/users` RoleDropdown |
| 把 ADMIN → SUPER_ADMIN | — | ❌ | ✅ | `/users` RoleDropdown |
| 降级 SUPER_ADMIN → ADMIN（非最后一个） | — | ❌ | ✅ | `/users` RoleDropdown |
| 降级 ADMIN → MEMBER | — | ❌ | ✅ | `/users` RoleDropdown |
| 改自己角色 | ❌ | ❌ | ❌ | (任意角色 disabled) |
| 重置他人密码 | — | ❌ | ✅ | `/users` ResetPasswordDialog |
| 注销他人 | — | ❌ | ✅ (但最后一个 SA 护栏) | `/users` DeactivateUserModal |
| 改他人手机号 / 用户名 | — | ❌ | ❌ | 本 Phase 不实现；自服务即可，corner case 走 SQL |
| 看已注销账号 | — | ✅ (只读) | ✅ (只读) | `/users` `[显示已注销]` 切换 |

**双保险原则**：所有 admin 能力在后端 `@Roles(...)` + service 层护栏，同时在前端按钮 `disabled`。前端是体验，后端是安全。

## 10. 审计日志

`AuditLog` schema 不变。所有 User 操作走 `AuditLogsService.record()`，action 采用 `user.xxx` 命名：

| action | operatorId | targetType | targetId | before | after | 触发点 |
|---|---|---|---|---|---|---|
| `user.register` | admin.id | `"User"` | new.id | null | `{ phone, username, role }` | `POST /users` |
| `user.update_phone` | actor.id | `"User"` | target.id | `{ phone: old }` | `{ phone: new }` | `PATCH /users/me/phone`（仅 self-service） |
| `user.update_username` | actor.id | `"User"` | target.id | `{ username: old }` | `{ username: new }` | `PATCH /users/me/username`（仅 self-service） |
| `user.change_password` | actor.id | `"User"` | actor.id | null | null | `PATCH /users/me/password` |
| `user.reset_password` | admin.id | `"User"` | target.id | null | null | `POST /users/:id/reset-password` |
| `user.update_role` | admin.id | `"User"` | target.id | `{ role: old }` | `{ role: new }` | `PATCH /users/:id/role` |
| `user.deactivate` | actor.id | `"User"` | target.id | null | `{ deactivatedAt: ts }` | `POST /users/me/deactivate` 或 `/users/:id/deactivate` |

**不记的事件**：
- login / logout / refresh（Phase 1A 已经决定不记）
- `mustChangePassword` 标记变化（附带在 change_password 里）

**写审计时机**：与业务 update 在同一个 service 方法里调用，但**不包在 Prisma $transaction 内**（延续 Phase 1A 的 trade-off，见 §15 已知权衡）。

## 11. 安全护栏

### 11.1 服务端护栏（`UsersService` / `@Roles`）

| 护栏 | 触发条件 | 响应 |
|---|---|---|
| Phone 唯一 | `register` / `update_phone` 导致 `User.phone` 冲突 | 409 `{message:"手机号已被使用"}` |
| Self-service 改手机号密码错 | `currentPassword` 不匹配 bcrypt.compare | 401 `{message:"当前密码不正确"}` |
| Self-service 改密码旧密错 | `oldPassword` 不匹配 | 401 |
| Self-service 改密码新密违反强度 | 不符合 ≥8 + 字母 + 数字 | 400 (ValidationPipe) |
| Self-service 改密码新旧相同 | newPassword === oldPassword | 400 `{message:"新密码不能与旧密码相同"}` |
| 强制改密时新密 = 临时密 | newPassword === user.phone.slice(-6) in `/users/me/initial-password-change` | 400 `{message:"新密码不能与初始密码相同"}` |
| 非强制状态使用 initial-password-change | `user.mustChangePassword !== true` in `/users/me/initial-password-change` | 403 `{message:"当前账号无需初始化密码"}` |
| Self-service 注销手机号校对失败 | `phoneConfirmation !== user.phone` | 400 `{message:"手机号校对失败"}` |
| Admin 注销手机号校对失败 | `phoneConfirmation !== target.phone` | 400 |
| 最后一个 SUPER_ADMIN 降级或注销 | `target.role===SUPER_ADMIN` 且 `countSuperAdmins()===1` 且操作会减少 SA 数 | 409 `{message:"系统至少保留 1 个超级管理员"}` |
| 不能改自己的角色 | `target.id === operator.id` in `PATCH /users/:id/role` | 403 |
| Admin 端点禁止自注销 | `target.id === operator.id` in `POST /users/:id/deactivate` | 403 `{message:"自注销请走 /users/me/deactivate"}` |
| ADMIN 越权改角色 | operator=ADMIN 且不满足 `target.role===MEMBER && newRole===ADMIN` | 403 |
| ADMIN 越权使用 SUPER_ADMIN 专属端点 | `@Roles(UserRole.SUPER_ADMIN)` | 403 (RolesGuard) |
| 已注销账号尝试登录 | `User.deactivatedAt != null` in JwtStrategy/RefreshStrategy/login | 401 `{message:"账号已注销"}` |

### 11.2 前端护栏（UX 层）

- 按钮 `disabled`：根据 `useAuthStore` 当前用户角色 + 行目标角色/id 动态计算
- 危险操作二次确认：Ant Modal.confirm（重置密码 / 注销）
- 注销第 2 步输入比对：`onChange` 实时比对后再 enable 按钮
- mustChangePassword 强制跳转：顶层 Effect 监听 authStore 的 mustChangePassword 标记

### 11.3 密码强度校验

后端 DTO 装饰器：
```ts
@IsString()
@MinLength(8)
@Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, { message: "密码需≥8字符且含字母与数字" })
newPassword: string;
```
前端 Ant Form rules 同款正则，UX 提示"请输入≥8位的字母+数字组合"。

## 12. `MustChangePassword` 全局拦截

### 12.1 后端：`MustChangePasswordGuard`

新增 `src/modules/auth/guards/must-change-password.guard.ts`，作为第三个全局 APP_GUARD：

```ts
@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = req.user;
    if (!user) return true; // unauthenticated: let other guards handle
    if (!user.mustChangePassword) return true;
    const route = this.getRouteSignature(ctx); // "PATCH /users/me/password" 等
    if (WHITELIST.has(route)) return true;
    throw new ForbiddenException({ code: "MUST_CHANGE_PASSWORD", message: "请先修改密码" });
  }
}
```

**注册顺序**：`JwtAuthGuard` → `RolesGuard` → `MustChangePasswordGuard`（顺序由 `app.module.ts` 的 providers 数组顺序决定，APP_GUARD 按注册顺序执行）。

**问题**：`user.mustChangePassword` 当前不在 JWT payload 里。解决方式：`JwtStrategy.validate()` 从 DB 拿 User 时，把 `mustChangePassword` 一起塞进 `req.user`。这样就不需要改 JWT payload。

**白名单（`WHITELIST`）**：
- `GET /auth/me`（需让前端拿 user 信息以判断 mustChangePassword 状态）
- `POST /users/me/initial-password-change`（这是用户改完密的唯一出口）

`POST /auth/login` / `POST /auth/logout` / `POST /auth/refresh` 都是 Public 端点，不进入 `MustChangePasswordGuard` 流程，无需出现在白名单里。

**故意不入白名单**：
- `PATCH /users/me/password`（普通改密走 oldPassword 流程，强制改密走 initial-password-change，不混用）
- `POST /users/me/deactivate`（防止用户绕过强制改密直接注销）
- 所有业务端点（`/employees/*` 等）

### 12.2 前端：axios 拦截器 + Effect

`services/http.ts` 的响应拦截器加一条：

```ts
if (error.response?.status === 403 && error.response?.data?.code === "MUST_CHANGE_PASSWORD") {
  window.location.assign("/force-password-change");
}
```

同时 `App.tsx` 顶层 useEffect 监听 `authStore.mustChangePassword`：若 true 且 `location.pathname !== "/force-password-change"` 则 `navigate("/force-password-change", { replace: true })`。

### 12.3 清除时机

用户在 `/force-password-change` 提交新密 → `POST /users/me/initial-password-change` 成功 → `UsersService.initialChangePassword()` 内部**原子完成**：
1. 校验 `user.mustChangePassword === true`（否则 403）
2. 校验新密 ≥8 + 字母 + 数字 + 不等于 `phone.slice(-6)`
3. 更新 `passwordHash` + 同步置 `mustChangePassword = false`
4. 写审计 `user.change_password`

前端收到 200 后 `authStore.setSession({...current, mustChangePassword: false})` + `navigate("/")`。同时通过 `GET /auth/me` 重新拉一次 user 信息保底。

## 13. 验收标准

映射到 `docs/spec/02-Phase1-员工与用户管理.md` §11 验收项中与 Phase 1B 相关的条目：

- ✅ **用户设置页能按角色显示不同权限区**：SUPER_ADMIN 看到 3 个按钮、ADMIN 看到 1 个、MEMBER 不看到权限区
- ✅ **超级管理员可进入全部用户管理页**：`/users` 路由访问 + `/user-settings` 点按钮跳过去
- ✅ **重置密码和注销账号都具备明确二次确认流程**：
  - 重置密码：`ResetPasswordDialog` 显示目标手机号 + 二次确认
  - 注销账号：两步对话框（确认 → 再输手机号比对）

同时隐含验收：
- ✅ 新账号首次登录强制改密
- ✅ admin 重置后目标账号首次登录强制改密
- ✅ 改手机号需当前密码
- ✅ 改密需旧密 + 新密强度符合
- ✅ 角色升降护栏：不能改自己、不能删最后 SA
- ✅ 注销后 Guard 拦截

**验证方法**（沿用 Phase 1A 的"人工 curl + 浏览器"模式，Phase 1B 也不引入 test runner）：
- 每个 API 手动 curl 验 happy path + 护栏 response
- 浏览器跑完整流程：新 SA 登录 → 注册 MEMBER → MEMBER 登录 → 强制改密 → MEMBER 可自 self-service → SA 升 MEMBER→ADMIN → ADMIN 进 /users 只能升 MEMBER → SA 降 ADMIN→MEMBER → SA 注销测试用户 → 注销用户再 login 401
- DB 检查：`SELECT * FROM "AuditLog" WHERE action LIKE 'user.%' ORDER BY "createdAt" DESC` 验所有审计落盘

## 14. 范围外 / Deferred

明确 **不在 Phase 1B 做**：

| 项 | 为什么推迟 | 未来升级路径 |
|---|---|---|
| SMS 验证码改手机号 | 项目无 SMS infra | 引入阿里云/腾讯云 SMS SDK 后改为"验证码替代当前密码" |
| 重新激活已注销账号 | Q11(X) 选了单向终态 | 加 `PATCH /users/:id/reactivate` 端点 + `/users` 已注销 tab "重新激活"按钮 |
| 已注销账号手机号释放 | Q1(B) 保 unique | 改 `@@index` 为 partial unique `WHERE deactivatedAt IS NULL` + raw migration |
| User↔Employee 强绑定 | Q8(B) 不绑 | schema 加 `User.employeeId FK`；注册流程必须选员工 |
| 分钟级"最近访问时间" | Q9(A) 复用 lastLoginAt | 加 `lastActivityAt` + Guard 内节流写（5min 粒度） |
| Refresh token blocklist | Q11(A) 用 Guard 检查 | 加 `TokenBlocklist` 表；refresh 校验 jti |
| 登录失败次数锁定 | Phase 1B spec 未要求 | 加 `failedLoginCount + lockedUntil` 字段 + login service 护栏 |
| 用户导出（Excel） | Phase 1B spec 未要求 | 复用 Phase 1A 的 exceljs 模式 |

## 15. 已知 Trade-offs

1. **注销生效最大延迟 = access token 剩余 TTL（≤15 min）**：Guard 只在每次请求时检查 `deactivatedAt`，旧 access token 过期前仍可被使用。对内部中台可接受（高威胁场景请升级到 §14 token blocklist）。

2. **mustChangePassword 期间 access token 未失效**：用户持有"上一次登录"的 access token 理论上可请求白名单外的接口——但 Guard 会 403 拦截，等同于强制改密。不过需要额外注意：如果 JwtStrategy 在 validate 时没从 DB 拿到最新 `mustChangePassword`（而是用了 JWT payload），就会漏拦截。**方案**：JwtStrategy 必须每请求都查 DB（Phase 0 已是如此），把 `mustChangePassword` 塞进 `req.user`。

3. **审计写在业务 transaction 外**（延续 Phase 1A）：罕见情形下 update + audit 可能出现 update 成功但 audit 写失败，导致日志缺失。记录为已知风险，Phase 1B 不处理。

4. **已注销账号的手机号永久占用 unique 槽位**：短期手段是 SUPER_ADMIN 手动 SQL 改旧行的 phone；长期方案见 §14。

5. **角色降级无二次确认**：spec §10 只点名重置密码 + 注销账号要二次确认。角色降级只有 `Modal.confirm` 一层。若运营反馈误操作多，可补加第二步。

6. **mustChangePassword 强制跳转依赖前端检测**：若用户开多 tab 且一 tab 改密完成、另一 tab 的 authStore 不感知，可能仍在"强制页"卡着。Phase 1B 接受——用户刷新即可，因为 `/auth/me` 会返回最新 `mustChangePassword=false`。

---

## 附录 A：文件清单（实现时对照用）

### 后端（`apps/api`）

**新增**：
- `src/modules/users/users.controller.ts`
- `src/modules/users/dto/register-user.dto.ts`
- `src/modules/users/dto/change-phone.dto.ts`
- `src/modules/users/dto/change-username.dto.ts`
- `src/modules/users/dto/change-password.dto.ts`
- `src/modules/users/dto/initial-change-password.dto.ts`
- `src/modules/users/dto/update-role.dto.ts`
- `src/modules/users/dto/deactivate-user.dto.ts`
- `src/modules/users/dto/list-users.dto.ts`
- `src/modules/auth/guards/must-change-password.guard.ts`

**修改**：
- `prisma/schema.prisma`（+2 字段）
- `src/modules/users/users.module.ts`（补 controller + 依赖 AuditLogsModule）
- `src/modules/users/users.service.ts`（+8 方法）
- `src/modules/auth/auth.service.ts`（login/refresh 透传 mustChangePassword）
- `src/modules/auth/strategies/jwt.strategy.ts`（deactivatedAt 护栏 + 附带 mustChangePassword）
- `src/modules/auth/strategies/refresh.strategy.ts`（deactivatedAt 护栏）
- `src/modules/auth/auth.controller.ts`（login/refresh/me 响应 +mustChangePassword）
- `src/modules/auth/auth.types.ts`（可选补类型）
- `src/app.module.ts`（注册 MustChangePasswordGuard）

### 前端（`apps/web`）

**新增**：
- `src/layouts/UserSettingsLayout.tsx`
- `src/features/user-settings/UserSettingsPage.tsx`
- `src/features/user-settings/ChangePhoneModal.tsx`
- `src/features/user-settings/ChangeUsernameModal.tsx`
- `src/features/user-settings/ChangePasswordModal.tsx`
- `src/features/user-settings/DeactivateSelfModal.tsx`
- `src/features/users/UsersListPage.tsx`
- `src/features/users/RegisterUserModal.tsx`
- `src/features/users/ResetPasswordDialog.tsx`
- `src/features/users/DeactivateUserModal.tsx`
- `src/features/users/RoleDropdown.tsx`
- `src/features/users/hooks/useUsers.ts`
- `src/features/users/hooks/useUserMutations.ts`
- `src/features/users/types.ts`
- `src/features/auth/ForcePasswordChangePage.tsx`
- `src/services/users.ts`

**修改**：
- `src/router.tsx`（+3 路由）
- `src/layouts/AppShell.tsx`（Popover 按钮跳转）
- `src/stores/authStore.ts`（`mustChangePassword` 字段）
- `src/services/http.ts`（403/MUST_CHANGE_PASSWORD 拦截）
- `src/features/auth/types.ts`（可选类型补）
- `src/App.tsx`（全局 Effect 监听 mustChangePassword）

## 附录 B：预计任务数（给 writing-plans 参考）

大致按"文件清单 + bite-sized verify-then-commit"拆，预计 **18-22 个任务**，规模略小于 Phase 1A（23 任务，但 1A 有 Excel 导入 + MinIO 这两个重头）。节奏可参考：

1. Schema 变更 + prisma push（1 任务）
2. UsersService 扩展（2-3 任务：self + admin 分开）
3. UsersController + DTOs + 护栏（3-4 任务）
4. Auth 三处微调 + MustChangePasswordGuard（2 任务）
5. 前端 UserSettingsLayout + 路由（1 任务）
6. 前端 services/users + hooks（1 任务）
7. 前端 `/user-settings` 页 + 4 个 self Modal（3-4 任务）
8. 前端 `/users` 页 + 3 个 admin Modal + RoleDropdown（4-5 任务）
9. 前端 ForcePasswordChangePage + 全局拦截（1 任务）
10. 文档更新 + 端到端 smoke walkthrough（1-2 任务）
