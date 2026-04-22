# Phase 0 — 基础架构与认证 · 实现设计

> 对应需求：[docs/spec/01-Phase0-基础架构与认证.md](../../spec/01-Phase0-基础架构与认证.md)

## 1. 范围与决策摘要

Phase 0 交付整个中台的登录、会话、路由守卫、布局骨架和前端视觉约定，**不**落地业务模块、用户管理、文件上传。

| 决策 | 选择 | 备注 |
| --- | --- | --- |
| 鉴权形态 | 短期 Access Token（Bearer）+ Refresh Token（HttpOnly Cookie） | 保持 JWT 技术选型，同时避免长期 Bearer token 落前端持久化存储 |
| Token 存储 | Access Token 仅放内存 + `sessionStorage`；Refresh Token 放 HttpOnly Cookie | 刷新页面可恢复；浏览器重开是否保留取决于 `rememberMe` 对 refresh cookie 的策略 |
| Token 有效期 | Access Token 15 分钟；Refresh Token：勾选 30 天 / 未勾选浏览器会话期 | 降低长期泄露窗口；由 `/auth/refresh` 续签 access token |
| 首个超管 | Prisma `seed.ts` + 环境变量，幂等 | 部署首次执行 `pnpm --filter @yanlu/api prisma:seed` |
| 通用组件 §6 | 只做全局主题 + 约定文档；不做 `<YButton>` 包装 | 等真实列表页落地再抽，避免臆想接口 |
| RBAC | `@Roles()` + `RolesGuard` 基础设施，Phase 0 即落已知访问矩阵 | 访客仅 `SOP/About`；一般成员不可访问 `payroll`；更细按钮级权限放到后续阶段 |
| 密码哈希 | `bcrypt`（cost 12） | Alpine 上无原生依赖问题；`argon2` 收益对内部中台不显著 |
| HTTP 客户端 | 自研 `fetch` 薄封装 | 不引 `axios`；统一 base URL / 401 / 注入 `Authorization` |

---

## 2. 高层架构

```
┌─ apps/web ─────────────────────────────┐     ┌─ apps/api ──────────────────────────┐
│ stores/authStore.ts  (Zustand)          │     │ modules/auth/                        │
│   state: { user, accessToken,           │     │   ├─ auth.controller.ts              │
│            rememberMe, hydrated }       │     │   ├─ auth.service.ts                 │
│   actions: login(credentials) /         │────►│   ├─ strategies/jwt.strategy.ts      │
│            setSession / clearSession /  │     │   ├─ strategies/refresh.strategy.ts  │
│            logout / hydrate             │     │   ├─ guards/jwt-auth.guard.ts        │
│ services/http.ts                         │     │   ├─ guards/roles.guard.ts           │
│   - baseURL = VITE_API_BASE_URL          │     │   ├─ decorators/roles.decorator.ts   │
│   - 注入 Authorization                   │     │   ├─ decorators/public.decorator.ts  │
│   - 401 → store.clearSession() + 抛错     │     │   ├─ decorators/current-user.ts      │
│                                          │     │   └─ dto/login.dto.ts                │
│ features/auth/                           │     │                                       │
│   ├─ RequireAuth.tsx                     │     │ modules/users/users.service.ts        │
│   ├─ RequireRole.tsx   (桩,不挂)         │     │   - findByPhone / create / hash       │
│   └─ UnauthorizedPage.tsx                │     │                                       │
│                                          │     │ prisma/seed.ts (幂等)                 │
│ pages/LoginPage.tsx  (表单对接 store)    │     │ app.module.ts: APP_GUARD = JwtAuthGuard│
│ layouts/AppShell.tsx (user 读 store)    │     │   (@Public 豁免 /auth/login, /health) │
└─────────────────────────────────────────┘     └──────────────────────────────────────┘
```

**请求时序**：

