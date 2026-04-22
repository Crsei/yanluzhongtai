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

- `JWT_SECRET`
- `POSTGRES_PASSWORD`
- `MINIO_ROOT_PASSWORD`
- `APP_ORIGIN`

本地开发还建议复制：

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

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

### 4.4 启动后端

```bash
pnpm dev:api
```

### 4.5 启动前端

```bash
pnpm dev:web
```

默认地址：

- 前端：`http://localhost:5173`
- 后端健康检查：`http://localhost:3000/api/health`
- MinIO Console：`http://localhost:9001`

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

### 5.3 查看日志

```bash
docker compose logs -f web
docker compose logs -f api
```

### 5.4 停止服务

```bash
docker compose down
```

## 6. 生产建议

- 数据库和 MinIO 目录挂载到持久化磁盘
- 把 `.env` 放到受控目录，不要提交到仓库
- 使用强密码和长随机 `JWT_SECRET`
- 正式环境建议在服务器前再挂一层外部 Nginx 或云负载均衡，并配置 HTTPS
- MinIO 不建议直接暴露公网，优先内网访问
- 后续上线时，将 `prisma db push` 切换为正式 migration 流程

## 7. 备份建议

- PostgreSQL：按天备份
- MinIO：按对象目录周期备份
- `.env`：单独加密保存

