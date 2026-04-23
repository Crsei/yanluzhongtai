# 技术选型与架构

## 1. 技术栈

### 1.1 前端

- `React`
- `TypeScript`
- `Vite`
- `React Router`
- `Ant Design`
- `TanStack Query`
- `Zustand`
- `dayjs`

选择原因：

- 该项目是典型的内部管理中台，页面以表格、表单、弹窗、权限、筛选、分页为主
- `Ant Design` 能直接覆盖大部分中后台交互场景，减少重复造轮子
- `React + TypeScript` 适合处理复杂状态、权限路由和可复用组件
- `Vite` 适合从零启动的中小型到中型项目，开发反馈快

### 1.2 后端

- `NestJS 10`
- `TypeScript`
- `Prisma 5`
- `PostgreSQL 16`
- `JWT`（短期 `accessToken`）
- `HttpOnly Refresh Cookie`
- `class-validator` / `class-transformer`（DTO 校验）
- `ExcelJS`（Excel 模板生成 / 解析）
- `@nestjs/schedule`（Phase 6 审计日志 180 天清理 cron）

选择原因：

- 模块划分明确，适合员工、学生、课程、薪酬、日志这类边界清晰的业务域
- `NestJS` 的模块化和依赖注入更适合长期维护
- `Prisma` 适合快速建立结构化数据模型，并支撑后续迁移管理
- `PostgreSQL` 适合事务型后台系统，结构化字段、关联关系、多条件检索都更稳
- 认证采用“短期 Access Token + Refresh Token”分层方案，更适合内部中台这类高权限后台场景

### 1.3 文件与对象存储

- `MinIO`

用途：

- 存储简历、合同、成绩单、课程附件、模板文件等上传对象

### 1.4 部署

- `Docker Compose`
- `Nginx`

选择原因：

- 当前项目属于单业务系统，首版更适合单机或单服务器部署
- `Docker Compose` 足以覆盖前端、后端、数据库、对象存储的编排
- `Nginx` 用于托管前端静态资源并反向代理 `/api`

## 2. 架构分层

### 2.0 认证与权限基线（已落地）

Phase 0 的认证方案以"体验统一"和"最小可接受安全边界"为目标，约定如下：

- Access Token：
  - 作为 `Bearer` token 使用
  - 有效期短，当前基线 `15 分钟`
  - 前端只放内存 + `sessionStorage`
- Refresh Token：
  - 放 `HttpOnly Cookie`（`REFRESH_COOKIE_NAME`，默认 `yanlu_rt`）
  - 勾选"保留登录状态"时可保留较长时间
  - 未勾选时采用浏览器会话期
- 前端恢复会话时优先尝试现有 access token；401 自动回退 `/auth/refresh` 再重试
- 不采用"30 天 Bearer token + localStorage"方案

权限边界（全部已在代码中强制）：

- 访客（未登录）：只允许 `/sop`、`/about`、公开资源 `/api/public/sop-links`
- 一般成员（`MEMBER`）：不可访问 `/payroll` 与 `/logs`
- 管理员（`ADMIN`）：可访问全部业务模块；`/users` 中只能把 `MEMBER` 升为 `ADMIN`
- 超级管理员（`SUPER_ADMIN`）：全权；含注册 / 重置密码 / 注销 / 任意角色调整

页面级权限：`apps/web/src/features/auth/RequireAuth.tsx` + `RequireRole.tsx`。
按钮级权限：`useAuthStore` 在组件内判断 `user.role`。
API 级权限：`@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)` + 全局 `RolesGuard`；公开端点用 `@Public()`；首次登录强制改密由 `MustChangePasswordGuard` 白名单放行 `GET /auth/me` 和 `POST /users/me/initial-password-change`。

### 2.1 前端分层

