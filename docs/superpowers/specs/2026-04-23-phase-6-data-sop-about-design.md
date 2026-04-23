# Phase 6 — 数据表 / SOP / 关于页 · 实现设计

> 对应需求：[docs/spec/07-Phase6-数据表-SOP-关于.md](../../spec/07-Phase6-数据表-SOP-关于.md)
> 全局约束：[docs/spec/00-全局约束与实施路线.md](../../spec/00-全局约束与实施路线.md)
> 上游：Phase 0（`AuditLogsService` 写侧已在其他模块落地）
> 下游：Phase 7（移动端适配）

## 1. 范围与决策摘要

Phase 6 落地四件事：

1. **数据表页** `/links` — 按分组展示的 QuickLink 卡片网格，管理员可增删改排。
2. **SOP 页** `/sop` — 与数据表页同骨架，仅视觉强调色与 pageType 不同；访客可读。
3. **关于页** `/about` — 版本 / 企业 / 反馈邮箱 / 日志入口 / 备案栏；访客可读。
4. **日志模块读侧** `/logs` — AuditLog 分页列表页 + 后台每日清理 180 天以前数据。

不拆子阶段，单轮落地。spec §2 列出的"日志入口"按 §4.3 "先鉴权后跳转"落在 `/logs` 路由上，`/about` 页提供入口链接。

### 决策记录

| # | 决策点 | 选择 | 备注 |
| --- | --- | --- | --- |
| Q1 | 日志模块落地范围 | 入口链接 + 只读列表页 + 180 天自动清理 | spec §4.3 要求的 180 天策略在后台跑 |
| Q2 | QuickLink 初始化方式 | 不写 seed；管理员上线后用"添加"按钮手工录入 | spec §7 的预置清单作为上线后运营任务 |
| Q3 | QuickLink 种类建模 | 新增 `kind` 枚举：`NAVIGATE` / `COPY` / `DOWNLOAD` | spec §7.3 的"点击复制"和 📦 模板下载都走数据驱动 |
| Q4 | 数据表 / SOP 区分字段 | 新增 `pageType` 枚举：`DATA_TABLE` / `SOP` | 两页共用一张表，查询带过滤 |
| Q5 | 排序 UX | 点"排序"打开 Modal，拖拽后批量写 `sortOrder` | 移动端可点按钮切换，桌面端拖拽 |
| Q6 | 关于页配置值 | 前端常量 `apps/web/src/constants/about.ts` | 版权 / 企业名 / 反馈邮箱 / 备案号可留 TBD 占位 |
| Q7 | 下载资源位置 | `apps/web/public/templates/import.rar`；DB 里 `url = /templates/import.rar` | 不引入 MinIO 上传 UI |
| Q8 | 数据表 / SOP 组件共享 | 单个 `<QuickLinkCenterPage>` 参数化组件 + 两个薄 wrapper | hover 强调色通过 accent 色令牌传入 |
| Q9 | 180 天保留策略 | `@nestjs/schedule` 每日 03:00 跑清理 | 同时引入新依赖：`@nestjs/schedule` |

---

## 2. 高层架构