```
登录:
  web  LoginForm.onFinish({phone, password, rememberMe})
  web  useAuthStore.login() → http.post('/auth/login', ...)
  api  AuthController.login → AuthService.verify → sign access token + set refresh cookie
  web  store.setSession({ user, accessToken, rememberMe })
  web  navigate('/employees')

已登录请求:
  web  http.get('/foo') → Authorization: Bearer <accessToken>
  api  JwtAuthGuard → JwtStrategy.validate → req.user
  api  RolesGuard (若 controller 用 @Roles) → 403
  web  路由层同时按已知矩阵做 RequireAuth / RequireRole

刷新恢复:
  web  App 挂载时 useAuthStore.hydrate() 先读 sessionStorage
  web  若有 access token → http.get('/auth/me') 验证
  web  若 access token 缺失或 401 → http.post('/auth/refresh') 走 cookie 续签
  web  200 → 刷新 user/accessToken；401 → 清 store；两种情况都设 hydrated=true
  web  RequireAuth 在 hydrated 前显示 Spin，不做跳转
```

---

## 3. 后端详设（apps/api）

### 3.1 依赖增补

`apps/api/package.json`：

- `@nestjs/jwt` ^10
- `@nestjs/passport` ^10
- `passport` ^0.7
- `passport-jwt` ^4
- `bcrypt` ^5
- `cookie-parser` ^1
- `@types/bcrypt` ^5（dev）
- `@types/cookie-parser` ^1（dev）
- `@types/passport-jwt` ^4（dev）

### 3.2 `modules/auth/`

**`auth.controller.ts`** — 路由前缀由全局 `/api` 提供：

- `POST /auth/login`（`@Public()`）
  - body：`LoginDto { phone: string; password: string; rememberMe: boolean }`
  - 返回：`{ accessToken: string; expiresIn: number; user: AuthUser }`
  - 副作用：写入 HttpOnly refresh cookie
  - 错误：401 `{ message: '手机号或密码错误' }`（不区分哪一个，防枚举）
- `POST /auth/refresh`（`@Public()`）
  - 从 HttpOnly refresh cookie 读取 refresh token
  - 返回：`{ accessToken: string; expiresIn: number; user: AuthUser }`
- `POST /auth/logout`（`@Public()`）
  - 清空 refresh cookie
  - 返回：`204 No Content`
- `GET /auth/me`（受 `JwtAuthGuard` 保护）
  - 返回：`{ user: AuthUser }`

**`AuthUser` 形状**：`{ id: string; phone: string; username: string; role: UserRole }`。不返回 `passwordHash`。

**`auth.service.ts`**：

- `login({ phone, password, rememberMe })`：
  1. `usersService.findByPhone(phone)` — 不存在抛 `UnauthorizedException`
  2. `bcrypt.compare` — 失败抛 `UnauthorizedException`
  3. `prisma.user.update({ lastLoginAt: now })`（spec §4.3：首先满足 lastLoginAt；AuditLog 在 Phase 1+ 具体业务里再写）
  4. 生成 `accessToken`（15 分钟）和 `refreshToken`
  5. 返回 `{ accessToken, expiresIn: seconds, refreshToken, user }`

- `refresh(refreshToken)`：
  1. 校验 refresh token
  2. 查询用户仍存在
  3. 重新签发 `accessToken`
  4. 返回 `{ accessToken, expiresIn: seconds, user }`

**`strategies/jwt.strategy.ts`**：

- `ExtractJwt.fromAuthHeaderAsBearerToken()`
- `secretOrKey` 从 `ConfigService.get('JWT_SECRET')`
- `validate({ sub })` → `usersService.findById(sub)`，返回 `AuthUser`（挂在 `req.user`）
- 用户不存在则抛 `UnauthorizedException`（覆盖账号被删但 token 仍有效的情况）

**`strategies/refresh.strategy.ts`**：

- 仅用于控制器内部或守卫读取 cookie 中的 refresh token
- refresh token 使用独立 secret，不与 access token 共用
- cookie 名称建议固定为 `yanlu_rt`

**`guards/jwt-auth.guard.ts`**：

- `extends AuthGuard('jwt')`
- 覆盖 `canActivate`：先读 `@Public()` 元数据，公开则直接放行
- 注册为 `APP_GUARD`，全局生效

**`decorators/public.decorator.ts`**：

- `export const Public = () => SetMetadata('isPublic', true)`

**`decorators/roles.decorator.ts`**：

- `export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles)`

**`guards/roles.guard.ts`**：

