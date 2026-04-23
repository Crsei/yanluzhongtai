# 目录布局约定

当前仓库采用 `pnpm monorepo`：

- `apps/web`：前端应用（Phase 0–6 已上线：auth / user-settings / users / employees / students / course-outlines / courses / payroll / quick-links / about / audit-logs）
- `apps/api`：后端应用（对应 NestJS 模块 + Prisma schema）
- `infra/nginx`：部署反向代理配置
- `packages`：预留共享包
- `docs/spec`：需求与 Phase 0–7 业务规格
- `docs/technical`：技术栈、目录结构、部署文档、前端组件约定
- `docs/superpowers`：每阶段实现设计 (`specs/`) 与实施计划 (`plans/`)
- `docs/architecture` / `docs/db` / `docs/api` / `docs/security` / `docs/operations` / `docs/deployment`：主题索引，指回 `docs/technical/*` 的详细文档

完整目录树与每层职责见 [脚手架与目录结构](../technical/scaffold-and-structure.md)。