- `layouts/`：`AppShell`（业务模块壳）+ `UserSettingsLayout`（用户设置 / 用户管理独立标签页）
- `pages/`：`LoginPage`、`ModulePage`（阶段过渡占位，逐步替换为实页）
- `config/navigation.tsx`：侧边栏 7 项导航（员工 / 学生 / 课程 / 薪酬 / 数据表 / SOP / 关于）
- `features/auth/`：登录、会话恢复、`RequireAuth`、`RequireRole`、`UnauthorizedPage`、`ForcePasswordChangePage`
- `features/user-settings/` / `features/users/`：Phase 1B 自助设置 + 管理员用户管理
- `features/employees/` / `students/` / `course-outlines/` / `courses/` / `payroll/`：Phase 1A–5 业务模块
- `features/quick-links/` / `about/` / `audit-logs/`：Phase 6 三项
- `components/`：跨模块共享组件（`EmployeePicker` 等）
- `stores/authStore.ts`：Zustand 管理会话 / 用户 / hydrated / rememberMe
- `services/http.ts`：`fetch` 封装；统一处理 base URL、Bearer、401 → refresh → retry、403 `MUST_CHANGE_PASSWORD` 拦截跳转
- `services/<domain>.ts`：每域一个 API wrapper，被 `features/<domain>/hooks/` 的 TanStack Query hook 消费
- `constants/`：`dictionaries`（镜像 api）、`about`（Phase 6 关于页配置）

### 2.2 后端分层

- `src/main.ts`：启动入口 + `/api` 前缀 + cookie-parser + CORS（`APP_ORIGIN`）
- `src/app.module.ts`：挂 `ScheduleModule.forRoot()` + `ConfigModule` + 所有业务模块 + 三个全局 `APP_GUARD`
- `src/config`：环境变量必填清单校验
- `src/common/`：
  - `id-sequence/`：`@Global()` 按 `(kind, year)` 复合主键累加的编号分配器
  - `course-no/`：Phase 4 课程编号拼装 + 状态派生 + 学时换算（纯函数）
  - `dictionaries.ts`：枚举白名单（与 web 镜像，任何改动两边都要改）
- `src/prisma`：`@Global()` `PrismaService`
- `src/health`：`GET /api/health` 烟测端点
- `src/modules/auth`：登录 / 刷新 / 登出 / me；`@Public()` / `@Roles()` / `@CurrentUser()` 装饰器；`JwtAuthGuard` / `RolesGuard` / `MustChangePasswordGuard` 三重 guard
- `src/modules/users`：Phase 1B 自助 + admin
- `src/modules/storage`：`@Global()` MinIO presign；启动时自动建 bucket
- `src/modules/audit-logs`：`@Global()` 写侧 `AuditLogsService.record()` + 读侧 `AuditLogsController` + `AuditLogsRetentionService`（03:00 每日清 180 天）
- `src/modules/employees / students / course-outlines / courses / payroll / quick-links`：业务模块；每个都是 controller + service（+ import service where applicable）+ `dto/` 文件夹

## 3. 数据与服务关系

- `web` 负责 PC/移动端中台页面
- `api` 负责鉴权、权限控制、业务逻辑、文件元数据、日志记录
- `db` 负责结构化数据存储
- `minio` 负责附件与上传文件

数据流：

1. 浏览器访问 `web`
2. `web` 调用 `/api`
3. `api` 读写 `PostgreSQL`
4. `api` 上传/读取 `MinIO`

认证流补充：

1. 用户在 `web` 登录，调用 `POST /api/auth/login`
2. `api` 返回短期 `accessToken`，并设置 `HttpOnly refresh cookie`
3. `web` 仅保存 `accessToken` 和用户信息
4. `accessToken` 过期后，`web` 通过 `POST /api/auth/refresh` 续签
5. 登出时调用 `POST /api/auth/logout`，由后端清除 refresh cookie

## 4. 为什么适合当前 spec

这个项目的核心不是高并发，而是：

- 多角色权限
- 多模块中后台 CRUD
- 复杂表单
- 课程、学生、老师、薪酬之间的联动关系
- Excel 导入
- 日志审计
- PC 与移动端兼容

所以当前技术栈优先考虑的是：

- 工程可维护性
- 中后台交互效率
- 数据模型稳定性
- 部署成本可控
- 权限边界从第一阶段就可被明确执行
- 避免长期高权限 Bearer token 在前端持久化存储
