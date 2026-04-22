# 系统总览

本文件给出当前脚手架的系统边界：

- `web`：React + Vite 中台前端
- `api`：NestJS 后端服务
- `db`：PostgreSQL
- `minio`：对象存储

请求链路：

1. 浏览器访问 `web`
2. `web` 通过 `/api` 访问 `api`
3. `api` 访问 `db`
4. `api` 管理 `minio` 中的对象文件

更完整的技术选型说明见：

- [技术选型与架构](../technical/stack-and-architecture.md)
- [部署文档](../technical/deployment.md)

