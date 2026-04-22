# 部署文档

## 1. 部署方式

当前推荐采用单机 `Docker Compose` 部署：

- `web`：前端静态站点 + Nginx
- `api`：NestJS 服务
- `db`：PostgreSQL
- `minio`：对象存储

适用场景：

- 开发环境
- 测试环境
- 小规模正式环境

## 2. 服务器前置条件

- Linux 服务器一台
- 已安装 `Docker`
- 已安装 `Docker Compose` 或 `docker compose` 插件
- 已开放：
  - `80`
  - `3000`（如需直接访问 API）
  - `5432`（如需远程数据库运维）
  - `9000`
  - `9001`

## 3. 环境变量

先复制根目录环境变量：

```bash
cp .env.example .env
```

至少需要修改：

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `POSTGRES_PASSWORD`
- `MINIO_ROOT_PASSWORD`
- `APP_ORIGIN`
- `SEED_SUPER_ADMIN_PHONE`
- `SEED_SUPER_ADMIN_USERNAME`
- `SEED_SUPER_ADMIN_PASSWORD`

本地开发还建议复制：

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

认证相关环境变量基线：

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `REFRESH_COOKIE_NAME`
- `APP_ORIGIN`

首个超级管理员初始化变量：

- `SEED_SUPER_ADMIN_PHONE`
- `SEED_SUPER_ADMIN_USERNAME`
- `SEED_SUPER_ADMIN_PASSWORD`

## 4. 本地开发启动

### 4.1 安装依赖

```bash
pnpm install
```

### 4.2 启动数据库和 MinIO

```bash
docker compose up -d db minio
```

### 4.3 推送 Prisma schema

```bash
pnpm prisma:push
```

### 4.4 首次创建超级管理员

```bash
pnpm prisma:seed
```

### 4.5 启动后端

```bash
pnpm dev:api
```

### 4.6 启动前端

```bash
pnpm dev:web
```

默认地址：

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:3000/api/health`
- MinIO Console：`http://localhost:9001`

认证调试补充：

- 登录成功后，浏览器应拿到：
  - 短期 `accessToken`
  - 一个 `HttpOnly refresh cookie`
- 刷新页面时，应优先尝试恢复现有会话，而不是立刻回登录页
- 会话过期后，前端应走统一未授权态，不应强制硬跳转破坏壳层布局

## 5. Compose 部署

### 5.1 构建并启动

```bash
docker compose up --build -d
```

### 5.2 初始化数据库结构

首次部署后执行：

```bash
docker compose run --rm api pnpm prisma:push
```

### 5.3 首次创建超级管理员

```bash
docker compose run --rm api pnpm prisma:seed
```

### 5.4 查看日志

```bash
docker compose logs -f web
docker compose logs -f api
```

### 5.5 停止服务

```bash
docker compose down
```

## 6. 生产建议

