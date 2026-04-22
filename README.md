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
pnpm dev:api
pnpm dev:web
```

### Docker Compose

```bash
cp .env.example .env
docker compose up --build -d
```

## 文档入口

- [技术文档索引](./docs/technical/README.md)
- [阶段化 SPEC](./docs/spec/README.md)