- 读 `@Roles()` 元数据，无元数据放行；有则 `req.user.role` 必须在列表中
- **Phase 0 至少在已知受限资源上实际启用**。后端已有受限 controller 时直接 `@UseGuards(JwtAuthGuard, RolesGuard)`；前端路由层同步执行相同矩阵。

**`decorators/current-user.decorator.ts`**：

- `createParamDecorator((_, ctx) => ctx.switchToHttp().getRequest().user)`
- 方便 controller 里 `@CurrentUser() user: AuthUser`

**`dto/login.dto.ts`** — `class-validator`：

- `phone: @IsString @Matches(/^1[3-9]\d{9}$/)` — 中国大陆手机号
- `password: @IsString @MinLength(6) @MaxLength(64)`
- `rememberMe: @IsBoolean`

`main.ts` 需追加：

- `app.use(cookieParser())`
- `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`

### 3.3 `modules/users/`

Phase 0 只出服务方法，不出 controller（用户 CRUD 是 Phase 1）：

- `users.service.ts`
  - `findByPhone(phone)` → `prisma.user.findUnique({ where: { phone } })`
  - `findById(id)`
  - `createSuperAdmin({ phone, username, password })` — 被 seed 调用；bcrypt 哈希；`role: SUPER_ADMIN`
- `users.module.ts` 导出 `UsersService`

### 3.4 `prisma/seed.ts`

```ts
// 读三个环境变量，缺任何一个报错退出
const phone = requireEnv('SEED_SUPER_ADMIN_PHONE')
const username = requireEnv('SEED_SUPER_ADMIN_USERNAME')
const password = requireEnv('SEED_SUPER_ADMIN_PASSWORD')

// 幂等：phone 已存在就打印 skip
const existing = await prisma.user.findUnique({ where: { phone } })
if (existing) { console.log(`[seed] super admin ${phone} already exists`); return }

const passwordHash = await bcrypt.hash(password, 12)
await prisma.user.create({
  data: { phone, username, passwordHash, role: 'SUPER_ADMIN' },
})
console.log(`[seed] created super admin ${phone}`)
```

`apps/api/package.json` 补：

```json
"scripts": { "prisma:seed": "prisma db seed" },
"prisma": { "seed": "ts-node --compiler-options {\"module\":\"commonjs\"} prisma/seed.ts" }
```

根 `package.json` 补一个 `"prisma:seed": "pnpm --filter @yanlu/api prisma:seed"`。

`apps/api/.env.example` 和根 `.env.example` 补三个 `SEED_SUPER_ADMIN_*`（附注释："仅用于首次部署创建管理员；创建成功后可删"）。

### 3.5 `config/env.validation.ts`

需调整 required 列表，至少包含：

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `APP_ORIGIN`

### 3.6 `app.module.ts`

- `AuthModule` 与 `UsersModule` 加入 imports
- 提供 `APP_GUARD = JwtAuthGuard` 全局兜底
- `AuthModule` 内配置 access / refresh 两套签名参数，secret 从 `ConfigService`

### 3.7 `health.controller.ts`

在 `@Controller('health')` 类上加 `@Public()`，避免被全局 JwtAuthGuard 拦。

---

## 4. 前端详设（apps/web）

### 4.1 依赖增补

无新增三方包；Zustand 已在 `package.json`。

### 4.2 `stores/authStore.ts`

Zustand store，自管持久化（不使用 `zustand/middleware/persist` 默认的 localStorage，因为需要根据 `rememberMe` 在 local/session 间切换）：

```ts
type AuthUser = { id: string; phone: string; username: string; role: UserRole }
type AuthState = {
  user: AuthUser | null
  accessToken: string | null
  rememberMe: boolean
  hydrated: boolean
  setSession: (session: { accessToken: string; user: AuthUser; rememberMe: boolean }) => void
  clearSession: () => void
  login: (input: { phone: string; password: string; rememberMe: boolean }) => Promise<void>
  logout: () => void
  hydrate: () => Promise<void>   // 挂载时调用一次
}
```

