# 脚手架与目录结构

## 1. 目录树

```text
.
├─ apps
│  ├─ api
│  │  ├─ prisma
│  │  │  ├─ schema.prisma
│  │  │  └─ seed.ts
│  │  ├─ src
│  │  │  ├─ common
│  │  │  │  ├─ course-no/             # Phase 4 课程编号 + 状态 / 学时派生
│  │  │  │  ├─ id-sequence/           # 统一的 YYNNN / YYNNNN / TTKKYYNNN 分配器
│  │  │  │  └─ dictionaries.ts        # enum / 枚举白名单（与 web 镜像）
│  │  │  ├─ config/
│  │  │  ├─ health/
│  │  │  ├─ modules
│  │  │  │  ├─ auth/                  # JWT + Refresh + Roles + MustChangePassword 三重 guard
│  │  │  │  ├─ users/                 # Phase 1B 用户与账号管理
│  │  │  │  ├─ storage/               # @Global() MinIO presign
│  │  │  │  ├─ audit-logs/            # @Global() 写侧 + 读侧 controller + retention cron
│  │  │  │  ├─ employees/
│  │  │  │  ├─ students/
│  │  │  │  ├─ course-outlines/
│  │  │  │  ├─ courses/
│  │  │  │  ├─ payroll/
│  │  │  │  └─ quick-links/           # Phase 6 数据表 / SOP 卡片
│  │  │  ├─ prisma/                   # @Global() PrismaService
│  │  │  └─ main.ts
│  │  ├─ .env.example
│  │  ├─ Dockerfile
│  │  ├─ nest-cli.json
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  └─ web
│     ├─ public
│     │  └─ templates/                # Phase 6 DOWNLOAD 类 QuickLink 的静态资源
│     ├─ src
│     │  ├─ components/               # EmployeePicker 等跨模块共享组件
│     │  ├─ config/                   # navigation 等
│     │  ├─ constants/                # dictionaries（镜像 api）、about
│     │  ├─ features
│     │  │  ├─ auth/
│     │  │  ├─ user-settings/
│     │  │  ├─ users/
│     │  │  ├─ employees/
│     │  │  ├─ students/
│     │  │  ├─ course-outlines/
│     │  │  ├─ courses/
│     │  │  ├─ payroll/
│     │  │  ├─ quick-links/
│     │  │  ├─ about/
│     │  │  └─ audit-logs/
│     │  ├─ layouts/                  # AppShell / UserSettingsLayout
│     │  ├─ pages/                    # LoginPage / ModulePage（占位，逐步替换为实页）
│     │  ├─ services/                 # http / employees / students / courses / payroll / quickLinks / auditLogs / storage
│     │  ├─ stores/                   # authStore（zustand）
│     │  ├─ App.tsx
│     │  ├─ main.tsx
│     │  ├─ router.tsx
│     │  └─ styles.css
│     ├─ .env.example
│     ├─ Dockerfile
│     ├─ index.html
│     ├─ package.json
│     └─ vite.config.ts
├─ docs
│  ├─ api/                            # openapi 索引
│  ├─ architecture/                   # 系统总览 / 目录布局
│  ├─ db/                             # schema 设计索引
│  ├─ deployment/                     # compose 索引
│  ├─ operations/                     # runbook 占位
│  ├─ security/                       # 访问控制索引
│  ├─ spec/                           # Phase 0–7 业务 spec
│  ├─ superpowers
│  │  ├─ specs/                       # 每阶段实现设计
│  │  └─ plans/                       # 每阶段实施计划
│  └─ technical/                      # 本目录：技术栈、目录结构、部署说明、前端组件
├─ infra
│  └─ nginx
│     └─ web.conf
├─ packages/                          # 预留
├─ .env.example
├─ docker-compose.yml
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

## 2. 每层职责

### 2.1 `apps/web`

职责：
- 中台 Web 界面：员工 / 学生 / 课程 / 薪酬 / 数据表 / SOP / 关于 / 日志
- 路由与模块导航，`AppShell` + `UserSettingsLayout` 两套壳
- 表格 / 表单 / 弹窗 / 筛选 / Excel 导入 drawer 等中后台交互
- PC + 移动端响应式（Phase 7 将在此基础上做深度适配）
- `RequireAuth` / `RequireRole` 路由级权限 + `useAuthStore` 按钮级权限
- 会话恢复：`authStore.hydrate()` 在 `App.tsx` 启动时尝试 `accessToken` 或 `/auth/refresh`

### 2.2 `apps/api`

职责：
- 登录 / 刷新 / 登出 / me（`modules/auth`）
- 三重全局 Guard：`JwtAuthGuard` → `RolesGuard` → `MustChangePasswordGuard`
- 业务模块：员工 / 学生 / 课程大纲 / 课程 / 薪酬 / 快捷入口
- Excel 导入：`employees-import.service` / `students-import.service` / `course-outlines-import.service` / `courses-import.service`
- 文件上传元数据：`modules/storage` 的 presign
- 统一编号分配：`common/id-sequence`（`employee` / `student` / `course:TTKKYY` 三类 kind）
- 审计：`audit-logs` 写侧 `record()` + 读侧 controller + `AuditLogsRetentionService`（03:00 每日清 180 天）

### 2.3 `infra/nginx`

职责：
- 前端静态资源托管
- `/api` 反向代理到后端服务

### 2.4 `docs/spec`

职责：
- 保存需求拆解和 Phase 0–7 的阶段化规格（业务侧的 source of truth）

### 2.5 `docs/technical`

职责：
- 保存技术栈、目录结构、部署方案、前端组件约定等工程文档

### 2.6 `docs/superpowers`

职责：
- `specs/YYYY-MM-DD-<topic>-design.md`：每阶段实现设计 / 决策记录
- `plans/YYYY-MM-DD-<feature>.md`：每阶段实施计划（任务拆解 + 验收命令）

### 2.7 `packages`

预留给未来的共享包（共享类型 / ESLint 配置 / UI 包 / SDK）。当前为空。

## 3. 当前完成度

Phase 0、1A、1B、2、3、4、5、6 全部已落地。Phase 7（移动端适配）尚未开始。

已落地能力：

- 真实登录 + HttpOnly refresh cookie + refresh 自动刷新
- 三重 Guard 在全局 `APP_GUARD` 级别注册
- `@Public()` / `@Roles()` / `@CurrentUser()` 三类装饰器已建好并被广泛使用
- 8 个业务模块控制器 / 服务 / DTO / 类型齐全
- MinIO presign 直传 + 所有 import drawer 三段式
- Prisma schema 完整：10 张业务表 + 2 个辅助表（`IdSequence` / `AuditLog`）+ 5 个 enum
- 前后端 audit 写入 / 读取 + 自动清理
- `@dnd-kit` 驱动的拖拽排序（Phase 6 QuickLink）

尚未落地 / 待补：

- Phase 7：移动端深度适配（目前只有 `AppShell` sider ↔ drawer 响应式，其他页面未做窄屏优化）
- 正式环境 migration 流程：当前仍是 `prisma db push`，上线前需切换为 `prisma migrate`
- test / lint 脚本：CLAUDE.md 明令不要虚构
- OpenAPI 自动化契约：API 端点数量已可观，后续可接 `@nestjs/swagger`