```
┌── apps/web ─────────────────────────────────────┐   ┌── apps/api ────────────────────────────────┐
│ features/quick-links/                             │   │ modules/quick-links/                          │
│   QuickLinkCenterPage.tsx  (共享)                 │   │   quick-links.module.ts                       │
│     └─ 顶部四按钮：排序 / 添加 / 编辑 / 删除      │   │   quick-links.controller.ts                   │
│     └─ 分组 + 三列卡片网格                        │   │   quick-links.service.ts                      │
│   DataCenterPage.tsx       (数据表薄 wrapper)     │   │   dto/*.dto.ts                                │
│   SopCenterPage.tsx        (SOP 薄 wrapper)       │   │                                                │
│   QuickLinkFormModal.tsx   (添加 / 编辑)          │   │ modules/audit-logs/                           │
│   QuickLinkSortModal.tsx   (拖拽排序)             │   │   audit-logs.module.ts (升级为导出 controller)│
│   QuickLinkDeleteConfirm.tsx                      │   │   audit-logs.controller.ts   (新:读侧)        │
│   hooks/useQuickLinks.ts                          │   │   audit-logs.service.ts      (原:写侧保留)    │
│   hooks/useQuickLinkMutations.ts                  │   │   audit-logs-retention.service.ts (新:每日清理) │
│                                                   │   │   dto/query-audit-logs.dto.ts                 │
│ features/about/                                   │   │                                                │
│   AboutPage.tsx                                   │   │ app.module.ts                                  │
│                                                   │   │   └─ 引入 ScheduleModule.forRoot()            │
│ features/audit-logs/                              │   │   └─ 注册 QuickLinksModule                    │
│   AuditLogListPage.tsx                            │   │                                                │
│   hooks/useAuditLogs.ts                           │   │ prisma/schema.prisma                          │
│                                                   │   │   └─ QuickLink: 加 pageType / kind / 索引     │
│ constants/about.ts         (配置常量)             │   └────────────────────────────────────────────┘
│ services/quickLinks.ts                            │
│ services/auditLogs.ts                             │
│ router.tsx                                        │
│   └─ /links  → DataCenterPage  (RequireAuth)      │
│   └─ /sop    → SopCenterPage   (无 RequireAuth)   │
│   └─ /about  → AboutPage       (无 RequireAuth)   │
│   └─ /logs   → AuditLogListPage(RequireRole)      │
│ public/templates/import.rar                       │
└───────────────────────────────────────────────────┘
```

---

## 3. 数据模型变更

### 3.1 `QuickLink` 扩展

```prisma
enum QuickLinkPageType {
  DATA_TABLE
  SOP
}

enum QuickLinkKind {
  NAVIGATE
  COPY
  DOWNLOAD
}

model QuickLink {
  id         String            @id @default(cuid())
  pageType   QuickLinkPageType
  category   String            // 例:"企业内部数据表" / "高途合作数据表" / "SOP"
  kind       QuickLinkKind     @default(NAVIGATE)
  title      String            // 允许含 emoji 前缀
  url        String            // NAVIGATE / COPY 用完整 URL;DOWNLOAD 用 `/templates/xxx` 静态路径
  sortOrder  Int               @default(0)
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt

  @@index([pageType, category, sortOrder])
}
```

`sortOrder` 初始插入时取当前 `(pageType, category)` 最大值 + 10。

### 3.2 `AuditLog` 无 schema 变更

写侧已就位。读侧只新增分页查询与保留策略清理 job。

### 3.3 迁移方式

沿用 `pnpm prisma:push`（CLAUDE.md 明确当前不用 migrate），推送前确认 `QuickLink` 表为空或无历史数据冲突；若已有行，手动先 `TRUNCATE` 再 push（本阶段还没对外上线，可接受）。

---

## 4. API 表面

### 4.1 `QuickLinksModule` 新增

| Method | Path | Role 要求 | 返回 |
| --- | --- | --- | --- |
| GET | `/api/public/sop-links` | 匿名（`@Public()`） | 仅 `pageType=SOP` 的分组列表；controller 硬写 pageType，不接受 query |
| GET | `/api/quick-links?pageType=DATA_TABLE\|SOP` | 登录任意角色 | 按 `category` 分组、组内按 `sortOrder` asc 排好的列表 |
| POST | `/api/quick-links` | `SUPER_ADMIN` / `ADMIN` | 创建后的条目 |
| PATCH | `/api/quick-links/:id` | `SUPER_ADMIN` / `ADMIN` | 更新后的条目 |
| DELETE | `/api/quick-links/:id` | `SUPER_ADMIN` / `ADMIN` | 204 |
| POST | `/api/quick-links/reorder` | `SUPER_ADMIN` / `ADMIN` | 请求体 `{ pageType, items: [{id, sortOrder}] }`；事务批量更新 |

所有写操作调 `AuditLogsService.record`，`targetType = "quick_link"`。

匿名访问通过"双端点"实现，避免在一个 endpoint 里混两种鉴权需求：

