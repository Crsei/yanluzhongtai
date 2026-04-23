# 系统总览

## 服务拓扑

```
┌─────────┐     /api         ┌─────────┐     SQL      ┌──────────┐
│   web   │ ───────────────▶ │   api   │ ───────────▶ │ postgres │
│ (Vite/  │                   │(NestJS) │               │    16    │
│ Nginx)  │                   │         │     presign   └──────────┘
└─────────┘                   │         │ ────────┐
                              │         │         ▼
                              │         │      ┌──────┐
                              │         │      │ minio│
                              │         │      └──────┘
                              └─────────┘
```

- `web`：React 18 + Vite + AntD 5 中台前端；生产由 Nginx 托管静态文件
- `api`：NestJS 10 后端服务；`/api` 为全局前缀
- `db`：PostgreSQL 16
- `minio`：对象存储，存附件、简历、Excel 导入批次文件等

请求链路：

1. 浏览器访问 `web`
2. `web` 调用 `/api/*`
3. `api` 读写 `postgres`
4. `api` 按需给前端签 MinIO presign URL；前端直传 / 直下 MinIO

认证链路：

1. `POST /api/auth/login` → 返回短期 `accessToken` + 设 `HttpOnly refresh cookie`
2. `accessToken` 过期 → 前端拦截器自动 `POST /api/auth/refresh` → 重放原请求
3. `POST /api/auth/logout` → 清 refresh cookie

## 已落地模块

前端 `apps/web/src/features/`：`auth` / `user-settings` / `users` / `employees` / `students` / `course-outlines` / `courses` / `payroll` / `quick-links` / `about` / `audit-logs`。

后端 `apps/api/src/modules/`：`auth` / `users` / `storage` / `audit-logs` / `employees` / `students` / `course-outlines` / `courses` / `payroll` / `quick-links`。

扩展阅读：

- [技术选型与架构](../technical/stack-and-architecture.md)
- [脚手架与目录结构](../technical/scaffold-and-structure.md)
- [部署文档](../technical/deployment.md)
- [数据库设计](../db/schema-design.md)
- [API 端点一览](../api/openapi-spec.md)
- [访问控制](../security/access-control.md)