- 存储 key：`yanlu:auth:v1` = `{ accessToken, user, rememberMe }`
- `setSession`：只写内存 + `sessionStorage`，不写 `localStorage`
- `clearSession`：只清内存 + `sessionStorage`，不请求后端
- `login`：由 store 发起 `POST /auth/login`，成功后调用 `setSession`
- `logout`：先调 `POST /auth/logout` 清 refresh cookie，再清内存和 `sessionStorage`
- `hydrate`：先读 `sessionStorage`；若 access token 可用则走 `GET /auth/me`；若缺失或 401，则走 `POST /auth/refresh`；refresh 失败时调用 `clearSession`；最后统一 `hydrated = true`

### 4.3 `services/http.ts`

```ts
type HttpInit = RequestInit & { auth?: boolean }

async function http<T>(path: string, init: HttpInit = {}): Promise<T> {
  const { auth = true, headers, ...rest } = init
  const accessToken = auth ? useAuthStore.getState().accessToken : null
  const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  })
  if (res.status === 401 && auth) {
    useAuthStore.getState().logout()
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }))
    throw new HttpError(res.status, body.message ?? res.statusText)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const api = {
  get: <T>(p: string, init?: HttpInit) => http<T>(p, { ...init, method: 'GET' }),
  post: <T>(p: string, body?: unknown, init?: HttpInit) =>
    http<T>(p, { ...init, method: 'POST', body: JSON.stringify(body) }),
  // put/delete 同理
}
```

### 4.4 `features/auth/`

**`RequireAuth.tsx`**：

```tsx
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, hydrated } = useAuthStore()
  if (!hydrated) return <div className="auth-splash"><Spin size="large" /></div>
  if (!user) return <UnauthorizedPage />
  return <>{children}</>
}
```

**`RequireRole.tsx`**（基础设施，Phase 0 不实际挂）：

```tsx
export function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuthStore()
  if (!user || !roles.includes(user.role)) return <UnauthorizedPage kind="forbidden" />
  return <>{children}</>
}
```

**`UnauthorizedPage.tsx`**（spec §4.3）：

- 居中布局：锁图标（`<LockOutlined />`，AntD icons，大号、灰色）+ 标题"无访问权限" + 说明文字"请登录后再访问该页面"
- 主按钮"前往登录"，`onClick` → `navigate('/login')`
- `kind` prop 区分 `'guest' | 'forbidden'`；`forbidden` 时说明文字改为"当前账号无权访问该页面"，不提供登录按钮

### 4.5 `router.tsx` 路由结构

SPEC §3 定下：访客只能访问 SOP 和 关于；一般成员不可访问 Payroll。实现方式：**AppShell 始终渲染**（保持侧边栏），在各业务页外层套 `RequireAuth`；已知受限页再叠 `RequireRole`；SOP/About 不套。

```tsx
createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <RootEntryRedirect /> },
      // 业务模块（需登录）
      { path: 'employees', element: <RequireAuth><ModulePage .../></RequireAuth> },
      { path: 'students',  element: <RequireAuth><ModulePage .../></RequireAuth> },
      { path: 'courses',   element: <RequireAuth><ModulePage .../></RequireAuth> },
      { path: 'payroll',   element: <RequireAuth><RequireRole roles={['ADMIN', 'SUPER_ADMIN']}><ModulePage .../></RequireRole></RequireAuth> },
      { path: 'links',     element: <RequireAuth><ModulePage .../></RequireAuth> },
      // 访客允许
      { path: 'sop',   element: <ModulePage .../> },
      { path: 'about', element: <ModulePage .../> },
    ],
  },
])
```

`RootEntryRedirect` 规则：

- 已登录用户默认进 `/employees`
- 未登录用户默认进 `/about`

侧边栏菜单**不按角色隐藏**——spec §3 说访客也能看到 `SOP/关于`；业务菜单访客点进去统一显示"无访问权限"，`payroll` 对一般成员显示 `forbidden`。这样 Phase 0 不做复杂菜单过滤逻辑，但已知权限边界从路由层当天生效。

### 4.6 `App.tsx`

挂载时调用 `useAuthStore.getState().hydrate()` 一次；把 `<RouterProvider>` 放在 `<AuthHydrationGate>` 内：在 `hydrated` 之前全局显示 Spin（避免闪登录页）。`AuthHydrationGate` 不负责重定向，只负责等待 session/access token/refresh token 校验完成。

### 4.7 `pages/LoginPage.tsx`

对现有桩的替换，保留视觉，补上：