- SOP 页走 `/api/public/sop-links`，controller 标 `@Public()`（沿用 `apps/api/src/modules/auth/decorators/public.decorator.ts`），service 层强制过滤 `pageType=SOP`。
- 数据表页走 `/api/quick-links?pageType=DATA_TABLE`，走全局 JWT guard；登录任意角色都可读。
- `@Roles()` 装饰器只挂在写接口上（`POST` / `PATCH` / `DELETE` / `reorder`），由现有 `RolesGuard` 执行。

### 4.2 `AuditLogsController` 新增

| Method | Path | Role 要求 | 备注 |
| --- | --- | --- | --- |
| GET | `/api/audit-logs` | `SUPER_ADMIN` / `ADMIN` | 分页 + 基础筛选（operatorId / targetType / action / 日期区间）|

查询 DTO：
- `page` / `pageSize`（默认 1 / 50，与 spec §4.4 对齐）
- `operatorId?`、`targetType?`、`action?`、`fromDate?`、`toDate?`
- 返回 `{ rows: AuditLogItem[], total, page, pageSize }`

`AuditLogItem` 字段：`id / createdAt / operatorId / operatorUsername / operatorPhone / action / targetType / targetId / fieldName / beforeValue / afterValue`。`operatorUsername` / `operatorPhone` 通过 join User 拿到，冗余字段利于列表直读。

### 4.3 `AuditLogsRetentionService`

- `@Cron('0 0 3 * * *')` 每天 03:00 运行。
- `deleteMany({ where: { createdAt: { lt: DateTime.now() - 180d } } })`。
- 启动时 `@nestjs/schedule` 的 `ScheduleModule.forRoot()` 挂到 `app.module.ts`。
- 删除数量写入 Nest logger（`info` 级），便于排障；不另写 AuditLog（避免"清理日志"自身产生日志）。

### 4.4 DTO 清单

- `CreateQuickLinkDto`：`pageType`、`category`、`kind`、`title`、`url`（均必填，`class-validator` 校验非空、字符串、枚举合法）。
- `UpdateQuickLinkDto`：`CreateQuickLinkDto` 的 partial，但 `pageType` 不允许修改（避免跨页迁移破坏排序）。
- `ReorderQuickLinksDto`：`pageType: QuickLinkPageType`；`items: { id: string; sortOrder: number }[]`（`@ArrayMinSize(1)`）。
- `QueryAuditLogsDto`：`page`、`pageSize`、过滤字段。

---

## 5. 前端组件与路由

### 5.1 `<QuickLinkCenterPage>` 参数化共享组件

Props:
- `pageType: QuickLinkPageType`
- `title: string` — "数据表快捷跳转中心" / "标准作业程序"
- `accent: "blue" | "green"` — hover 边框颜色令牌（分别对应 `--accent-blue: #1d8cff` / `--accent-green: #52c41a`）

行为：
- 读 `useQuickLinks(pageType)` 按 `category` 分组。
- `useAuthStore` 读 user role：仅 `ADMIN` / `SUPER_ADMIN` 显示 4 个管理按钮。
- 4 个按钮：
  - **排序** → 打开 `<QuickLinkSortModal pageType={pageType} />`
  - **添加** → 打开 `<QuickLinkFormModal mode="create" pageType={pageType} />`
  - **编辑** → 选中状态：单选时弹 `<QuickLinkFormModal mode="edit" value={...} />`；未选时禁用（沿用 spec 00 §6 的"多选禁用编辑"基线）。
  - **删除** → 选中状态：`<QuickLinkDeleteConfirm ids={...} />`；二次确认（spec 00 §6）。

选择机制：卡片左上角显示一个小 checkbox，同页内勾选项暂存于页面 state。spec §6 没写但沿用列表选择交互。