- 数据库和 MinIO 目录挂载到持久化磁盘
- 把 `.env` 放到受控目录，不要提交到仓库
- 使用强密码和长随机 `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- 正式环境建议在服务器前再挂一层外部 Nginx 或云负载均衡，并配置 HTTPS
- MinIO 不建议直接暴露公网，优先内网访问
- 后续上线时，将 `prisma db push` 切换为正式 migration 流程
- 若正式环境使用 refresh cookie，必须结合 HTTPS、`HttpOnly`、`Secure`、合适的 `SameSite` 策略
- `APP_ORIGIN` 需要与前端实际访问域名保持一致，否则 cookie 与 CORS 会出现不一致

## 7. 备份建议

- PostgreSQL：按天备份
- MinIO：按对象目录周期备份
- `.env`：单独加密保存

## Phase 1A — 员工与对象存储

### 首次启动后

1. 确认环境变量包含 `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_USE_SSL` / `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` / `MINIO_BUCKET`（默认在 `.env.example`）。
2. API 启动时会自动创建 `MINIO_BUCKET`（默认 `yanlu-assets`）。如果 MinIO 不可达，员工模块、附件简历、Excel 导入都会 fallback 到 500。
3. Excel 导入流程：浏览器先 `POST /api/storage/uploads/sign` 拿 presign URL → 直接 `PUT` 到 MinIO → 调 `/api/employees/import/dry-run` 校验 → `/api/employees/import/commit` 入库。

### 删除员工的关联保护

`DELETE /api/employees/:id` 在以下任一字段引用该员工的 `jobNo` 时返回 `409`：

- `PayrollSettlement.employeeJobNo`
- `Course.actualTeacherJobNo`
- `Student.counselorJobNo`
- `Student.plannerJobNo`

错误文案："该员工有关联学生/薪酬/课程，不可删除，请将状态改为已离职"。

### 工号 / 学号 / 课程编号生成

由 `IdSequenceService` 统一管理；`IdSequence` 表按 `(kind, year)` 复合主键累加，删除不回收序号。Phase 1A 只使用 `kind = 'employee'`。

## Phase 1B — 用户与账号管理

### Schema 变更

`User` 表新增两列：

- `deactivatedAt timestamp(3) NULL` — 软删除标记。Guard 在每次请求验证；登录与 refresh 同样拒绝。
- `mustChangePassword boolean DEFAULT false` — 首次登录强制改密标记。Admin 重置或注册新账号时置 `true`，用户走 `/users/me/initial-password-change` 后置 `false`。

### 端点全景

Self-service（任意已登录用户）：

- `PATCH /api/users/me/phone`：要求 `currentPassword`，受 `User.phone` unique 约束（重复 → 409）。
- `PATCH /api/users/me/username`：纯改名。
- `PATCH /api/users/me/password`：旧密 + 新密；新密 ≥8 字符且含字母与数字，且不等于旧密。`MustChangePasswordGuard` 在 `mustChangePassword=true` 时拒绝，强制走 `initial-password-change`。
- `POST /api/users/me/initial-password-change`：仅在 `mustChangePassword=true` 时可用。新密同强度规则，且不等于"phone 后 6 位"。成功时同时清 `mustChangePassword`。
- `POST /api/users/me/deactivate`：要求 `phoneConfirmation` 与当前账号手机号完全相同。

Admin（SUPER_ADMIN，部分允许 ADMIN）：

- `GET /api/users`：分页 + `keyword` (phone/username ILIKE) + `includeDeactivated`，排序 `lastLoginAt DESC NULLS LAST, createdAt DESC`。
- `POST /api/users`（仅 SUPER_ADMIN）：注册账号。初始密码 = 手机号后 6 位，`mustChangePassword=true`，响应体带 `initialPassword`。
- `PATCH /api/users/:id/role`（SUPER_ADMIN 全权；ADMIN 仅可 `MEMBER → ADMIN`）：不能修改自己的角色；最后一个 SUPER_ADMIN 不可降级（→ 409）。
- `POST /api/users/:id/reset-password`（仅 SUPER_ADMIN）：重置为手机号后 6 位 + `mustChangePassword=true`，响应体带 `tempPassword`（一次性展示）。
- `POST /api/users/:id/deactivate`（仅 SUPER_ADMIN）：要求 `phoneConfirmation`；不能注销自己（要求走 `/me/deactivate`）；最后一个 SUPER_ADMIN 不可注销。

### 全局 `MustChangePasswordGuard`

第三个 `APP_GUARD`，紧随 `JwtAuthGuard`、`RolesGuard`。当 `req.user.mustChangePassword === true` 时，仅放行白名单：

- `GET /auth/me`
- `POST /users/me/initial-password-change`

其他路径返回 `403 { code: "MUST_CHANGE_PASSWORD" }`，前端 `services/http.ts` 拦截器收到后跳转 `/force-password-change`。

### 注销生效语义

- `JwtStrategy` / `RefreshStrategy` 在 `validate()` 时若 `User.deactivatedAt != null` → `UnauthorizedException("账号已注销")`。
- `AuthService.login()` 同样在 `findByPhone` 后检查（避免登录绕过 Guard）。
- 已签发的 access token 在过期前（最长 15 分钟）仍可用——这是已知 trade-off（spec §15）。Phase 1B 不引入 token blocklist。

## Phase 2 — 学生模块

### Schema 变更

- 新增 Prisma enum `ServiceStatus`；`Student.serviceStatus` 从 `String` 升级为 enum，默认 `NOT_STARTED`。
- 新增字段：`Student.transcriptKeys`（成绩单附件）、`overallPlanText`（总规划文本）、`policyText`（加分政策文本）、`attachmentKeys`（通用附件/图片）。
- 新增索引 `@@index([enrollmentYear])`（年级计算 + 高级搜索按学号年份前缀）。
- 首次部署：`pnpm prisma:generate && pnpm prisma:push`（沿用 Phase 1A 工作流）。

### MinIO 前缀白名单新增

后端 `common/dictionaries.ts::STORAGE_FOLDERS` 白名单追加两项：

- `students/attachments/` — 学生详情附件（成绩单、课表、加分政策 PDF、通用文件 / 图片）
- `students/import-batches/` — 学生 Excel 导入批次文件；保留做审计追溯。生产环境建议对 `students/import-batches/*` 设置 7-30 天的 bucket lifecycle 规则自动清理。

### 删除学生的关联保护

`DELETE /api/students/:id` 若学生已有任意 `Enrollment` 记录 → 返回 `409`：

> 该学生已有选课记录，不可删除。请将服务状态改为服务完成或取消/终止后保留档案。

### 学号分配

`IdSequenceService` 复用 Phase 1A 的表，新增 `kind = 'student'`；格式 `YYNNNN`（YY = 入学年份后两位，NNNN 四位左补零）。删除不回收。单 `enrollmentYear` 支持 9999 条，超出后 `NNNN` 自然扩展为 5 位。

### 学生审计日志

新增 action：`student.create` / `student.update` / `student.delete`；`targetType = "student"`。
`AuditLogsService.record` 泛化为：`action === "update" || action.endsWith(".update")` 时走字段级拆条，对已上线的 `employee.update`（Phase 1A）零影响。
Excel 导入每行独立写一条 `student.create`，`after` 中附 `__importBatchKey` 便于按批次回溯。