- 表单使用 `AntD Form.useForm()`；字段：`phone` / `password` / `rememberMe`（默认 `true`）
- `onFinish` 调 `useAuthStore().login({ phone, password, rememberMe })`；成功后 `navigate('/employees')`
- 失败用 `message.error(e.message)` 显示
- 注册按钮：仍是 `alert` / `Modal.info` 提示联系超管
- 忘记密码：Phase 0 做成 `message.info('请联系超级管理员重置密码')` — spec 写"预留入口"

### 4.8 `layouts/AppShell.tsx` 改造

- 删掉硬编码 `currentUser`
- 读 `useAuthStore`：
  - 有 user：沿用现有布局；名字左侧绿点；Tag 显示角色中文（映射 `SUPER_ADMIN→超级管理员 / ADMIN→管理员 / MEMBER→一般成员`）；外层包 AntD `Popover`，悬停展示：
    - 顶部一行 "身份：xxx"
    - "用户设置"（`onClick` → `message.info('用户设置将在后续阶段实现')`，Phase 1 真实落地）
    - "退出登录"（`onClick` → `store.logout()` + `navigate('/login')`）
  - 无 user：整块改成 spec §4.3 的访客态——红点 + "访客（点击登录）"文案；整块 `onClick` → `navigate('/login')`；**不出 Popover**

### 4.9 `styles.css`

需要补：

- `.auth-splash` 居中 Spin
- `.unauthorized-page` 居中布局（锁图标、标题、说明、按钮）
- `.user-panel-guest` 的红点样式
- `.user-popover-*` 气泡内部排版

---

## 5. 环境变量与文档

### 5.1 `.env.example`（根）新增：

```env
JWT_ACCESS_SECRET=replace-with-a-long-random-string
JWT_REFRESH_SECRET=replace-with-a-long-random-string
REFRESH_COOKIE_NAME=yanlu_rt
SEED_SUPER_ADMIN_PHONE=13800000000
SEED_SUPER_ADMIN_USERNAME=超级管理员
SEED_SUPER_ADMIN_PASSWORD=replace-with-a-strong-password
```

### 5.2 `apps/api/.env.example` 同上

### 5.3 `apps/web/.env.example`

无新增。

### 5.4 `docs/technical/deployment.md`

- 在"Compose 部署 → 初始化数据库结构"之后新增一节"首次创建超级管理员"：  
  `docker compose run --rm api pnpm prisma:seed`

### 5.5 `docs/technical/frontend-components.md`（新）

落 spec §6：按钮/表格/弹窗/日期四类的 AntD 用法约定（颜色映射、默认首列复选框、弹窗圆角 & 右对齐底部、日期必须用 `DatePicker`）。不写包装组件；纯约定文档。

### 5.6 根 `README.md`

在"本地开发"步骤里补一条：

```bash
pnpm prisma:seed   # 首次创建超级管理员
```

---

## 6. 后端接口契约

| 方法 | 路径 | 守卫 | 请求 | 响应 |
| --- | --- | --- | --- | --- |
| POST | `/api/auth/login` | `@Public()` | `LoginDto` | `{ accessToken, expiresIn, user: AuthUser }` |
| POST | `/api/auth/refresh` | `@Public()` | Cookie | `{ accessToken, expiresIn, user: AuthUser }` |
| POST | `/api/auth/logout` | `@Public()` | Cookie | `204 No Content` |
| GET | `/api/auth/me` | `JwtAuthGuard`（全局） | — | `{ user: AuthUser }` |
| GET | `/api/health` | `@Public()` | — | `{ status, service, timestamp }` |

`AuthUser = { id, phone, username, role: 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER' }`

错误响应统一 NestJS 默认形态：`{ statusCode, message, error }`。

---

## 7. 验收清单（spec §7 映射）

