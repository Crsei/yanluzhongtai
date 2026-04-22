# 技术选型与架构

## 1. 技术栈

### 1.1 前端

- `React`
- `TypeScript`
- `Vite`
- `React Router`
- `Ant Design`
- `TanStack Query`
- `Zustand`
- `dayjs`

选择原因：

- 该项目是典型的内部管理中台，页面以表格、表单、弹窗、权限、筛选、分页为主
- `Ant Design` 能直接覆盖大部分中后台交互场景，减少重复造轮子
- `React + TypeScript` 适合处理复杂状态、权限路由和可复用组件
- `Vite` 适合从零启动的中小型到中型项目，开发反馈快

### 1.2 后端

- `NestJS`
- `TypeScript`
- `Prisma`
- `PostgreSQL`
- `JWT`

选择原因：

- 模块划分明确，适合员工、学生、课程、薪酬、日志这类边界清晰的业务域
- `NestJS` 的模块化和依赖注入更适合长期维护
- `Prisma` 适合快速建立结构化数据模型，并支撑后续迁移管理
- `PostgreSQL` 适合事务型后台系统，结构化字段、关联关系、多条件检索都更稳

### 1.3 文件与对象存储

- `MinIO`

用途：

- 存储简历、合同、成绩单、课程附件、模板文件等上传对象

### 1.4 部署

- `Docker Compose`
- `Nginx`

选择原因：

- 当前项目属于单业务系统，首版更适合单机或单服务器部署
- `Docker Compose` 足以覆盖前端、后端、数据库、对象存储的编排
- `Nginx` 用于托管前端静态资源并反向代理 `/api`

## 2. 架构分层

### 2.1 前端分层

- `layouts`：中台基础布局
- `pages`：页面级路由组件
- `config`：导航、路由、模块元数据
- 后续可扩展：
  - `components`
  - `features`
  - `services`
  - `stores`

### 2.2 后端分层

- `src/main.ts`：启动入口
- `src/app.module.ts`：总模块
- `src/config`：环境变量与配置校验
- `src/prisma`：数据库客户端模块
- `src/health`：健康检查
- 后续业务模块建议：
  - `auth`
  - `users`
  - `employees`
  - `students`
  - `course-outlines`
  - `courses`
  - `payroll`
  - `links`
  - `audit-logs`

## 3. 数据与服务关系

- `web` 负责 PC/移动端中台页面
- `api` 负责鉴权、权限控制、业务逻辑、文件元数据、日志记录
- `db` 负责结构化数据存储
- `minio` 负责附件与上传文件

数据流：

1. 浏览器访问 `web`
2. `web` 调用 `/api`
3. `api` 读写 `PostgreSQL`
4. `api` 上传/读取 `MinIO`

## 4. 为什么适合当前 spec

这个项目的核心不是高并发，而是：

- 多角色权限
- 多模块中后台 CRUD
- 复杂表单
- 课程、学生、老师、薪酬之间的联动关系
- Excel 导入
- 日志审计
- PC 与移动端兼容

所以当前技术栈优先考虑的是：

- 工程可维护性
- 中后台交互效率
- 数据模型稳定性
- 部署成本可控