卡片渲染：
- 白底圆角（12px）、轻阴影（`box-shadow: 0 2px 8px rgba(0,0,0,0.04)`）。
- hover 时：`border: 1px solid var(--accent-{blue|green})`、`transform: translateY(-2px)`、阴影加深。
- 卡片右下角小徽标显示 kind：`COPY` → "(点击复制)"、`DOWNLOAD` → 下载图标、`NAVIGATE` → 外链图标。
- 点击处理：
  - `NAVIGATE` → `window.open(url, '_blank', 'noopener')`。
  - `COPY` → `navigator.clipboard.writeText(url)`；成功 `message.success("链接已复制")`，失败 `message.error("复制失败，请手动复制")`。
  - `DOWNLOAD` → 构造 `<a href={url} download>` 触发；回退 `window.open`。

### 5.2 `<QuickLinkFormModal>`

字段：`pageType`（create 时禁用、传入即定；edit 时只读）、`category`（自由输入 + autoComplete 现有分类）、`kind`、`title`、`url`。`kind=DOWNLOAD` 时 `url` 的 placeholder 提示 "`/templates/...`"。

### 5.3 `<QuickLinkSortModal>`

- 按 `category` 分组。
- 每组内用 `@dnd-kit/core` + `@dnd-kit/sortable` 拖拽排列（`apps/web/package.json` 当前两者都未装，需新增）。
- "保存"触发 `POST /api/quick-links/reorder`，按 pageType 批量写 `sortOrder`；`sortOrder` 重算策略：从 10 开始、间隔 10（方便日后插入）。

### 5.4 `<AboutPage>`

读 `ABOUT_CONFIG` 常量渲染：
- 居中 Logo（可用现有 "研录" 文字 Logo 或 AntD 预留）。
- 平台中文名、版本号（来自 `import { version } from "../../../package.json"` 或常量，取常量更稳）。
- 所属企业 / 反馈邮箱 / 版权行。
- "查看中台日志" 按钮：`useAuthStore` 读 role，`ADMIN` / `SUPER_ADMIN` 才渲染；点击 `navigate("/logs")`。
- 底部备案号占位（灰色小字）。

`constants/about.ts`：

```ts
export const ABOUT_CONFIG = {
  platformName: "研录教学管理中台",
  version: "1.0.0",
  companyName: "TBD · 请在正式上线前替换",
  feedbackEmail: "feedback@example.com",
  copyrightLine: "© 2026 TBD. All rights reserved.",
  beianNumber: "",
} as const;
```

### 5.5 `<AuditLogListPage>`

- `RequireAuth + RequireRole(["SUPER_ADMIN", "ADMIN"])`。
- 顶部筛选：操作人搜索（工号/用户名）、动作多选、目标类型多选、日期区间。
- 表格列：时间（精确到秒）、操作人（用户名 + 手机后四位）、动作、目标类型、目标 ID、字段、前值、后值。
- 分页：每页 50（spec §4.4）。
- 空状态 / 加载状态使用 AntD `Empty` / `Skeleton`。

### 5.6 路由变更

`router.tsx`：

```tsx
{
  path: "links",
  element: (
    <RequireAuth>
      <DataCenterPage />
    </RequireAuth>
  ),
},
{
  path: "sop",
  element: <SopCenterPage />,            // 访客可访问
},
{
  path: "about",
  element: <AboutPage />,                // 访客可访问
},
{
  path: "logs",
  element: (
    <RequireAuth>
      <RequireRole roles={["SUPER_ADMIN", "ADMIN"]}>
        <AuditLogListPage />
      </RequireRole>
    </RequireAuth>
  ),
},
```

导航项 `config/navigation.tsx` 不变（已有 links / sop / about 三项）；`/logs` 不进主侧边栏，只能从 `/about` 进入（spec §6）。

---

## 6. 权限矩阵