- [ ] 未登录访问 `/employees`、`/students`、`/courses`、`/payroll`、`/links` → 显示"无访问权限"页，侧边栏仍在
- [ ] 未登录访问 `/sop`、`/about` → 正常渲染（ModulePage 占位）
- [ ] 登录页 UI 对齐 fig04（卡片居中、logo、标题、手机号/密码、保留登录状态默认勾选、忘记密码文案、登录/注册按钮）
- [ ] 点"注册"出提示文案：联系超级管理员 + 邮箱
- [ ] 登录成功后自动跳 `/employees`，侧边栏底部显示绿点 + 用户名 + 角色 Tag
- [ ] 悬停用户名出现气泡：身份、用户设置、退出登录
- [ ] 未登录时左下角显示红点 + "访客（点击登录）"，点击跳 `/login`
- [ ] 勾选"保留登录状态"后，关闭再打开浏览器仍可通过 refresh cookie 恢复会话；取消勾选后，浏览器会话结束即失效
- [ ] 刷新任意业务页，登录态不丢
- [ ] 手动篡改 `sessionStorage` 里的 access token 后刷新 → 先尝试 `/auth/refresh`；refresh 失败则回到"无访问权限"且前端会话被清
- [ ] `pnpm prisma:seed` 可在干净库上创建超管；再次执行不重复创建
- [ ] `POST /api/auth/login` 错密码返回 401，正确密码返回 token + user
- [ ] `POST /api/auth/refresh` 在 refresh cookie 有效时可签发新 access token；无效时返回 401
- [ ] `GET /api/auth/me` 带正确 token 返回 user，无 token / 错 token 返回 401

测试以手动执行为准；单元 / e2e 测试基础设施不在 Phase 0 范围内。

---

## 8. 范围边界（明确**不**做）

- 用户增删改查、重置密码、注销账号（Phase 1）
- AuditLog 写入（除 `User.lastLoginAt`）（Phase 1+ 业务动作里再接入）
- 侧边栏按角色过滤菜单（看实际阻力再决定）
- 自动化测试基础设施
- 邮件/短信验证码、密码强度校验、登录失败次数限制
- "用户设置"页（Phase 1+）
- token 黑名单
- AntD 主题进一步定制（只保留现在已经在 `App.tsx` 里的那份）

---

## 9. 变更文件一览

**新增**：

- `apps/api/src/modules/auth/auth.controller.ts`
- `apps/api/src/modules/auth/auth.service.ts`
- `apps/api/src/modules/auth/auth.module.ts`
- `apps/api/src/modules/auth/strategies/jwt.strategy.ts`
- `apps/api/src/modules/auth/guards/jwt-auth.guard.ts`
- `apps/api/src/modules/auth/guards/roles.guard.ts`
- `apps/api/src/modules/auth/decorators/public.decorator.ts`
- `apps/api/src/modules/auth/decorators/roles.decorator.ts`
- `apps/api/src/modules/auth/decorators/current-user.decorator.ts`
- `apps/api/src/modules/auth/dto/login.dto.ts`
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/src/modules/users/users.module.ts`
- `apps/api/prisma/seed.ts`
- `apps/web/src/stores/authStore.ts`
- `apps/web/src/services/http.ts`
- `apps/web/src/features/auth/RequireAuth.tsx`
- `apps/web/src/features/auth/RequireRole.tsx`
- `apps/web/src/features/auth/UnauthorizedPage.tsx`
- `apps/web/src/features/auth/types.ts`（AuthUser / UserRole）
- `docs/technical/frontend-components.md`

**修改**：

- `apps/api/package.json`（依赖 + scripts + prisma.seed）
- `apps/api/src/app.module.ts`（imports + APP_GUARD）
- `apps/api/src/main.ts`（ValidationPipe）
- `apps/api/src/health/health.controller.ts`（`@Public()`）
- `apps/api/.env.example`
- `apps/web/src/App.tsx`（hydrate gate）
- `apps/web/src/router.tsx`（RequireAuth 包裹）
- `apps/web/src/layouts/AppShell.tsx`（读 store + 气泡 + 访客态）
- `apps/web/src/pages/LoginPage.tsx`（接表单）
- `apps/web/src/styles.css`（补 unauthorized / popover 样式）
- `.env.example`
- `docs/technical/deployment.md`
- `README.md`

**不动**：

- `apps/api/src/modules/{employees,students,course-outlines,courses,payroll,links,audit-logs}/`（依然是空占位）
- `apps/api/prisma/schema.prisma`（User 模型已能覆盖 Phase 0 全部需求）
- `apps/web/src/{components,features/*除了auth,hooks,services/*除了http,stores/*除了auth,utils}/`
