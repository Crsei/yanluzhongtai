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