| 资源 | 访客 | 一般成员 | 管理员 / 超管 |
| --- | --- | --- | --- |
| `/sop` 页面读 | ✅ | ✅ | ✅ |
| `/about` 页面读 | ✅ | ✅ | ✅ |
| `/links` 页面读 | ❌ 走 `UnauthorizedPage kind="guest"` | ✅ | ✅ |
| 4 个管理按钮（排序/添加/编辑/删除）| ❌ 不渲染 | ❌ 不渲染 | ✅ |
| `/logs` 列表读 | ❌ | ❌ | ✅ |
| `/about` 上的"查看中台日志"链接 | ❌ 不渲染 | ❌ 不渲染 | ✅ |
| `GET /api/quick-links?pageType=SOP` | ✅ | ✅ | ✅ |
| `GET /api/quick-links?pageType=DATA_TABLE` | ❌ 401 | ✅ | ✅ |
| `POST/PATCH/DELETE /api/quick-links` | ❌ | ❌ | ✅ |
| `GET /api/audit-logs` | ❌ | ❌ | ✅ |

JWT Guard 已是全局，`@Public()` 装饰器已存在于 `apps/api/src/modules/auth/decorators/public.decorator.ts`，SOP 的 GET 直接 `@Public()`。数据表页走常规带 JWT 的 endpoint。

---

## 7. 静态下载资源

- 新建目录 `apps/web/public/templates/`。
- 占位文件 `README.md`（内容："该目录用于存放 DOWNLOAD 类 QuickLink 引用的模板文件。示例路径 `/templates/import.rar`。"）。
- 真正的 `import.rar` 不进仓库（由运维 / 管理员上线时手工放入），避免 git 存二进制大文件；`.gitignore` 加 `apps/web/public/templates/*.rar`。
- 管理员在"添加"弹窗里选 `kind=DOWNLOAD`，`url` 填 `/templates/import.rar`。文件缺失时前端点击会 404，UI 给一次 `message.warning("模板文件缺失，请联系管理员。")`（可选，增强体验）。

---

## 8. 错误与边界处理

- **复制剪贴板失败**：`navigator.clipboard` 在 HTTP 或旧浏览器下可能不可用；捕获异常降级为展示 URL + `message.warning("自动复制失败，请长按选中复制。")`。
- **空列表状态**：页面刚上线无 QuickLink 数据时，主区显示 `<Empty>` + 引导文案 "暂无快捷入口，点击右上角'添加'录入。"（管理员可见）/ "暂无快捷入口。"（普通用户）。
- **排序并发**：两个管理员同时打开排序 Modal，后保存者覆盖前者。本阶段不做冲突检测（简化）；service 层记一条 audit `action = "quick_link.reorder"`。
- **日志量大**：默认 `pageSize=50`；查询带上 `createdAt` 索引（schema 已有 `@default(now())`，但没显式索引 — 新增 `@@index([createdAt])` 以保证分页性能）。
- **180 天清理失败**：cron 异常只打日志，不 re-throw；下次 03:00 再跑。

---

## 9. 文件清单（新增 / 修改概览）

**API 新增**
- `apps/api/prisma/schema.prisma` — `QuickLink` 加 `pageType` / `kind` / 索引；`AuditLog` 加 `createdAt` 索引；新增两个 enum。
- `apps/api/src/modules/quick-links/quick-links.module.ts`
- `apps/api/src/modules/quick-links/quick-links.controller.ts`
- `apps/api/src/modules/quick-links/quick-links.service.ts`
- `apps/api/src/modules/quick-links/dto/create-quick-link.dto.ts`
- `apps/api/src/modules/quick-links/dto/update-quick-link.dto.ts`
- `apps/api/src/modules/quick-links/dto/reorder-quick-links.dto.ts`
- `apps/api/src/modules/quick-links/dto/query-quick-links.dto.ts`
- `apps/api/src/modules/audit-logs/audit-logs.controller.ts`
- `apps/api/src/modules/audit-logs/audit-logs-retention.service.ts`
- `apps/api/src/modules/audit-logs/dto/query-audit-logs.dto.ts`

**API 修改**
- `apps/api/src/app.module.ts` — 注册 `QuickLinksModule`、`ScheduleModule.forRoot()`。
- `apps/api/src/modules/audit-logs/audit-logs.module.ts` — 新增 controller 与 retention service。
- `apps/api/src/modules/audit-logs/audit-logs.types.ts` — 扩 `AuditAction`（`quick_link.create / update / delete / reorder`）与 `AuditTargetType`（`quick_link`）。
- `apps/api/package.json` — 加 `@nestjs/schedule` 依赖。

