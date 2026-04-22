# 脚手架与目录结构

## 1. 目录树

```text
.
├─ apps
│  ├─ api
│  │  ├─ prisma
│  │  │  └─ schema.prisma
│  │  ├─ src
│  │  │  ├─ config
│  │  │  ├─ health
│  │  │  ├─ modules
│  │  │  ├─ prisma
│  │  │  └─ main.ts
│  │  ├─ .env.example
│  │  ├─ Dockerfile
│  │  ├─ nest-cli.json
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  └─ web
│     ├─ src
│     │  ├─ config
│     │  ├─ features
│     │  ├─ layouts
│     │  ├─ pages
│     │  ├─ services
│     │  ├─ stores
│     │  ├─ App.tsx
│     │  ├─ main.tsx
│     │  └─ router.tsx
│     ├─ .env.example
│     ├─ Dockerfile
│     ├─ index.html
│     ├─ package.json
│     └─ vite.config.ts
├─ docs
│  ├─ spec
│  └─ technical
├─ infra
│  └─ nginx
│     └─ web.conf
├─ packages
├─ .env.example
├─ docker-compose.yml
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

## 2. 每层职责

### 2.1 `apps/web`

职责：

- 中台 Web 界面
- 路由和模块导航
- 表格、表单、弹窗、筛选器等前端交互
- PC 与移动端响应式适配
- Phase 0 还会承接：
  - 登录页
  - 会话恢复
  - 未授权页
  - 路由级权限包装

### 2.2 `apps/api`

职责：

- 登录鉴权
- RBAC 权限校验
- 员工/学生/课程/薪酬/链接/日志接口
- 文件上传元数据管理
- 数据导入与计算逻辑
- Phase 0 的认证基线包括：
  - `/auth/login`
  - `/auth/refresh`
  - `/auth/logout`
  - `/auth/me`
  - `JwtAuthGuard`
  - `RolesGuard`

### 2.3 `infra/nginx`

职责：

- 前端静态资源托管
- `/api` 反向代理到后端服务

### 2.4 `docs/spec`

职责：

- 保存需求拆解和阶段化规格

### 2.5 `docs/technical`

职责：

- 保存技术栈、目录结构、部署方案与运维约束

### 2.6 `packages`

当前保留为空目录，后续可放：

- 共享类型
- 共享 ESLint/TS 配置
- 共享 UI 包
- 通用 SDK

## 3. 当前脚手架的边界

当前版本属于“第一版落盘脚手架”：

- 已完成 monorepo 基础结构
- 已完成前端中台壳和基础路由
- 已完成 NestJS 后端基础壳
- 已完成 Prisma 初始 schema
- 已完成 Compose 与部署文档

当前尚未完成的内容：

- 真实登录接口
- refresh cookie 机制
- RBAC 守卫
- 业务模块 controller/service/repository
- 文件上传接口
- Excel 导入逻辑
- 数据迁移文件

说明：

- 当前目录结构已经为 Phase 0 认证基础设施预留了 `features`、`services`、`stores`、`modules`
- 但技术文档中的认证设计仍属于“目标实现方案”，尚未全部在代码中落地

