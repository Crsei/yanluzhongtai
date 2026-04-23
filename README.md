# 研录教学管理中台

面向企业内部使用的教学管理 Web 中台，基于 `pnpm monorepo`：

- `apps/web`：React 18 + TypeScript + Vite + Ant Design 5 + TanStack Query + Zustand
- `apps/api`：NestJS 10 + Prisma 5 + PostgreSQL + JWT + class-validator
- `docker-compose.yml`：本地与单机部署编排（web / api / db / minio）
- `docs/spec`：需求与分阶段规格（Phase 0–7）
- `docs/technical`：技术选型、目录结构、部署说明
- `docs/superpowers`：每阶段的实现设计与实施计划

## 已上线能力

| 阶段 | 范围 | 主要模块 / 路由 |
| --- | --- | --- |
| **Phase 0** | 认证与权限基线 | `/login`、`/user-settings`、`/force-password-change`、`JwtAuthGuard` + `RolesGuard` + `MustChangePasswordGuard`、访客 / 一般成员 / 管理员 / 超级管理员四档 |
| **Phase 1A** | 员工管理 | `/employees`、Excel 导入（presign + dry-run + commit）、MinIO 附件、工号 `YYNNN` 自动分配 |
| **Phase 1B** | 用户管理 | `/users`、自助改手机 / 用户名 / 密码、注销、管理员注册 / 重置 / 角色调整、首次登录强制改密 |
| **Phase 2** | 学生管理 | `/students`、学号 `YYNNNN`、高级搜索（URL 可分享）、`EmployeePicker` 共享组件、多处附件上传 |
| **Phase 3** | 课程大纲 | `/courses/outline`、大纲版本切换、Excel 导入 |
| **Phase 4** | 课程详情与选课 | `/courses/list`、`/courses/advanced-search`、课程编号 `TTKKYYNNN` 自动分配、状态派生、学时自动换算、`StudentPicker` |
| **Phase 5** | 薪酬管理 | `/payroll`（仅管理员 / 超管）、按老师+年月聚合、自动行 + 手动补录行并列、单位课时费首结 + 历史一致性校验 |
| **Phase 6** | 数据表 / SOP / 关于 / 日志 | `/links`（登录）、`/sop`（访客）、`/about`（访客）、`/logs`（仅管理员 / 超管）；QuickLink CRUD + 拖拽排序 + NAVIGATE / COPY / DOWNLOAD 三种 kind；审计日志 180 天自动清理 |

Phase 7（移动端适配）尚未开始；`AppShell` 已基于 `Grid.useBreakpoint` 做了响应式 sider / drawer 切换，待 Phase 7 做页面级调优。

## 常用路由

| 路径 | 谁能访问 |
| --- | --- |
| `/`（默认重定向） | 登录后进入首页，访客跳 SOP |
| `/login` / `/force-password-change` | 所有人 |
| `/user-settings`、`/users` | 登录用户；`/users` 仅超管 / 管理员 |
| `/employees`、`/students`、`/courses/*` | 登录用户（`/courses/outline` 仅超管 / 管理员可编辑）|
| `/payroll` | 仅超管 / 管理员 |
| `/links` | 登录用户 |
| `/sop`、`/about` | 所有人（含访客） |
| `/logs` | 仅超管 / 管理员 |

## 快速开始

```bash
# 1. 环境变量
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 2. 安装依赖
pnpm install

# 3. 启动 Postgres + MinIO（API 启动时依赖 MinIO；SOP 以外所有页都依赖 Postgres）
docker compose up -d db minio

# 4. 推送 Prisma schema
pnpm prisma:push

# 5. 首次部署创建超级管理员
pnpm prisma:seed

# 6. 两个终端分别起前后端
pnpm dev:api   # :3000，/api 前缀
pnpm dev:web   # :5173
```

默认开发账号由 `apps/api/.env` 的 `SEED_SUPER_ADMIN_*` 控制。随后登录中台修改初始密码即可。

## Docker Compose 单机部署

```bash
cp .env.example .env
docker compose up --build -d
docker compose run --rm api pnpm prisma:push
docker compose run --rm api pnpm prisma:seed
```

生产部署的更细颗粒度（migration 切换、HTTPS、备份、`APP_ORIGIN` 与 refresh cookie 配合）见 [docs/technical/deployment.md](./docs/technical/deployment.md)。

## 文档入口

- 需求与分阶段规格：[docs/spec/README.md](./docs/spec/README.md)（Phase 0–7 的业务 spec）
- 每阶段实现设计：[docs/superpowers/specs/](./docs/superpowers/specs/)
- 每阶段实施计划：[docs/superpowers/plans/](./docs/superpowers/plans/)
- 技术栈与架构：[docs/technical/stack-and-architecture.md](./docs/technical/stack-and-architecture.md)
- 脚手架与目录结构：[docs/technical/scaffold-and-structure.md](./docs/technical/scaffold-and-structure.md)
- 前端组件约定：[docs/technical/frontend-components.md](./docs/technical/frontend-components.md)
- 部署与各 Phase 运维要点：[docs/technical/deployment.md](./docs/technical/deployment.md)
- 数据库模型：[docs/db/schema-design.md](./docs/db/schema-design.md)
- API 端点一览：[docs/api/openapi-spec.md](./docs/api/openapi-spec.md)
- 访问控制：[docs/security/access-control.md](./docs/security/access-control.md)

## 工程约束摘要

- 包管理：`pnpm@9`（`pnpm-workspace.yaml`）
- 暂无 test / lint 脚本；每阶段以 `pnpm --filter @yanlu/api build` / `pnpm --filter @yanlu/web build` + `curl` smoke + 手工浏览器走查作为验收
- Schema 变更当前走 `prisma db push`；切换到 `prisma migrate` 放在正式上线前
- 中文 UI 与 spec 文档；`identifier / 类型名 / 注释` 使用英文
- 编号不回收：员工 `YYNNN` / 学生 `YYNNNN` / 课程 `TTKKYYNNN` 由 `IdSequence` 表统一保序
- 审计日志：新增 / 编辑 / 删除 / 结算 / 权限变更 / 注册 / 注销 / QuickLink CRUD 全部留痕，180 天自动清理