**Web 新增**
- `apps/web/src/features/quick-links/QuickLinkCenterPage.tsx`
- `apps/web/src/features/quick-links/DataCenterPage.tsx`
- `apps/web/src/features/quick-links/SopCenterPage.tsx`
- `apps/web/src/features/quick-links/QuickLinkCard.tsx`
- `apps/web/src/features/quick-links/QuickLinkFormModal.tsx`
- `apps/web/src/features/quick-links/QuickLinkSortModal.tsx`
- `apps/web/src/features/quick-links/QuickLinkDeleteConfirm.tsx`
- `apps/web/src/features/quick-links/hooks/useQuickLinks.ts`
- `apps/web/src/features/quick-links/hooks/useQuickLinkMutations.ts`
- `apps/web/src/features/quick-links/types.ts`
- `apps/web/src/features/about/AboutPage.tsx`
- `apps/web/src/features/audit-logs/AuditLogListPage.tsx`
- `apps/web/src/features/audit-logs/hooks/useAuditLogs.ts`
- `apps/web/src/services/quickLinks.ts`
- `apps/web/src/services/auditLogs.ts`
- `apps/web/src/constants/about.ts`
- `apps/web/public/templates/README.md`

**Web 修改**
- `apps/web/src/router.tsx` — 把 `/links` / `/sop` / `/about` 的 `ModulePage` 占位替换为实页；新增 `/logs`。
- `apps/web/src/styles.css` — 卡片网格布局（三列、响应式断点）、hover 强调色变量、sort modal 拖拽态样式、audit log 表格紧凑行。
- `apps/web/package.json` — 新增 `@dnd-kit/core`、`@dnd-kit/sortable` 依赖。
- `.gitignore` — `apps/web/public/templates/*.rar`。

---

## 10. 非目标（明确不做）

- **Seed 脚本**：spec §7 的预置清单由管理员上线后手工录入；不写 `prisma/seed.ts`。
- **MinIO 上传 UI**：DOWNLOAD 类链接的文件由人工放到 `public/templates/`，不做前端上传。
- **数据表格本体**：spec §7 引用的飞书表格仅作为 URL 存储，我们不镜像它们的内容到本地 DB。
- **批量编辑**：卡片多选时禁用"编辑"按钮，只允许多选"删除"。
- **审计日志导出 / 下载**：`/logs` 页只读列表，不做 Excel 导出。
- **审计日志 diff 可视化**：字段级变更直接以"前值 / 后值"两列原文展示。
- **移动端特殊适配**：沿用 AppShell 的现有响应式；卡片网格在 `md` 断点以下自动降为一列。
- **QuickLink pageType 迁移**：一旦创建，不允许在 UI 改。

---

## 11. 验收标准（对齐 spec §9）

- [ ] `/links` 与 `/sop` 都以三列卡片网格展示，卡片默认样式一致。
- [ ] 数据表 hover 为蓝边（`#1d8cff`），SOP hover 为绿边（`#52c41a`），均轻微上浮 + 阴影加深。
- [ ] 管理员可在两页面各自完成排序、添加、编辑、删除；普通成员看不到这 4 个按钮。
- [ ] `/about` 正确展示 Logo / 平台名 / 版本 `1.0.0` / 企业 / 反馈邮箱；底部有备案 / 版权占位。
- [ ] 访客（未登录）访问 `/sop` / `/about` 可正常看到内容，访问 `/links` 跳到 `UnauthorizedPage`。
- [ ] 访客 / 普通成员看不到"查看中台日志"入口；管理员 / 超管点击可进 `/logs`。
- [ ] `/logs` 列表正确展示分页、筛选、时间倒序。
- [ ] QuickLink 的 COPY 类卡片点击复制成功，弹 toast；DOWNLOAD 类触发下载。
- [ ] 180 天前的 AuditLog 次日 03:00 后不再出现在查询结果里。
- [ ] `pnpm --filter @yanlu/api build` 和 `pnpm --filter @yanlu/web build` 均通过。
