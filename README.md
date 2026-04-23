# 研录教学管理中台

基于 `pnpm monorepo` 的项目脚手架，当前包含：

- `apps/web`：React + TypeScript + Vite + Ant Design 前端壳
- `apps/api`：NestJS + Prisma 后端壳
- `docker-compose.yml`：本地与单机部署编排
- `docs/spec`：需求和分阶段规格
- `docs/technical`：技术选型、目录结构、部署说明

## 快速开始

1. 复制环境变量模板
2. 安装依赖
3. 启动前后端开发服务
4. 或直接使用 Docker Compose 启动整套服务

### 本地开发

```bash
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm install
docker compose up -d db minio
pnpm prisma:push
pnpm prisma:seed   # 首次创建超级管理员
pnpm dev:api
pnpm dev:web
```

- 员工 / Excel 导入功能依赖 MinIO；保证 `docker compose up -d minio` 已运行，并在 `.env` 配置 `MINIO_*`（默认值已在 `.env.example`）。首次访问员工模块时 API 会自动创建 bucket。
- Phase 1B 用户管理：用户设置页（`/user-settings`，新标签页）、全部用户管理页（`/users`，仅 SUPER_ADMIN/ADMIN）、注册账号 / 重置密码 / 注销账号 / 角色升降已上线；新账号与重置后的账号首次登录强制走改密流程。
- Phase 2 学生模块：学生 CRUD（`/students`）、Excel 导入（模板下载 → dry-run → commit）、高级搜索（URL 可分享）、学管老师 / 规划师员工选择器、多处附件上传（成绩单 / 课表 / 加分政策 / 通用）。删除学生时有 `Enrollment` 记录会 409 保护。

### Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
```

## 文档入口

- [技术文档索引](./docs/technical/README.md)
- [阶段化 SPEC](./docs/spec/README.md)

