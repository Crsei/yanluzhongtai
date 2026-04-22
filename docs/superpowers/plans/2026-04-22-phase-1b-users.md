# Phase 1B — 用户与账号管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1B per `docs/superpowers/specs/2026-04-22-phase-1b-users-design.md`: self-service user settings page, admin users management page, role up/down-grade guards, password reset + account deactivation two-step confirmations, and a first-login forced password change flow.

**Architecture:** Extend existing NestJS `UsersModule` to a full controller/service with 10 endpoints (5 self-service + 5 admin); add a `MustChangePasswordGuard` as the third global `APP_GUARD`; adjust `JwtStrategy` / `RefreshStrategy` to reject deactivated accounts and emit `mustChangePassword` in `req.user`. On the web side, mount two new routes (`/user-settings`, `/users`) under a new minimal `UserSettingsLayout` (opened in a fresh browser tab from the AppShell popover), plus a `/force-password-change` interceptor page for reset/initial flows.

**Tech Stack:** NestJS 10 + Prisma 5 + PostgreSQL + bcrypt + class-validator; React 18 + Ant Design 5 + TanStack Query 5 + Zustand + React Router 6.

---

## Testing Posture

This project ships without an automated test runner (confirmed in `CLAUDE.md`). Phase 1A established a "verify-then-commit" pattern using manual curl/psql/browser checks — Phase 1B follows the same pattern. Each task's "verify" step tells you exactly what to run and what output to expect.

**Prereqs for the verify steps**:
- `pnpm install` at repo root
- Docker (`pnpm compose:up`) or local PostgreSQL + MinIO running
- `pnpm prisma:push` already applied against the running DB
- A working SUPER_ADMIN login (obtain a JWT by hitting `POST /api/auth/login`; reuse across tasks)

**When "verify" calls a curl**: set shell vars once at the start of your session:

```bash
export API=http://localhost:3000/api
# obtain a super-admin access token (phone/password from your local .env SEED_*)
export TOKEN=$(curl -s -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"your-seed-password","rememberMe":false}' \
  | jq -r .accessToken)
```

## File Structure

### Backend (`apps/api`)

**Modify:**
- `prisma/schema.prisma` — add `User.deactivatedAt` + `User.mustChangePassword`
- `src/modules/audit-logs/audit-logs.types.ts` — extend `AuditAction` union with `user.*` variants
- `src/modules/auth/auth.types.ts` — extend `AuthUser` with `mustChangePassword`
- `src/modules/auth/strategies/jwt.strategy.ts` — deactivated check + populate `mustChangePassword`
- `src/modules/auth/strategies/refresh.strategy.ts` — same as above
- `src/modules/auth/auth.service.ts` — populate `mustChangePassword` in `LoginResult.user`
- `src/modules/auth/auth.controller.ts` — nothing structural (response shape unchanged since mustChangePassword is inside `user`)
- `src/modules/users/users.service.ts` — add 10 methods (list / register / updatePhoneSelf / updateUsernameSelf / changePassword / initialChangePassword / resetPassword / updateRole / deactivateSelf / deactivateByAdmin)
- `src/modules/users/users.module.ts` — declare controller
- `src/app.module.ts` — register `MustChangePasswordGuard` as third `APP_GUARD`

**Create:**
- `src/modules/users/users.controller.ts`
- `src/modules/users/dto/{register-user,change-phone,change-username,change-password,initial-change-password,update-role,deactivate-user,list-users}.dto.ts` (8 DTOs)
- `src/modules/auth/guards/must-change-password.guard.ts`

### Frontend (`apps/web`)

**Modify:**
- `src/features/auth/types.ts` — extend `AuthUser` with `mustChangePassword`
- `src/stores/authStore.ts` — persist `mustChangePassword`; expose it on the store
- `src/layouts/AppShell.tsx` — popover "用户设置" button opens `/user-settings` in a new tab
- `src/router.tsx` — add `/user-settings`, `/users`, `/force-password-change` routes
- `src/App.tsx` — hook that redirects to `/force-password-change` when the flag is true
- `src/services/http.ts` — 403 `MUST_CHANGE_PASSWORD` interceptor

**Create:**
- `src/layouts/UserSettingsLayout.tsx`
- `src/services/users.ts` + `src/features/users/types.ts`
- `src/features/user-settings/UserSettingsPage.tsx`
- `src/features/user-settings/{ChangePhoneModal,ChangeUsernameModal,ChangePasswordModal,DeactivateSelfModal}.tsx`
- `src/features/users/UsersListPage.tsx`
- `src/features/users/RoleDropdown.tsx`
- `src/features/users/{RegisterUserModal,ResetPasswordDialog,DeactivateUserModal}.tsx`
- `src/features/users/hooks/{useUsers,useUserMutations}.ts`
- `src/features/auth/ForcePasswordChangePage.tsx`

---

## Task 1: Add User.deactivatedAt and User.mustChangePassword

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Test: psql smoke query

- [ ] **Step 1: Edit the User model**

Open `apps/api/prisma/schema.prisma` and change the `User` block to:

```prisma
model User {
  id                  String     @id @default(cuid())
  phone               String     @unique
  passwordHash        String
  username            String
  role                UserRole   @default(MEMBER)
  createdAt           DateTime   @default(now())
  lastLoginAt         DateTime?
  deactivatedAt       DateTime?
  mustChangePassword  Boolean    @default(false)
  auditLogs           AuditLog[]
}
```

- [ ] **Step 2: Push schema to DB**

Run: `pnpm prisma:push`

Expected (tail of output): `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Regenerate Prisma client**

Run: `pnpm prisma:generate`

Expected: no errors, "Generated Prisma Client" message.

- [ ] **Step 4: Verify columns in DB**

Run (adjust container name / db name to match your `docker-compose.yml`):

```bash
docker compose exec db psql -U postgres -d yanlu -c '\d "User"'
```

Expected: the table listing includes rows `deactivatedAt | timestamp(3)` and `mustChangePassword | boolean | ... default false`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(phase-1b): add User.deactivatedAt and mustChangePassword columns"
```

---

## Task 2: Extend AuditAction union and AuthUser type

**Files:**
- Modify: `apps/api/src/modules/audit-logs/audit-logs.types.ts`
- Modify: `apps/api/src/modules/auth/auth.types.ts`

- [ ] **Step 1: Extend AuditAction union**

Replace `apps/api/src/modules/audit-logs/audit-logs.types.ts` with:

```ts
export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "reset_password"
  | "deactivate"
  | "register"
  | "settle"
  | "user.register"
  | "user.update_phone"
  | "user.update_username"
  | "user.change_password"
  | "user.reset_password"
  | "user.update_role"
  | "user.deactivate";

export type AuditTargetType = "employee" | "user" | "course" | "payroll" | "User";

export type AuditRecordInput = {
  operatorId: string | null;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};
```

The `"User"` value in `AuditTargetType` (capital-U) is new — Phase 1B uses it for symmetry with model names; the existing `"user"` (lowercase) stays in the union for backward compatibility with any legacy callers.

- [ ] **Step 2: Extend AuthUser with mustChangePassword**

Replace `apps/api/src/modules/auth/auth.types.ts` with:

```ts
import { UserRole } from "@prisma/client";

export type AuthUser = {
  id: string;
  phone: string;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
};

export type JwtPayload = {
  sub: string;
};
```

**Design note (deviation from spec §5.2):** The spec originally suggested keeping `AuthUser` unchanged and returning `mustChangePassword` as a top-level field on login/refresh/me responses. In practice, extending `AuthUser` is cleaner because (a) the JWT payload stays minimal — it's still just `{ sub }` — and (b) downstream consumers (MustChangePasswordGuard, frontend) all benefit from the field being on the user object. This is a semantic no-op since JWT payload size is unaffected.

- [ ] **Step 3: Verify type compiles**

Run: `pnpm --filter @yanlu/api exec tsc --noEmit`

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/audit-logs/audit-logs.types.ts apps/api/src/modules/auth/auth.types.ts
git commit -m "feat(phase-1b): extend AuditAction union and AuthUser with mustChangePassword"
```

---

## Task 3: UsersService helpers + list

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts`

- [ ] **Step 1: Add list + guard helpers to UsersService**

Replace `apps/api/src/modules/users/users.service.ts` with:

```ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, User, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";

export const BCRYPT_COST = 12;

export type UserListItem = {
  id: string;
  phone: string;
  username: string;
  role: UserRole;
  createdAt: Date;
  lastLoginAt: Date | null;
  deactivatedAt: Date | null;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  // --- lookups used by auth strategies & controllers ---

  findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async createSuperAdmin(input: {
    phone: string;
    username: string;
    password: string;
  }): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    return this.prisma.user.create({
      data: {
        phone: input.phone,
        username: input.username,
        passwordHash,
        role: UserRole.SUPER_ADMIN,
      },
    });
  }

  verifyPassword(password: string, hash: string) {
    return bcrypt.compare(password, hash);
  }

  // --- Phase 1B additions ---

  /**
   * Throws ConflictException("系统至少保留 1 个超级管理员") if the caller is
   * about to remove / demote / deactivate the *last* active SUPER_ADMIN.
   * Callers must already know that the target currently IS a SUPER_ADMIN
   * whose state is about to change.
   */
  async guardLastActiveSuperAdmin(
    targetId: string,
    targetCurrentRole: UserRole,
  ): Promise<void> {
    if (targetCurrentRole !== UserRole.SUPER_ADMIN) return;
    const others = await this.prisma.user.count({
      where: {
        role: UserRole.SUPER_ADMIN,
        deactivatedAt: null,
        NOT: { id: targetId },
      },
    });
    if (others === 0) {
      throw new ConflictException("系统至少保留 1 个超级管理员");
    }
  }

  async list(params: {
    page: number;
    pageSize: number;
    keyword?: string;
    includeDeactivated: boolean;
  }): Promise<{ items: UserListItem[]; total: number }> {
    const trimmed = params.keyword?.trim();
    const where: Prisma.UserWhereInput = {
      ...(params.includeDeactivated ? {} : { deactivatedAt: null }),
      ...(trimmed
        ? {
            OR: [
              { phone: { contains: trimmed, mode: "insensitive" } },
              { username: { contains: trimmed, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [
          { lastLoginAt: { sort: "desc", nulls: "last" } },
          { createdAt: "desc" },
        ],
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: {
          id: true,
          phone: true,
          username: true,
          role: true,
          createdAt: true,
          lastLoginAt: true,
          deactivatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }
}
```

- [ ] **Step 2: Compile check**

Run: `pnpm --filter @yanlu/api exec tsc --noEmit`

Expected: no errors. (The module is not yet wired to `AuditLogsService`, but TS doesn't care — Task 9 handles wiring.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/users/users.service.ts
git commit -m "feat(phase-1b): add UsersService.list and guardLastActiveSuperAdmin"
```

---

## Task 4: UsersService.register + resetPassword

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts`

- [ ] **Step 1: Append register + resetPassword methods**

Open `apps/api/src/modules/users/users.service.ts`. Inside the `UsersService` class, immediately **after** the `list` method (still inside the class body), add:

```ts
  async register(input: {
    operatorId: string;
    phone: string;
    username: string;
    role: UserRole;
  }): Promise<{
    id: string;
    phone: string;
    username: string;
    role: UserRole;
    initialPassword: string;
  }> {
    const initialPassword = input.phone.slice(-6);
    const passwordHash = await bcrypt.hash(initialPassword, BCRYPT_COST);
    try {
      const user = await this.prisma.user.create({
        data: {
          phone: input.phone,
          username: input.username,
          role: input.role,
          passwordHash,
          mustChangePassword: true,
        },
      });
      await this.auditLogs.record({
        operatorId: input.operatorId,
        action: "user.register",
        targetType: "User",
        targetId: user.id,
        before: null,
        after: {
          phone: user.phone,
          username: user.username,
          role: user.role,
        },
      });
      return {
        id: user.id,
        phone: user.phone,
        username: user.username,
        role: user.role,
        initialPassword,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException("手机号已被使用");
      }
      throw err;
    }
  }

  async resetPassword(input: {
    operatorId: string;
    targetId: string;
  }): Promise<{ tempPassword: string }> {
    const target = await this.prisma.user.findUnique({
      where: { id: input.targetId },
    });
    if (!target) throw new NotFoundException("用户不存在");
    const tempPassword = target.phone.slice(-6);
    const newHash = await bcrypt.hash(tempPassword, BCRYPT_COST);
    await this.prisma.user.update({
      where: { id: input.targetId },
      data: { passwordHash: newHash, mustChangePassword: true },
    });
    await this.auditLogs.record({
      operatorId: input.operatorId,
      action: "user.reset_password",
      targetType: "User",
      targetId: input.targetId,
      before: null,
      after: null,
    });
    return { tempPassword };
  }
```

- [ ] **Step 2: Compile check**

Run: `pnpm --filter @yanlu/api exec tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/users/users.service.ts
git commit -m "feat(phase-1b): add UsersService.register and resetPassword"
```

---

## Task 5: UsersService self-service edits

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts`

- [ ] **Step 1: Add self-service mutators**

Append these four methods to the `UsersService` class (after `resetPassword`):

```ts
  async updatePhoneSelf(input: {
    userId: string;
    newPhone: string;
    currentPassword: string;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
    });
    if (!user) throw new NotFoundException("用户不存在");
    const ok = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException("当前密码不正确");
    if (user.phone === input.newPhone) return;

    try {
      await this.prisma.user.update({
        where: { id: input.userId },
        data: { phone: input.newPhone },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException("手机号已被使用");
      }
      throw err;
    }

    await this.auditLogs.record({
      operatorId: input.userId,
      action: "user.update_phone",
      targetType: "User",
      targetId: input.userId,
      before: { phone: user.phone },
      after: { phone: input.newPhone },
    });
  }

  async updateUsernameSelf(input: {
    userId: string;
    newUsername: string;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
    });
    if (!user) throw new NotFoundException("用户不存在");
    if (user.username === input.newUsername) return;
    await this.prisma.user.update({
      where: { id: input.userId },
      data: { username: input.newUsername },
    });
    await this.auditLogs.record({
      operatorId: input.userId,
      action: "user.update_username",
      targetType: "User",
      targetId: input.userId,
      before: { username: user.username },
      after: { username: input.newUsername },
    });
  }

  async changePassword(input: {
    userId: string;
    oldPassword: string;
    newPassword: string;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
    });
    if (!user) throw new NotFoundException("用户不存在");
    const ok = await bcrypt.compare(input.oldPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException("旧密码不正确");
    if (input.newPassword === input.oldPassword) {
      throw new BadRequestException("新密码不能与旧密码相同");
    }
    const newHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
    await this.prisma.user.update({
      where: { id: input.userId },
      data: { passwordHash: newHash },
    });
    await this.auditLogs.record({
      operatorId: input.userId,
      action: "user.change_password",
      targetType: "User",
      targetId: input.userId,
      before: null,
      after: null,
    });
  }

  async initialChangePassword(input: {
    userId: string;
    newPassword: string;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
    });
    if (!user) throw new NotFoundException("用户不存在");
    if (!user.mustChangePassword) {
      throw new ForbiddenException("当前账号无需初始化密码");
    }
    const initialPassword = user.phone.slice(-6);
    if (input.newPassword === initialPassword) {
      throw new BadRequestException("新密码不能与初始密码相同");
    }
    const newHash = await bcrypt.hash(input.newPassword, BCRYPT_COST);
    await this.prisma.user.update({
      where: { id: input.userId },
      data: { passwordHash: newHash, mustChangePassword: false },
    });
    await this.auditLogs.record({
      operatorId: input.userId,
      action: "user.change_password",
      targetType: "User",
      targetId: input.userId,
      before: null,
      after: null,
    });
  }
```

- [ ] **Step 2: Add the missing imports**

At the top of the same file, update the `@nestjs/common` import to include the new exceptions used above:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
```

- [ ] **Step 3: Compile check**

Run: `pnpm --filter @yanlu/api exec tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/users/users.service.ts
git commit -m "feat(phase-1b): add UsersService self-service edit methods"
```

---

## Task 6: UsersService.updateRole

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts`

- [ ] **Step 1: Append updateRole method**

Append this method to the `UsersService` class (after `initialChangePassword`):

```ts
  async updateRole(input: {
    operatorId: string;
    operatorRole: UserRole;
    targetId: string;
    newRole: UserRole;
  }): Promise<void> {
    if (input.operatorId === input.targetId) {
      throw new ForbiddenException("不能修改自己的角色");
    }
    const target = await this.prisma.user.findUnique({
      where: { id: input.targetId },
    });
    if (!target) throw new NotFoundException("用户不存在");
    if (target.deactivatedAt) {
      throw new BadRequestException("已注销账号不可修改角色");
    }
    if (target.role === input.newRole) return;

    // ADMIN operator: only allowed to promote MEMBER → ADMIN
    if (input.operatorRole === UserRole.ADMIN) {
      const allowed =
        target.role === UserRole.MEMBER && input.newRole === UserRole.ADMIN;
      if (!allowed) {
        throw new ForbiddenException("无权执行此角色变更");
      }
    }

    // Prevent draining the last active SUPER_ADMIN
    if (target.role === UserRole.SUPER_ADMIN && input.newRole !== UserRole.SUPER_ADMIN) {
      await this.guardLastActiveSuperAdmin(input.targetId, target.role);
    }

    await this.prisma.user.update({
      where: { id: input.targetId },
      data: { role: input.newRole },
    });
    await this.auditLogs.record({
      operatorId: input.operatorId,
      action: "user.update_role",
      targetType: "User",
      targetId: input.targetId,
      before: { role: target.role },
      after: { role: input.newRole },
    });
  }
```

- [ ] **Step 2: Compile check**

Run: `pnpm --filter @yanlu/api exec tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/users/users.service.ts
git commit -m "feat(phase-1b): add UsersService.updateRole with promotion guards"
```

---

## Task 7: UsersService.deactivateSelf + deactivateByAdmin

**Files:**
- Modify: `apps/api/src/modules/users/users.service.ts`

- [ ] **Step 1: Append both deactivate methods**

Append these two methods to the `UsersService` class (after `updateRole`):

```ts
  async deactivateSelf(input: {
    userId: string;
    phoneConfirmation: string;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
    });
    if (!user) throw new NotFoundException("用户不存在");
    if (user.deactivatedAt) throw new BadRequestException("账号已注销");
    if (user.phone !== input.phoneConfirmation) {
      throw new BadRequestException("手机号校对失败");
    }
    await this.guardLastActiveSuperAdmin(input.userId, user.role);

    const deactivatedAt = new Date();
    await this.prisma.user.update({
      where: { id: input.userId },
      data: { deactivatedAt },
    });
    await this.auditLogs.record({
      operatorId: input.userId,
      action: "user.deactivate",
      targetType: "User",
      targetId: input.userId,
      before: null,
      after: { deactivatedAt: deactivatedAt.toISOString() },
    });
  }

  async deactivateByAdmin(input: {
    operatorId: string;
    targetId: string;
    phoneConfirmation: string;
  }): Promise<void> {
    if (input.operatorId === input.targetId) {
      throw new ForbiddenException("自注销请使用 /users/me/deactivate");
    }
    const target = await this.prisma.user.findUnique({
      where: { id: input.targetId },
    });
    if (!target) throw new NotFoundException("用户不存在");
    if (target.deactivatedAt) throw new BadRequestException("账号已注销");
    if (target.phone !== input.phoneConfirmation) {
      throw new BadRequestException("手机号校对失败");
    }
    await this.guardLastActiveSuperAdmin(input.targetId, target.role);

    const deactivatedAt = new Date();
    await this.prisma.user.update({
      where: { id: input.targetId },
      data: { deactivatedAt },
    });
    await this.auditLogs.record({
      operatorId: input.operatorId,
      action: "user.deactivate",
      targetType: "User",
      targetId: input.targetId,
      before: null,
      after: { deactivatedAt: deactivatedAt.toISOString() },
    });
  }
```

- [ ] **Step 2: Compile check**

Run: `pnpm --filter @yanlu/api exec tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/users/users.service.ts
git commit -m "feat(phase-1b): add UsersService.deactivateSelf and deactivateByAdmin"
```

---

## Task 8: DTOs for the users controller

**Files:**
- Create: `apps/api/src/modules/users/dto/register-user.dto.ts`
- Create: `apps/api/src/modules/users/dto/change-phone.dto.ts`
- Create: `apps/api/src/modules/users/dto/change-username.dto.ts`
- Create: `apps/api/src/modules/users/dto/change-password.dto.ts`
- Create: `apps/api/src/modules/users/dto/initial-change-password.dto.ts`
- Create: `apps/api/src/modules/users/dto/update-role.dto.ts`
- Create: `apps/api/src/modules/users/dto/deactivate-user.dto.ts`
- Create: `apps/api/src/modules/users/dto/list-users.dto.ts`

- [ ] **Step 1: Create RegisterUserDto**

`apps/api/src/modules/users/dto/register-user.dto.ts`:

```ts
import { UserRole } from "@prisma/client";
import { IsEnum, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class RegisterUserDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: "手机号格式不正确" })
  phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  username!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
```

- [ ] **Step 2: Create ChangePhoneDto**

`apps/api/src/modules/users/dto/change-phone.dto.ts`:

```ts
import { IsString, Matches } from "class-validator";

export class ChangePhoneDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: "手机号格式不正确" })
  newPhone!: string;

  @IsString()
  currentPassword!: string;
}
```

- [ ] **Step 3: Create ChangeUsernameDto**

`apps/api/src/modules/users/dto/change-username.dto.ts`:

```ts
import { IsString, MaxLength, MinLength } from "class-validator";

export class ChangeUsernameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  newUsername!: string;
}
```

- [ ] **Step 4: Create ChangePasswordDto**

`apps/api/src/modules/users/dto/change-password.dto.ts`:

```ts
import { IsString, Matches, MinLength } from "class-validator";

export class ChangePasswordDto {
  @IsString()
  oldPassword!: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, {
    message: "密码需≥8字符且含字母与数字",
  })
  newPassword!: string;
}
```

- [ ] **Step 5: Create InitialChangePasswordDto**

`apps/api/src/modules/users/dto/initial-change-password.dto.ts`:

```ts
import { IsString, Matches, MinLength } from "class-validator";

export class InitialChangePasswordDto {
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, {
    message: "密码需≥8字符且含字母与数字",
  })
  newPassword!: string;
}
```

- [ ] **Step 6: Create UpdateRoleDto**

`apps/api/src/modules/users/dto/update-role.dto.ts`:

```ts
import { UserRole } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}
```

- [ ] **Step 7: Create DeactivateUserDto**

`apps/api/src/modules/users/dto/deactivate-user.dto.ts`:

```ts
import { IsString } from "class-validator";

export class DeactivateUserDto {
  @IsString()
  phoneConfirmation!: string;
}
```

- [ ] **Step 8: Create ListUsersDto**

`apps/api/src/modules/users/dto/list-users.dto.ts`:

```ts
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListUsersDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize: number = 50;

  @IsOptional()
  @IsString()
  keyword?: string;

  @Transform(({ value }) => value === true || value === "true" || value === 1)
  @IsBoolean()
  includeDeactivated: boolean = false;
}
```

- [ ] **Step 9: Compile check**

Run: `pnpm --filter @yanlu/api exec tsc --noEmit`

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/users/dto/
git commit -m "feat(phase-1b): add users module DTOs"
```

---

## Task 9: UsersController + module wiring

**Files:**
- Create: `apps/api/src/modules/users/users.controller.ts`
- Modify: `apps/api/src/modules/users/users.module.ts`

- [ ] **Step 1: Create UsersController**

`apps/api/src/modules/users/users.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ChangePhoneDto } from "./dto/change-phone.dto";
import { ChangeUsernameDto } from "./dto/change-username.dto";
import { DeactivateUserDto } from "./dto/deactivate-user.dto";
import { InitialChangePasswordDto } from "./dto/initial-change-password.dto";
import { ListUsersDto } from "./dto/list-users.dto";
import { RegisterUserDto } from "./dto/register-user.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // --- Self-service endpoints (any authenticated user) ---

  @Patch("me/phone")
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateMyPhone(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePhoneDto,
  ): Promise<void> {
    await this.usersService.updatePhoneSelf({
      userId: user.id,
      newPhone: dto.newPhone,
      currentPassword: dto.currentPassword,
    });
  }

  @Patch("me/username")
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateMyUsername(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeUsernameDto,
  ): Promise<void> {
    await this.usersService.updateUsernameSelf({
      userId: user.id,
      newUsername: dto.newUsername,
    });
  }

  @Patch("me/password")
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeMyPassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.usersService.changePassword({
      userId: user.id,
      oldPassword: dto.oldPassword,
      newPassword: dto.newPassword,
    });
  }

  @Post("me/initial-password-change")
  @HttpCode(HttpStatus.NO_CONTENT)
  async initialChangeMyPassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: InitialChangePasswordDto,
  ): Promise<void> {
    await this.usersService.initialChangePassword({
      userId: user.id,
      newPassword: dto.newPassword,
    });
  }

  @Post("me/deactivate")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateMe(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeactivateUserDto,
  ): Promise<void> {
    await this.usersService.deactivateSelf({
      userId: user.id,
      phoneConfirmation: dto.phoneConfirmation,
    });
  }

  // --- Admin endpoints ---

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  list(@Query() dto: ListUsersDto) {
    return this.usersService.list({
      page: dto.page,
      pageSize: dto.pageSize,
      keyword: dto.keyword,
      includeDeactivated: dto.includeDeactivated,
    });
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterUserDto) {
    return this.usersService.register({
      operatorId: user.id,
      phone: dto.phone,
      username: dto.username,
      role: dto.role,
    });
  }

  @Patch(":id/role")
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateRole(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateRoleDto,
  ): Promise<void> {
    await this.usersService.updateRole({
      operatorId: user.id,
      operatorRole: user.role,
      targetId: id,
      newRole: dto.role,
    });
  }

  @Post(":id/reset-password")
  @Roles(UserRole.SUPER_ADMIN)
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
  ) {
    return this.usersService.resetPassword({
      operatorId: user.id,
      targetId: id,
    });
  }

  @Post(":id/deactivate")
  @Roles(UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateByAdmin(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: DeactivateUserDto,
  ): Promise<void> {
    await this.usersService.deactivateByAdmin({
      operatorId: user.id,
      targetId: id,
      phoneConfirmation: dto.phoneConfirmation,
    });
  }
}
```

- [ ] **Step 2: Register controller in UsersModule**

Replace `apps/api/src/modules/users/users.module.ts` with:

```ts
import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

`AuditLogsModule` is `@Global()` so we don't need to import it explicitly.

- [ ] **Step 3: Compile + boot check**

Run: `pnpm --filter @yanlu/api exec tsc --noEmit`

Expected: no errors.

Then run: `pnpm dev:api` (in the foreground long enough to see it boot)

Expected: the Nest bootstrap log shows `Mapped {/api/users, GET}` and the other new routes. Ctrl-C to stop.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/users/users.controller.ts apps/api/src/modules/users/users.module.ts
git commit -m "feat(phase-1b): expose users CRUD + self-service endpoints"
```

---

## Task 10: JwtStrategy + RefreshStrategy: deactivated check + mustChangePassword

**Files:**
- Modify: `apps/api/src/modules/auth/strategies/jwt.strategy.ts`
- Modify: `apps/api/src/modules/auth/strategies/refresh.strategy.ts`

- [ ] **Step 1: Update JwtStrategy**

Replace `apps/api/src/modules/auth/strategies/jwt.strategy.ts` with:

```ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UsersService } from "../../users/users.service";
import { AuthUser, JwtPayload } from "../auth.types";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.deactivatedAt) {
      throw new UnauthorizedException("账号已注销");
    }
    return {
      id: user.id,
      phone: user.phone,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
```

- [ ] **Step 2: Update RefreshStrategy**

Replace `apps/api/src/modules/auth/strategies/refresh.strategy.ts` with:

```ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Request } from "express";
import { Strategy } from "passport-jwt";
import { UsersService } from "../../users/users.service";
import { AuthUser, JwtPayload } from "../auth.types";

export const DEFAULT_REFRESH_COOKIE_NAME = "yanlu_rt";

function cookieExtractor(cookieName: string) {
  return (req: Request): string | null => {
    const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
    return cookies?.[cookieName] ?? null;
  };
}

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, "refresh-jwt") {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const cookieName = config.get<string>("REFRESH_COOKIE_NAME", DEFAULT_REFRESH_COOKIE_NAME);
    super({
      jwtFromRequest: cookieExtractor(cookieName),
      secretOrKey: config.getOrThrow<string>("JWT_REFRESH_SECRET"),
      ignoreExpiration: false,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.deactivatedAt) {
      throw new UnauthorizedException("账号已注销");
    }
    return {
      id: user.id,
      phone: user.phone,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
```

- [ ] **Step 3: Compile check**

Run: `pnpm --filter @yanlu/api exec tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/auth/strategies/jwt.strategy.ts apps/api/src/modules/auth/strategies/refresh.strategy.ts
git commit -m "feat(phase-1b): reject deactivated accounts and propagate mustChangePassword in auth strategies"
```

---

## Task 11: AuthService login/refresh populates mustChangePassword

**Files:**
- Modify: `apps/api/src/modules/auth/auth.service.ts`

- [ ] **Step 1: Populate mustChangePassword in LoginResult.user**

Open `apps/api/src/modules/auth/auth.service.ts`. Find the block that builds `authUser` inside `login()`. Replace just that construction:

```ts
    const authUser: AuthUser = {
      id: user.id,
      phone: user.phone,
      username: user.username,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
```

No other change is needed — `issueAccessToken()` takes an `AuthUser` argument the caller already built, so `/auth/refresh` will propagate whatever `RefreshStrategy.validate()` populated (see Task 10).

- [ ] **Step 2: Compile check**

Run: `pnpm --filter @yanlu/api exec tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: End-to-end smoke on the backend auth flow**

In one shell run `pnpm dev:api`. In another:

```bash
# Login → expect user.mustChangePassword in response
curl -s -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone":"13800138000","password":"your-seed-password","rememberMe":false}' \
  | jq .user
```

Expected: the JSON has `"mustChangePassword": false` (seed super admin has the default).

```bash
# /auth/me also exposes it
curl -s -H "Authorization: Bearer $TOKEN" $API/auth/me | jq .user
```

Expected: same `"mustChangePassword": false` present.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/auth/auth.service.ts
git commit -m "feat(phase-1b): populate mustChangePassword in AuthService login result"
```

---

## Task 12: MustChangePasswordGuard + register as APP_GUARD

**Files:**
- Create: `apps/api/src/modules/auth/guards/must-change-password.guard.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the guard**

`apps/api/src/modules/auth/guards/must-change-password.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { AuthUser } from "../auth.types";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

/**
 * Paths (after the global /api prefix) that are allowed even when the
 * authenticated user has mustChangePassword=true. Everything else is blocked
 * so the user is forced through /users/me/initial-password-change.
 */
const ALWAYS_ALLOWED: ReadonlyArray<{ method: string; path: string }> = [
  { method: "GET", path: "/auth/me" },
  { method: "POST", path: "/users/me/initial-password-change" },
];

@Injectable()
export class MustChangePasswordGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const user = (req as Request & { user?: AuthUser }).user;
    if (!user) return true; // unauthenticated — JwtAuthGuard will handle
    if (!user.mustChangePassword) return true;

    const method = req.method.toUpperCase();
    const path = (req.originalUrl ?? req.url ?? "").split("?")[0];
    const allowed = ALWAYS_ALLOWED.some(
      (rule) => rule.method === method && path.endsWith(rule.path),
    );
    if (allowed) return true;

    throw new ForbiddenException({
      code: "MUST_CHANGE_PASSWORD",
      message: "请先修改密码",
    });
  }
}
```

- [ ] **Step 2: Register as APP_GUARD**

Replace `apps/api/src/app.module.ts` with:

```ts
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { validateEnvironment } from "./config/env.validation";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { IdSequenceModule } from "./common/id-sequence/id-sequence.module";
import { AuthModule } from "./modules/auth/auth.module";
import { JwtAuthGuard } from "./modules/auth/guards/jwt-auth.guard";
import { MustChangePasswordGuard } from "./modules/auth/guards/must-change-password.guard";
import { RolesGuard } from "./modules/auth/guards/roles.guard";
import { UsersModule } from "./modules/users/users.module";
import { StorageModule } from "./modules/storage/storage.module";
import { AuditLogsModule } from "./modules/audit-logs/audit-logs.module";
import { EmployeesModule } from "./modules/employees/employees.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["apps/api/.env", ".env"],
      validate: validateEnvironment,
    }),
    PrismaModule,
    IdSequenceModule,
    StorageModule,
    AuditLogsModule,
    EmployeesModule,
    UsersModule,
    AuthModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: MustChangePasswordGuard,
    },
  ],
})
export class AppModule {}
```

The order matters: `JwtAuthGuard` first populates `req.user`; `RolesGuard` gates on role; `MustChangePasswordGuard` runs last so it can read both the user and route.

- [ ] **Step 3: End-to-end smoke**

Restart API (`pnpm dev:api`). Temporarily toggle a user's `mustChangePassword` directly in the DB to verify the guard:

```bash
# 1) Obtain a regular access token
# 2) Flip the flag on the logged-in user (replace <user-id>)
docker compose exec db psql -U postgres -d yanlu -c \
  "UPDATE \"User\" SET \"mustChangePassword\" = true WHERE id = '<user-id>';"

# 3) Call any business endpoint → expect 403 with code MUST_CHANGE_PASSWORD
curl -s -H "Authorization: Bearer $TOKEN" $API/employees | jq .
```

Expected:
```json
{
  "statusCode": 403,
  "code": "MUST_CHANGE_PASSWORD",
  "message": "请先修改密码"
}
```

Then whitelist check:

```bash
curl -s -H "Authorization: Bearer $TOKEN" $API/auth/me | jq .user.mustChangePassword
```

Expected: `true` (GET /auth/me is whitelisted so it succeeds).

**Roll back the flag** after smoke:

```bash
docker compose exec db psql -U postgres -d yanlu -c \
  "UPDATE \"User\" SET \"mustChangePassword\" = false WHERE id = '<user-id>';"
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/auth/guards/must-change-password.guard.ts apps/api/src/app.module.ts
git commit -m "feat(phase-1b): gate non-whitelisted endpoints behind MustChangePasswordGuard"
```

---

## Task 13: Frontend services/users.ts + types

**Files:**
- Create: `apps/web/src/features/users/types.ts`
- Create: `apps/web/src/services/users.ts`

- [ ] **Step 1: Create shared types**

`apps/web/src/features/users/types.ts`:

```ts
import type { UserRole } from "../auth/types";

export type UserListItem = {
  id: string;
  phone: string;
  username: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
  deactivatedAt: string | null;
};

export type ListUsersParams = {
  page: number;
  pageSize: number;
  keyword?: string;
  includeDeactivated?: boolean;
};

export type ListUsersResponse = {
  items: UserListItem[];
  total: number;
};

export type RegisterUserPayload = {
  phone: string;
  username: string;
  role: UserRole;
};

export type RegisterUserResponse = {
  id: string;
  phone: string;
  username: string;
  role: UserRole;
  initialPassword: string;
};
```

- [ ] **Step 2: Create API wrappers**

`apps/web/src/services/users.ts`:

```ts
import { api } from "./http";
import type {
  ListUsersParams,
  ListUsersResponse,
  RegisterUserPayload,
  RegisterUserResponse,
} from "../features/users/types";
import type { UserRole } from "../features/auth/types";

function buildQuery(params: ListUsersParams): string {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  if (params.keyword) qs.set("keyword", params.keyword);
  if (params.includeDeactivated) qs.set("includeDeactivated", "true");
  return `?${qs.toString()}`;
}

export const usersApi = {
  list: (params: ListUsersParams) =>
    api.get<ListUsersResponse>(`/users${buildQuery(params)}`),

  register: (body: RegisterUserPayload) =>
    api.post<RegisterUserResponse>("/users", body),

  updateMyPhone: (body: { newPhone: string; currentPassword: string }) =>
    api.patch<void>("/users/me/phone", body),

  updateMyUsername: (body: { newUsername: string }) =>
    api.patch<void>("/users/me/username", body),

  changeMyPassword: (body: { oldPassword: string; newPassword: string }) =>
    api.patch<void>("/users/me/password", body),

  initialChangeMyPassword: (body: { newPassword: string }) =>
    api.post<void>("/users/me/initial-password-change", body),

  deactivateMe: (body: { phoneConfirmation: string }) =>
    api.post<void>("/users/me/deactivate", body),

  updateRole: (id: string, body: { role: UserRole }) =>
    api.patch<void>(`/users/${id}/role`, body),

  resetPassword: (id: string) =>
    api.post<{ tempPassword: string }>(`/users/${id}/reset-password`),

  deactivateUser: (id: string, body: { phoneConfirmation: string }) =>
    api.post<void>(`/users/${id}/deactivate`, body),
};
```

- [ ] **Step 3: Compile check**

Run: `pnpm --filter @yanlu/web exec tsc -b`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/users/types.ts apps/web/src/services/users.ts
git commit -m "feat(phase-1b)(web): add users API service and types"
```

---

## Task 14: Frontend AuthUser + authStore + AppShell popover

**Files:**
- Modify: `apps/web/src/features/auth/types.ts`
- Modify: `apps/web/src/stores/authStore.ts`
- Modify: `apps/web/src/layouts/AppShell.tsx`

- [ ] **Step 1: Extend AuthUser**

Replace `apps/web/src/features/auth/types.ts` with:

```ts
export type UserRole = "SUPER_ADMIN" | "ADMIN" | "MEMBER";

export type AuthUser = {
  id: string;
  phone: string;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "超级管理员",
  ADMIN: "管理员",
  MEMBER: "一般成员",
};
```

- [ ] **Step 2: Keep authStore backward-compatible**

Open `apps/web/src/stores/authStore.ts`. No structural edit is required — `AuthUser` is now richer but the store just shuttles it. TypeScript will now require callers to include `mustChangePassword` when they build an `AuthUser` — login/refresh both come from the API so the field will be present already.

**But**: the cached `readPersisted()` value may be missing the field if written by an older client. Harden the parse with a migration shim. Replace the `readPersisted` function body with:

```ts
function readPersisted(): PersistedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedSession;
    // Migration shim: older sessions didn't have mustChangePassword on user.
    if (parsed?.user && typeof parsed.user.mustChangePassword !== "boolean") {
      parsed.user = { ...parsed.user, mustChangePassword: false };
    }
    return parsed;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: AppShell popover opens a new tab**

Open `apps/web/src/layouts/AppShell.tsx`. Locate the "用户设置" Button inside `popoverContent`. Replace that button with:

```tsx
        <Button
          type="text"
          block
          onClick={() => window.open("/user-settings", "_blank", "noopener")}
        >
          用户设置
        </Button>
```

After this change, `message` is no longer used anywhere in `AppShell.tsx`. Remove the `message,` line from the antd import block at the top of the file (otherwise tsc will complain about the unused import under the project's strict settings).

- [ ] **Step 4: Compile check**

Run: `pnpm --filter @yanlu/web exec tsc -b`

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/auth/types.ts apps/web/src/stores/authStore.ts apps/web/src/layouts/AppShell.tsx
git commit -m "feat(phase-1b)(web): extend AuthUser with mustChangePassword and wire popover to /user-settings"
```

---

## Task 15: UserSettingsLayout + router.tsx routes

**Files:**
- Create: `apps/web/src/layouts/UserSettingsLayout.tsx`
- Modify: `apps/web/src/router.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Create minimal layout**

`apps/web/src/layouts/UserSettingsLayout.tsx`:

```tsx
import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button, Layout, Typography } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const { Header, Content } = Layout;

export function UserSettingsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const onUsersPage = location.pathname === "/users";

  return (
    <Layout className="user-settings-shell">
      <Header className="user-settings-header">
        <Typography.Title level={3} style={{ margin: 0 }}>
          {onUsersPage ? "全部用户管理" : "用户设置"}
        </Typography.Title>
        {onUsersPage && (
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate("/user-settings")}
          >
            返回设置
          </Button>
        )}
      </Header>
      <Content className="user-settings-content">
        <Outlet />
      </Content>
    </Layout>
  );
}
```

- [ ] **Step 2: Add minimal styles**

Append to `apps/web/src/styles.css`:

```css
.user-settings-shell {
  min-height: 100vh;
  background: #f3f6fb;
}

.user-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #ffffff;
  padding: 0 32px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
}

.user-settings-content {
  padding: 32px;
  max-width: 960px;
  margin: 0 auto;
}
```

- [ ] **Step 3: Wire routes**

Replace `apps/web/src/router.tsx` with:

```tsx
import { createBrowserRouter } from "react-router-dom";
import { RequireAuth } from "./features/auth/RequireAuth";
import { RequireRole } from "./features/auth/RequireRole";
import { RootEntryRedirect } from "./features/auth/RootEntryRedirect";
import { EmployeeListPage } from "./features/employees/EmployeeListPage";
import { AppShell } from "./layouts/AppShell";
import { UserSettingsLayout } from "./layouts/UserSettingsLayout";
import { LoginPage } from "./pages/LoginPage";
import { ModulePage } from "./pages/ModulePage";
import { UserSettingsPage } from "./features/user-settings/UserSettingsPage";
import { UsersListPage } from "./features/users/UsersListPage";
import { ForcePasswordChangePage } from "./features/auth/ForcePasswordChangePage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/force-password-change",
    element: (
      <RequireAuth>
        <ForcePasswordChangePage />
      </RequireAuth>
    ),
  },
  {
    element: (
      <RequireAuth>
        <UserSettingsLayout />
      </RequireAuth>
    ),
    children: [
      { path: "/user-settings", element: <UserSettingsPage /> },
      {
        path: "/users",
        element: (
          <RequireRole roles={["SUPER_ADMIN", "ADMIN"]}>
            <UsersListPage />
          </RequireRole>
        ),
      },
    ],
  },
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <RootEntryRedirect /> },
      {
        path: "employees",
        element: (
          <RequireAuth>
            <EmployeeListPage />
          </RequireAuth>
        ),
      },
      {
        path: "students",
        element: (
          <RequireAuth>
            <ModulePage
              title="学生管理"
              summary="对应学生列表、高级搜索、服务字段、学管老师/规划师选择器。"
              milestones={["学生模块路由已预留", "可挂载高级搜索页", "可扩展课时剩余看板字段"]}
              specs={["docs/spec/03-Phase2-学生管理.md"]}
            />
          </RequireAuth>
        ),
      },
      {
        path: "courses",
        element: (
          <RequireAuth>
            <ModulePage
              title="课程管理"
              summary="包含课程大纲、课程详情、学生选课和高级搜索等核心业务链路。"
              milestones={["课程模块路由已预留", "移动端侧边栏形态已预留", "后续可拆 outline / detail 子路由"]}
              specs={[
                "docs/spec/04-Phase3-课程大纲管理.md",
                "docs/spec/05-Phase4-课程信息与学生选课.md",
              ]}
            />
          </RequireAuth>
        ),
      },
      {
        path: "payroll",
        element: (
          <RequireAuth>
            <RequireRole roles={["SUPER_ADMIN", "ADMIN"]}>
              <ModulePage
                title="薪酬管理"
                summary="对应老师课时汇总、结算弹窗、手动记录和按周期筛选。"
                milestones={["薪酬模块路由已预留", "后续直接对接课程与结算接口", "适合追加列表与弹窗容器"]}
                specs={["docs/spec/06-Phase5-薪酬管理.md"]}
              />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "links",
        element: (
          <RequireAuth>
            <ModulePage
              title="数据表"
              summary="对应内部数据表和快捷跳转卡片中心。"
              milestones={["入口页路由已预留", "后续可直接挂卡片网格组件", "适合对接 QuickLink 接口"]}
              specs={["docs/spec/07-Phase6-数据表-SOP-关于.md"]}
            />
          </RequireAuth>
        ),
      },
      {
        path: "sop",
        element: (
          <ModulePage
            title="SOP"
            summary="对应 SOP 跳转中心与 hover 视觉差异化设计。"
            milestones={["SOP 路由已预留", "后续可复用数据表卡片组件", "访客开放能力可在此页优先接入"]}
            specs={["docs/spec/07-Phase6-数据表-SOP-关于.md"]}
          />
        ),
      },
      {
        path: "about",
        element: (
          <ModulePage
            title="关于"
            summary="对应版本信息、企业信息、日志入口和版权备案区域。"
            milestones={["关于页路由已预留", "日志入口可在接入 RBAC 后落盘", "适合挂健康检查与版本信息"]}
            specs={["docs/spec/07-Phase6-数据表-SOP-关于.md"]}
          />
        ),
      },
    ],
  },
]);
```

Note: the three new pages (`UserSettingsPage`, `UsersListPage`, `ForcePasswordChangePage`) are imported above but will be created in later tasks. The tsc build will fail at this point until Tasks 16, 18, 20, 22 land. To keep the tree buildable between commits, create minimal placeholders in Step 4 below before committing.

- [ ] **Step 4: Create placeholder pages so build stays green**

`apps/web/src/features/user-settings/UserSettingsPage.tsx`:

```tsx
export function UserSettingsPage() {
  return <div>UserSettingsPage placeholder</div>;
}
```

`apps/web/src/features/users/UsersListPage.tsx`:

```tsx
export function UsersListPage() {
  return <div>UsersListPage placeholder</div>;
}
```

`apps/web/src/features/auth/ForcePasswordChangePage.tsx`:

```tsx
export function ForcePasswordChangePage() {
  return <div>ForcePasswordChangePage placeholder</div>;
}
```

- [ ] **Step 5: Compile check**

Run: `pnpm --filter @yanlu/web exec tsc -b`

Expected: no errors.

- [ ] **Step 6: Browser smoke**

Start `pnpm dev:web`. Log in, then in the address bar type `/user-settings` — you should see the minimal layout header "用户设置" and the placeholder text. Navigate to `/users` — header becomes "全部用户管理" with a "返回设置" button.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/layouts/UserSettingsLayout.tsx apps/web/src/router.tsx apps/web/src/styles.css apps/web/src/features/user-settings/UserSettingsPage.tsx apps/web/src/features/users/UsersListPage.tsx apps/web/src/features/auth/ForcePasswordChangePage.tsx
git commit -m "feat(phase-1b)(web): scaffold UserSettingsLayout and routes with page placeholders"
```

---

## Task 16: UserSettingsPage (cards + permission zone, no modals)

**Files:**
- Modify: `apps/web/src/features/user-settings/UserSettingsPage.tsx`

- [ ] **Step 1: Replace placeholder with real page**

Replace `apps/web/src/features/user-settings/UserSettingsPage.tsx` with:

```tsx
import { Button, Card, Space, Typography } from "antd";
import { useState } from "react";
import { useAuthStore } from "../../stores/authStore";

export function UserSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const [changePhoneOpen, setChangePhoneOpen] = useState(false);
  const [changeUsernameOpen, setChangeUsernameOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  if (!user) return null;

  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const isAdmin = user.role === "ADMIN";
  const showPermissionZone = isSuperAdmin || isAdmin;

  return (
    <div className="user-settings-page">
      <Card style={{ marginBottom: 16 }}>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">绑定手机号</div>
            <div className="settings-row-value">{user.phone}</div>
          </div>
          <Button onClick={() => setChangePhoneOpen(true)}>修改</Button>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">员工姓名</div>
            <div className="settings-row-value">{user.username}</div>
          </div>
          <Button onClick={() => setChangeUsernameOpen(true)}>修改</Button>
        </div>
      </Card>

      <Card title="账号安全" style={{ marginBottom: 16 }}>
        <Space>
          <Button onClick={() => setChangePasswordOpen(true)}>修改密码</Button>
          <Button danger onClick={() => setDeactivateOpen(true)}>
            注销账号
          </Button>
        </Space>
      </Card>

      {showPermissionZone && (
        <Card title="权限区">
          <Space wrap>
            <Button onClick={() => window.open("/users", "_blank", "noopener")}>
              设置管理员
            </Button>
            {isSuperAdmin && (
              <>
                <Button
                  onClick={() => window.open("/users", "_blank", "noopener")}
                >
                  设置超级管理员
                </Button>
                <Button
                  onClick={() => window.open("/users", "_blank", "noopener")}
                >
                  中台全部用户管理
                </Button>
              </>
            )}
          </Space>
          <Typography.Paragraph
            type="secondary"
            style={{ marginTop: 12, marginBottom: 0 }}
          >
            点击上方按钮将在新标签页打开"全部用户管理"页面。
          </Typography.Paragraph>
        </Card>
      )}

      {/* Modals wired in Tasks 17-18 */}
      {changePhoneOpen && <div data-testid="change-phone-placeholder" />}
      {changeUsernameOpen && <div data-testid="change-username-placeholder" />}
      {changePasswordOpen && <div data-testid="change-password-placeholder" />}
      {deactivateOpen && <div data-testid="deactivate-self-placeholder" />}
    </div>
  );
}
```

- [ ] **Step 2: Add row-level styles**

Append to `apps/web/src/styles.css`:

```css
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.settings-row-title {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.55);
  margin-bottom: 4px;
}

.settings-row-value {
  font-size: 16px;
  color: #0f172a;
}
```

- [ ] **Step 3: Compile check**

Run: `pnpm --filter @yanlu/web exec tsc -b`

Expected: no errors.

- [ ] **Step 4: Browser smoke**

Log in as SUPER_ADMIN → `/user-settings` should show: phone card, username card, 修改密码/注销 buttons, and a permission zone with three buttons. Log in as a MEMBER (create one via DB insert if needed) → the permission zone should not render.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/user-settings/UserSettingsPage.tsx apps/web/src/styles.css
git commit -m "feat(phase-1b)(web): implement UserSettingsPage with permission zone"
```

---

## Task 17: Self-service modals batch 1 — ChangePhone + ChangeUsername

**Files:**
- Create: `apps/web/src/features/user-settings/ChangePhoneModal.tsx`
- Create: `apps/web/src/features/user-settings/ChangeUsernameModal.tsx`
- Modify: `apps/web/src/features/user-settings/UserSettingsPage.tsx`

- [ ] **Step 1: Create ChangePhoneModal**

`apps/web/src/features/user-settings/ChangePhoneModal.tsx`:

```tsx
import { Form, Input, Modal, message } from "antd";
import { useEffect } from "react";
import { useAuthStore } from "../../stores/authStore";
import { usersApi } from "../../services/users";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FieldValues = {
  newPhone: string;
  currentPassword: string;
};

export function ChangePhoneModal({ open, onClose }: Props) {
  const [form] = Form.useForm<FieldValues>();
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const accessToken = useAuthStore((s) => s.accessToken);
  const rememberMe = useAuthStore((s) => s.rememberMe);

  useEffect(() => {
    if (!open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await usersApi.updateMyPhone({
        newPhone: values.newPhone,
        currentPassword: values.currentPassword,
      });
      if (user && accessToken) {
        setSession({
          accessToken,
          rememberMe,
          user: { ...user, phone: values.newPhone },
        });
      }
      message.success("手机号已更新");
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "更新失败");
    }
  };

  return (
    <Modal
      title="修改手机号"
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      okText="确定"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="newPhone"
          label="新手机号"
          rules={[
            { required: true, message: "请输入手机号" },
            {
              pattern: /^1[3-9]\d{9}$/,
              message: "手机号格式不正确",
            },
          ]}
        >
          <Input placeholder="请输入新的手机号" maxLength={11} />
        </Form.Item>
        <Form.Item
          name="currentPassword"
          label="当前密码"
          rules={[{ required: true, message: "请输入当前密码以确认身份" }]}
        >
          <Input.Password placeholder="请输入当前密码" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 2: Create ChangeUsernameModal**

`apps/web/src/features/user-settings/ChangeUsernameModal.tsx`:

```tsx
import { Form, Input, Modal, message } from "antd";
import { useEffect } from "react";
import { useAuthStore } from "../../stores/authStore";
import { usersApi } from "../../services/users";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FieldValues = {
  newUsername: string;
};

export function ChangeUsernameModal({ open, onClose }: Props) {
  const [form] = Form.useForm<FieldValues>();
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const accessToken = useAuthStore((s) => s.accessToken);
  const rememberMe = useAuthStore((s) => s.rememberMe);

  useEffect(() => {
    if (!open) form.resetFields();
    else if (user) form.setFieldsValue({ newUsername: user.username });
  }, [open, form, user]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await usersApi.updateMyUsername({ newUsername: values.newUsername });
      if (user && accessToken) {
        setSession({
          accessToken,
          rememberMe,
          user: { ...user, username: values.newUsername },
        });
      }
      message.success("员工姓名已更新");
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "更新失败");
    }
  };

  return (
    <Modal
      title="修改员工姓名"
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      okText="确定"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="newUsername"
          label="员工姓名"
          rules={[
            { required: true, message: "请输入员工姓名" },
            { max: 50, message: "姓名长度不超过 50 字" },
          ]}
        >
          <Input placeholder="请输入员工姓名" maxLength={50} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 3: Wire modals into UserSettingsPage**

Open `apps/web/src/features/user-settings/UserSettingsPage.tsx`. Replace the placeholder divs at the bottom with real modal imports. Update imports at top:

```tsx
import { ChangePhoneModal } from "./ChangePhoneModal";
import { ChangeUsernameModal } from "./ChangeUsernameModal";
```

And replace the four placeholder `<div data-testid=...>` blocks with:

```tsx
      <ChangePhoneModal
        open={changePhoneOpen}
        onClose={() => setChangePhoneOpen(false)}
      />
      <ChangeUsernameModal
        open={changeUsernameOpen}
        onClose={() => setChangeUsernameOpen(false)}
      />
      {changePasswordOpen && <div data-testid="change-password-placeholder" />}
      {deactivateOpen && <div data-testid="deactivate-self-placeholder" />}
```

- [ ] **Step 4: Compile check**

Run: `pnpm --filter @yanlu/web exec tsc -b`

Expected: no errors.

- [ ] **Step 5: Browser smoke**

Log in, open `/user-settings`, click "修改" on phone → modal opens → submit with invalid current password → red banner "当前密码不正确". Retry with correct password → modal closes and the phone text on the card updates.

Same for 员工姓名 (no password required). Refresh page → new value persists (from DB).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/user-settings/ChangePhoneModal.tsx apps/web/src/features/user-settings/ChangeUsernameModal.tsx apps/web/src/features/user-settings/UserSettingsPage.tsx
git commit -m "feat(phase-1b)(web): add ChangePhone and ChangeUsername self-service modals"
```

---

## Task 18: Self-service modals batch 2 — ChangePassword + DeactivateSelf

**Files:**
- Create: `apps/web/src/features/user-settings/ChangePasswordModal.tsx`
- Create: `apps/web/src/features/user-settings/DeactivateSelfModal.tsx`
- Modify: `apps/web/src/features/user-settings/UserSettingsPage.tsx`

- [ ] **Step 1: Create ChangePasswordModal**

`apps/web/src/features/user-settings/ChangePasswordModal.tsx`:

```tsx
import { Form, Input, Modal, message } from "antd";
import { useEffect } from "react";
import { usersApi } from "../../services/users";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FieldValues = {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export function ChangePasswordModal({ open, onClose }: Props) {
  const [form] = Form.useForm<FieldValues>();

  useEffect(() => {
    if (!open) form.resetFields();
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await usersApi.changeMyPassword({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success("密码已更新");
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "更新失败");
    }
  };

  return (
    <Modal
      title="修改密码"
      open={open}
      onOk={handleSubmit}
      onCancel={onClose}
      okText="确定"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item
          name="oldPassword"
          label="当前密码"
          rules={[{ required: true, message: "请输入当前密码" }]}
        >
          <Input.Password placeholder="请输入当前密码" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label="新密码"
          rules={[
            { required: true, message: "请输入新密码" },
            {
              pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/,
              message: "密码需≥8字符且含字母与数字",
            },
          ]}
        >
          <Input.Password placeholder="≥8 位，含字母与数字" />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="确认新密码"
          dependencies={["newPassword"]}
          rules={[
            { required: true, message: "请再次输入新密码" },
            ({ getFieldValue }) => ({
              validator(_rule, value) {
                if (!value || getFieldValue("newPassword") === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error("两次输入的密码不一致"));
              },
            }),
          ]}
        >
          <Input.Password placeholder="请再次输入新密码" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 2: Create DeactivateSelfModal (two-step)**

`apps/web/src/features/user-settings/DeactivateSelfModal.tsx`:

```tsx
import { Alert, Input, Modal, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { usersApi } from "../../services/users";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function DeactivateSelfModal({ open, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [phoneInput, setPhoneInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setPhoneInput("");
      setSubmitting(false);
    }
  }, [open]);

  if (!user) return null;

  const isPhoneMatch = phoneInput === user.phone;

  const handleConfirm = async () => {
    if (step === 1) {
      setStep(2);
      return;
    }
    if (!isPhoneMatch) return;
    setSubmitting(true);
    try {
      await usersApi.deactivateMe({ phoneConfirmation: phoneInput });
      message.success("账号已注销");
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "注销失败");
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title="注销账号"
      open={open}
      onOk={handleConfirm}
      onCancel={onClose}
      okText={step === 1 ? "继续" : "确认注销"}
      cancelText="取消"
      okButtonProps={{
        danger: true,
        disabled: step === 2 && !isPhoneMatch,
        loading: submitting,
      }}
      destroyOnClose
    >
      {step === 1 ? (
        <Alert
          type="warning"
          showIcon
          message={`您确定注销手机号 ${user.phone} 的账号吗？`}
          description="注销后该账号将立即失效，历史审计记录会保留但账号无法恢复。如仅是暂停使用，请联系超级管理员。"
        />
      ) : (
        <>
          <Typography.Paragraph>
            请再次输入您的手机号 <Typography.Text strong>{user.phone}</Typography.Text> 以确认注销：
          </Typography.Paragraph>
          <Input
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value.trim())}
            placeholder="请输入完整手机号"
            maxLength={11}
          />
          {phoneInput && !isPhoneMatch && (
            <Typography.Text type="danger" style={{ display: "block", marginTop: 8 }}>
              手机号与当前账号不一致
            </Typography.Text>
          )}
        </>
      )}
    </Modal>
  );
}
```

- [ ] **Step 3: Wire modals into UserSettingsPage**

Open `apps/web/src/features/user-settings/UserSettingsPage.tsx`. Update imports to add:

```tsx
import { ChangePasswordModal } from "./ChangePasswordModal";
import { DeactivateSelfModal } from "./DeactivateSelfModal";
```

Replace the two remaining placeholder divs with:

```tsx
      <ChangePasswordModal
        open={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
      <DeactivateSelfModal
        open={deactivateOpen}
        onClose={() => setDeactivateOpen(false)}
      />
```

- [ ] **Step 4: Compile check**

Run: `pnpm --filter @yanlu/web exec tsc -b`

Expected: no errors.

- [ ] **Step 5: Browser smoke**

1. 修改密码: open modal → submit with wrong oldPassword → "旧密码不正确" → retry with correct oldPassword and same as new → "新密码不能与旧密码相同" → retry with a valid new password → succeeds.
2. 注销账号 (do this on a *test* account, not your only SUPER_ADMIN — create a MEMBER first): open modal → step 1 shows warning → click 继续 → step 2 asks for phone → type wrong phone → ok button stays disabled → type correct phone → click 确认注销 → logs out and redirects to `/login`. Attempting to log back in with that user should now return 401 "账号已注销".

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/user-settings/ChangePasswordModal.tsx apps/web/src/features/user-settings/DeactivateSelfModal.tsx apps/web/src/features/user-settings/UserSettingsPage.tsx
git commit -m "feat(phase-1b)(web): add ChangePassword and DeactivateSelf two-step modals"
```

---

## Task 19: UsersListPage + RoleDropdown + hooks

**Files:**
- Create: `apps/web/src/features/users/hooks/useUsers.ts`
- Create: `apps/web/src/features/users/hooks/useUserMutations.ts`
- Create: `apps/web/src/features/users/RoleDropdown.tsx`
- Modify: `apps/web/src/features/users/UsersListPage.tsx`

- [ ] **Step 1: Create useUsers hook**

`apps/web/src/features/users/hooks/useUsers.ts`:

```ts
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usersApi } from "../../../services/users";
import type { ListUsersParams } from "../types";

export function useUsers(params: ListUsersParams) {
  return useQuery({
    queryKey: ["users", params],
    queryFn: () => usersApi.list(params),
    placeholderData: keepPreviousData,
  });
}
```

- [ ] **Step 2: Create useUserMutations hook**

`apps/web/src/features/users/hooks/useUserMutations.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usersApi } from "../../../services/users";
import type { RegisterUserPayload } from "../types";
import type { UserRole } from "../../auth/types";

export function useUserMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["users"] });

  const register = useMutation({
    mutationFn: (body: RegisterUserPayload) => usersApi.register(body),
    onSuccess: invalidate,
  });

  const updateRole = useMutation({
    mutationFn: (args: { id: string; role: UserRole }) =>
      usersApi.updateRole(args.id, { role: args.role }),
    onSuccess: invalidate,
  });

  const resetPassword = useMutation({
    mutationFn: (id: string) => usersApi.resetPassword(id),
  });

  const deactivate = useMutation({
    mutationFn: (args: { id: string; phoneConfirmation: string }) =>
      usersApi.deactivateUser(args.id, { phoneConfirmation: args.phoneConfirmation }),
    onSuccess: invalidate,
  });

  return { register, updateRole, resetPassword, deactivate };
}
```

- [ ] **Step 3: Create RoleDropdown**

`apps/web/src/features/users/RoleDropdown.tsx`:

```tsx
import { Select, Tag, message } from "antd";
import { Modal } from "antd";
import { useAuthStore } from "../../stores/authStore";
import { ROLE_LABELS, type UserRole } from "../auth/types";
import { useUserMutations } from "./hooks/useUserMutations";

type Props = {
  targetId: string;
  targetRole: UserRole;
  targetUsername: string;
  disabled?: boolean;
};

const ROLE_COLOR: Record<UserRole, string> = {
  SUPER_ADMIN: "volcano",
  ADMIN: "geekblue",
  MEMBER: "default",
};

export function RoleDropdown({ targetId, targetRole, targetUsername, disabled }: Props) {
  const viewer = useAuthStore((s) => s.user);
  const { updateRole } = useUserMutations();
  if (!viewer) return null;

  const isSelf = viewer.id === targetId;
  const isViewerAdmin = viewer.role === "ADMIN";
  const isViewerSuperAdmin = viewer.role === "SUPER_ADMIN";

  const allowedOptions = ((): UserRole[] => {
    if (isSelf) return [targetRole];
    if (isViewerAdmin) {
      // ADMIN can only promote MEMBER to ADMIN
      if (targetRole === "MEMBER") return ["MEMBER", "ADMIN"];
      return [targetRole];
    }
    if (isViewerSuperAdmin) return ["MEMBER", "ADMIN", "SUPER_ADMIN"];
    return [targetRole];
  })();

  const readOnly = disabled || isSelf || allowedOptions.length <= 1;

  if (readOnly) {
    return <Tag color={ROLE_COLOR[targetRole]}>{ROLE_LABELS[targetRole]}</Tag>;
  }

  const handleChange = (newRole: UserRole) => {
    if (newRole === targetRole) return;
    Modal.confirm({
      title: `确认将 ${targetUsername} 设为 ${ROLE_LABELS[newRole]}?`,
      content: "角色变更会立即生效并写入审计日志。",
      okText: "确认",
      cancelText: "取消",
      onOk: async () => {
        try {
          await updateRole.mutateAsync({ id: targetId, role: newRole });
          message.success("角色已更新");
        } catch (err) {
          message.error(err instanceof Error ? err.message : "角色更新失败");
        }
      },
    });
  };

  return (
    <Select
      value={targetRole}
      onChange={handleChange}
      style={{ minWidth: 140 }}
      options={allowedOptions.map((role) => ({
        value: role,
        label: ROLE_LABELS[role],
      }))}
    />
  );
}
```

- [ ] **Step 4: Replace UsersListPage placeholder**

Replace `apps/web/src/features/users/UsersListPage.tsx` with:

```tsx
import { PlusOutlined, StopOutlined, SyncOutlined } from "@ant-design/icons";
import { Button, Input, Space, Switch, Table, Tag, Typography, message } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { useAuthStore } from "../../stores/authStore";
import { ROLE_LABELS, type UserRole } from "../auth/types";
import { RoleDropdown } from "./RoleDropdown";
import { useUsers } from "./hooks/useUsers";
import type { UserListItem } from "./types";

const PAGE_SIZE = 50;

export function UsersListPage() {
  const viewer = useAuthStore((s) => s.user);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [includeDeactivated, setIncludeDeactivated] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [resetTargetId, setResetTargetId] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserListItem | null>(null);

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      keyword: keyword || undefined,
      includeDeactivated,
    }),
    [page, keyword, includeDeactivated],
  );
  const { data, isLoading, isFetching } = useUsers(params);

  if (!viewer) return null;
  const isSuperAdmin = viewer.role === "SUPER_ADMIN";

  const columns = [
    { title: "注册手机号", dataIndex: "phone", key: "phone", width: 140 },
    { title: "用户名", dataIndex: "username", key: "username", width: 160 },
    {
      title: "用户权限",
      dataIndex: "role",
      key: "role",
      width: 160,
      render: (role: UserRole, row: UserListItem) => (
        <RoleDropdown
          targetId={row.id}
          targetRole={role}
          targetUsername={row.username}
          disabled={!!row.deactivatedAt}
        />
      ),
    },
    {
      title: "注册时间",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "最近访问时间",
      dataIndex: "lastLoginAt",
      key: "lastLoginAt",
      width: 160,
      render: (v: string | null) => (v ? dayjs(v).format("YYYY-MM-DD HH:mm") : "—"),
    },
    {
      title: "状态",
      dataIndex: "deactivatedAt",
      key: "status",
      width: 100,
      render: (v: string | null) =>
        v ? <Tag color="default">已注销</Tag> : <Tag color="success">在用</Tag>,
    },
    {
      title: "操作",
      key: "actions",
      width: 240,
      render: (_: unknown, row: UserListItem) => {
        const isSelf = row.id === viewer.id;
        const isDeactivated = !!row.deactivatedAt;
        const adminDisabled = !isSuperAdmin || isSelf || isDeactivated;
        return (
          <Space>
            <Button
              size="small"
              icon={<SyncOutlined />}
              disabled={adminDisabled}
              onClick={() => setResetTargetId(row.id)}
            >
              重置密码
            </Button>
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              disabled={adminDisabled}
              onClick={() => setDeactivateTarget(row)}
            >
              注销
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        全部用户管理
      </Typography.Title>

      <div className="users-toolbar">
        <Space wrap>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={!isSuperAdmin}
            onClick={() => setRegisterOpen(true)}
          >
            注册账号
          </Button>
          <span>
            <Switch
              checked={includeDeactivated}
              onChange={(v) => {
                setIncludeDeactivated(v);
                setPage(1);
              }}
            />{" "}
            显示已注销
          </span>
        </Space>
        <div style={{ flex: 1 }} />
        <Input.Search
          allowClear
          placeholder="搜索 手机号 / 用户名"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onSearch={(value) => {
            setKeyword(value.trim());
            setPage(1);
          }}
          style={{ width: 280 }}
        />
      </div>

      <Table<UserListItem>
        rowKey="id"
        loading={isLoading || isFetching}
        dataSource={data?.items ?? []}
        columns={columns}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />

      {/* Admin modals wired in Task 20 */}
      {registerOpen && <div data-testid="register-placeholder" />}
      {resetTargetId && <div data-testid="reset-placeholder" />}
      {deactivateTarget && <div data-testid="deactivate-placeholder" />}
    </div>
  );
}
```

- [ ] **Step 5: Add toolbar styles**

Append to `apps/web/src/styles.css`:

```css
.users-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
```

- [ ] **Step 6: Compile check**

Run: `pnpm --filter @yanlu/web exec tsc -b`

Expected: no errors.

- [ ] **Step 7: Browser smoke**

1. SUPER_ADMIN → `/users` → see list with columns and operations column.
2. Change a MEMBER → ADMIN via dropdown → confirm dialog → success → list refreshes.
3. Toggle "显示已注销" off/on → list filters; deactivated rows (if any) show "已注销" tag.
4. ADMIN → `/users` → role dropdown only lets them promote MEMBER → ADMIN; other rows show a static Tag; operations buttons 重置/注销 are disabled; 注册按钮 disabled.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/users/
git commit -m "feat(phase-1b)(web): implement UsersListPage with role dropdown and hooks"
```

---

## Task 20: Admin modals — Register + ResetPassword + DeactivateUser

**Files:**
- Create: `apps/web/src/features/users/RegisterUserModal.tsx`
- Create: `apps/web/src/features/users/ResetPasswordDialog.tsx`
- Create: `apps/web/src/features/users/DeactivateUserModal.tsx`
- Modify: `apps/web/src/features/users/UsersListPage.tsx`

- [ ] **Step 1: Create RegisterUserModal**

`apps/web/src/features/users/RegisterUserModal.tsx`:

```tsx
import { Form, Input, Modal, Radio, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { ROLE_LABELS, type UserRole } from "../auth/types";
import { useUserMutations } from "./hooks/useUserMutations";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FieldValues = {
  phone: string;
  username: string;
  role: UserRole;
};

export function RegisterUserModal({ open, onClose }: Props) {
  const [form] = Form.useForm<FieldValues>();
  const { register } = useUserMutations();
  const [initialPassword, setInitialPassword] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      form.resetFields();
      setInitialPassword(null);
    }
  }, [open, form]);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      const res = await register.mutateAsync(values);
      setInitialPassword(res.initialPassword);
      message.success("账号已创建");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "创建失败");
    }
  };

  return (
    <Modal
      title={initialPassword ? "账号已创建" : "注册账号"}
      open={open}
      onOk={initialPassword ? onClose : handleSubmit}
      onCancel={onClose}
      okText={initialPassword ? "完成" : "确定"}
      cancelText={initialPassword ? undefined : "取消"}
      cancelButtonProps={initialPassword ? { style: { display: "none" } } : undefined}
      destroyOnClose
    >
      {initialPassword ? (
        <>
          <Typography.Paragraph>
            账号创建成功。请将以下初始密码转告用户，用户首次登录时将强制修改密码：
          </Typography.Paragraph>
          <Typography.Paragraph>
            <Typography.Text code copyable style={{ fontSize: 18 }}>
              {initialPassword}
            </Typography.Text>
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary">
            关闭弹窗后将无法再次查看此初始密码；如忘记请使用"重置密码"操作。
          </Typography.Paragraph>
        </>
      ) : (
        <Form
          form={form}
          layout="vertical"
          preserve={false}
          initialValues={{ role: "MEMBER" as UserRole }}
        >
          <Form.Item
            name="phone"
            label="手机号"
            rules={[
              { required: true, message: "请输入手机号" },
              { pattern: /^1[3-9]\d{9}$/, message: "手机号格式不正确" },
            ]}
          >
            <Input placeholder="11 位手机号" maxLength={11} />
          </Form.Item>
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: "请输入用户名" },
              { max: 50, message: "用户名长度不超过 50 字" },
            ]}
          >
            <Input placeholder="请输入用户名" maxLength={50} />
          </Form.Item>
          <Form.Item
            name="role"
            label="账号角色"
            rules={[{ required: true, message: "请选择角色" }]}
          >
            <Radio.Group>
              <Radio value="MEMBER">{ROLE_LABELS.MEMBER}</Radio>
              <Radio value="ADMIN">{ROLE_LABELS.ADMIN}</Radio>
              <Radio value="SUPER_ADMIN">{ROLE_LABELS.SUPER_ADMIN}</Radio>
            </Radio.Group>
          </Form.Item>
          <Typography.Paragraph type="secondary">
            初始密码为手机号后 6 位，用户首次登录时强制修改。
          </Typography.Paragraph>
        </Form>
      )}
    </Modal>
  );
}
```

- [ ] **Step 2: Create ResetPasswordDialog**

`apps/web/src/features/users/ResetPasswordDialog.tsx`:

```tsx
import { Modal, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useUserMutations } from "./hooks/useUserMutations";
import type { UserListItem } from "./types";

type Props = {
  open: boolean;
  target: UserListItem | null;
  onClose: () => void;
};

export function ResetPasswordDialog({ open, target, onClose }: Props) {
  const { resetPassword } = useUserMutations();
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setTempPassword(null);
  }, [open]);

  if (!target) return null;

  const handleConfirm = async () => {
    try {
      const res = await resetPassword.mutateAsync(target.id);
      setTempPassword(res.tempPassword);
      message.success("密码已重置");
    } catch (err) {
      message.error(err instanceof Error ? err.message : "重置失败");
    }
  };

  return (
    <Modal
      title={tempPassword ? "密码已重置" : "重置密码"}
      open={open}
      onOk={tempPassword ? onClose : handleConfirm}
      onCancel={onClose}
      okText={tempPassword ? "完成" : "确认重置"}
      cancelText={tempPassword ? undefined : "取消"}
      okButtonProps={{ danger: !tempPassword, loading: resetPassword.isPending }}
      cancelButtonProps={tempPassword ? { style: { display: "none" } } : undefined}
      destroyOnClose
    >
      {tempPassword ? (
        <>
          <Typography.Paragraph>
            用户 <Typography.Text strong>{target.username}</Typography.Text>（{target.phone}）的密码已重置。新密码如下：
          </Typography.Paragraph>
          <Typography.Paragraph>
            <Typography.Text code copyable style={{ fontSize: 18 }}>
              {tempPassword}
            </Typography.Text>
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary">
            该密码为此次重置生成的临时密码，用户下次登录时强制修改。关闭后不再展示。
          </Typography.Paragraph>
        </>
      ) : (
        <>
          <Typography.Paragraph>
            您确定重置 <Typography.Text strong>{target.username}</Typography.Text>（{target.phone}）的密码吗？
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary">
            新密码将被设为该用户手机号的后 6 位，用户下次登录时强制修改。此操作将写入审计日志。
          </Typography.Paragraph>
        </>
      )}
    </Modal>
  );
}
```

- [ ] **Step 3: Create DeactivateUserModal (two-step)**

`apps/web/src/features/users/DeactivateUserModal.tsx`:

```tsx
import { Alert, Input, Modal, Typography, message } from "antd";
import { useEffect, useState } from "react";
import { useUserMutations } from "./hooks/useUserMutations";
import type { UserListItem } from "./types";

type Props = {
  open: boolean;
  target: UserListItem | null;
  onClose: () => void;
};

export function DeactivateUserModal({ open, target, onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [phoneInput, setPhoneInput] = useState("");
  const { deactivate } = useUserMutations();

  useEffect(() => {
    if (!open) {
      setStep(1);
      setPhoneInput("");
    }
  }, [open]);

  if (!target) return null;

  const isPhoneMatch = phoneInput === target.phone;

  const handleConfirm = async () => {
    if (step === 1) {
      setStep(2);
      return;
    }
    if (!isPhoneMatch) return;
    try {
      await deactivate.mutateAsync({
        id: target.id,
        phoneConfirmation: phoneInput,
      });
      message.success("账号已注销");
      onClose();
    } catch (err) {
      message.error(err instanceof Error ? err.message : "注销失败");
    }
  };

  return (
    <Modal
      title="注销账号"
      open={open}
      onOk={handleConfirm}
      onCancel={onClose}
      okText={step === 1 ? "继续" : "确认注销"}
      cancelText="取消"
      okButtonProps={{
        danger: true,
        disabled: step === 2 && !isPhoneMatch,
        loading: deactivate.isPending,
      }}
      destroyOnClose
    >
      {step === 1 ? (
        <Alert
          type="warning"
          showIcon
          message={`您确定注销 ${target.phone}（${target.username}）的账号吗？`}
          description="注销后该账号将立即失效。历史审计记录会保留，但账号本身无法在界面上恢复。"
        />
      ) : (
        <>
          <Typography.Paragraph>
            请再次输入目标手机号 <Typography.Text strong>{target.phone}</Typography.Text> 以确认注销：
          </Typography.Paragraph>
          <Input
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value.trim())}
            placeholder="请输入完整手机号"
            maxLength={11}
          />
          {phoneInput && !isPhoneMatch && (
            <Typography.Text type="danger" style={{ display: "block", marginTop: 8 }}>
              手机号与目标账号不一致
            </Typography.Text>
          )}
        </>
      )}
    </Modal>
  );
}
```

- [ ] **Step 4: Wire modals into UsersListPage**

Open `apps/web/src/features/users/UsersListPage.tsx`. Update imports:

```tsx
import { RegisterUserModal } from "./RegisterUserModal";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { DeactivateUserModal } from "./DeactivateUserModal";
```

Replace the three placeholder `<div data-testid=...>` blocks with:

```tsx
      <RegisterUserModal open={registerOpen} onClose={() => setRegisterOpen(false)} />
      <ResetPasswordDialog
        open={resetTargetId !== null}
        target={(data?.items ?? []).find((r) => r.id === resetTargetId) ?? null}
        onClose={() => setResetTargetId(null)}
      />
      <DeactivateUserModal
        open={deactivateTarget !== null}
        target={deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
      />
```

- [ ] **Step 5: Compile check**

Run: `pnpm --filter @yanlu/web exec tsc -b`

Expected: no errors.

- [ ] **Step 6: Browser smoke**

1. SUPER_ADMIN → `/users` → 点 "注册账号" → 填 13800001234 / 张三 / MEMBER → 确定 → 弹窗切换到"账号已创建"视图，展示初始密码 001234 → 关闭 → 列表刷新，新用户出现。
2. 重置该用户密码 → 弹 ResetPasswordDialog 第 1 步（警告）→ 确认重置 → 切换为"密码已重置"视图，展示 001234 → 关闭。
3. 注销该用户 → 弹 DeactivateUserModal step1 → 继续 → step2 输错手机号 → button disabled → 输对 → 确认注销 → 列表刷新，该行显示"已注销"标签；该用户尝试登录应返回 401。

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/users/
git commit -m "feat(phase-1b)(web): add Register/ResetPassword/Deactivate admin modals"
```

---

## Task 21: ForcePasswordChangePage + 403 interceptor + App.tsx effect

**Files:**
- Modify: `apps/web/src/features/auth/ForcePasswordChangePage.tsx`
- Modify: `apps/web/src/services/http.ts`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Replace ForcePasswordChangePage placeholder**

Replace `apps/web/src/features/auth/ForcePasswordChangePage.tsx` with:

```tsx
import { Alert, Button, Card, Form, Input, Typography, message } from "antd";
import { useNavigate } from "react-router-dom";
import { usersApi } from "../../services/users";
import { useAuthStore } from "../../stores/authStore";

type FieldValues = {
  newPassword: string;
  confirmPassword: string;
};

export function ForcePasswordChangePage() {
  const [form] = Form.useForm<FieldValues>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const rememberMe = useAuthStore((s) => s.rememberMe);
  const setSession = useAuthStore((s) => s.setSession);

  const handleSubmit = async () => {
    const values = await form.validateFields();
    try {
      await usersApi.initialChangeMyPassword({ newPassword: values.newPassword });
      if (user && accessToken) {
        setSession({
          accessToken,
          rememberMe,
          user: { ...user, mustChangePassword: false },
        });
      }
      message.success("密码已设置，欢迎使用");
      navigate("/", { replace: true });
    } catch (err) {
      message.error(err instanceof Error ? err.message : "设置失败");
    }
  };

  return (
    <div className="force-password-page">
      <Card style={{ maxWidth: 480, width: "100%" }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          设置新密码
        </Typography.Title>
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="您的密码刚被重置或初始化"
          description="请设置一个新的登录密码后继续使用系统。新密码需 ≥8 字符并同时包含字母与数字。"
        />
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: "请输入新密码" },
              {
                pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,}$/,
                message: "密码需≥8字符且含字母与数字",
              },
            ]}
          >
            <Input.Password placeholder="≥8 位，含字母与数字" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={["newPassword"]}
            rules={[
              { required: true, message: "请再次输入新密码" },
              ({ getFieldValue }) => ({
                validator(_rule, value) {
                  if (!value || getFieldValue("newPassword") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("两次输入的密码不一致"));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            确认并继续
          </Button>
        </Form>
      </Card>
    </div>
  );
}
```

Append styles to `apps/web/src/styles.css`:

```css
.force-password-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(180deg, #eef3f9 0%, #dfe7f3 100%);
  padding: 24px;
}
```

- [ ] **Step 2: Teach http.ts to redirect on 403 MUST_CHANGE_PASSWORD**

Open `apps/web/src/services/http.ts`. Inside the `http<T>` function, locate the `if (!res.ok) { ... }` block. Insert a new branch **before** that block to handle the special 403 code:

```ts
  if (res.status === 403) {
    const maybe = await res
      .clone()
      .json()
      .catch(() => null);
    const code =
      maybe && typeof maybe === "object" && "code" in maybe
        ? (maybe as { code?: string }).code
        : undefined;
    if (code === "MUST_CHANGE_PASSWORD") {
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/force-password-change"
      ) {
        window.location.assign("/force-password-change");
      }
      throw new HttpError(403, "请先修改密码");
    }
  }
```

Use `res.clone()` so the outer error-body parsing logic can still read the response body later.

- [ ] **Step 3: App.tsx effect redirects when the flag is true**

Replace `apps/web/src/App.tsx` with:

```tsx
import { ConfigProvider, Spin, theme } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "./router";
import { useAuthStore } from "./stores/authStore";

const queryClient = new QueryClient();

function AuthHydrationGate({ children }: { children: React.ReactNode }) {
  const hydrated = useAuthStore((state) => state.hydrated);
  const hydrate = useAuthStore((state) => state.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (!hydrated) {
    return (
      <div className="auth-splash">
        <Spin size="large" />
      </div>
    );
  }

  return <>{children}</>;
}

function MustChangePasswordGate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!user) return;
    if (!user.mustChangePassword) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/force-password-change") return;
    if (window.location.pathname === "/login") return;
    window.location.assign("/force-password-change");
  }, [user]);

  return <>{children}</>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: "#1d8cff",
            colorBgLayout: "#eef3f9",
            colorTextBase: "#0f172a",
            borderRadius: 12,
            fontSize: 14,
          },
        }}
      >
        <AuthHydrationGate>
          <MustChangePasswordGate>
            <RouterProvider router={router} />
          </MustChangePasswordGate>
        </AuthHydrationGate>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Compile check**

Run: `pnpm --filter @yanlu/web exec tsc -b`

Expected: no errors.

- [ ] **Step 5: Browser smoke**

1. Register a new user (phone 13900001234) as SUPER_ADMIN → note initial password `001234`.
2. Log out. Log in as the new user with `13900001234` / `001234` → immediately redirected to `/force-password-change`.
3. Try typing `001234` as new password → backend returns 400 "新密码不能与初始密码相同".
4. Type `Abcdef12` → submitted → redirected to `/` (AppShell home).
5. Re-log in with the new password → lands on home directly (no force-change this time).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/auth/ForcePasswordChangePage.tsx apps/web/src/services/http.ts apps/web/src/App.tsx apps/web/src/styles.css
git commit -m "feat(phase-1b)(web): add ForcePasswordChange page with 403 interceptor"
```

---

## Task 22: Documentation + end-to-end smoke walkthrough

**Files:**
- Modify: `docs/technical/deployment.md`
- Modify: `docs/technical/frontend-components.md`
- Modify: `README.md`

- [ ] **Step 1: Update deployment.md**

Open `docs/technical/deployment.md`. Find the Phase 1A section about employees / MinIO / audit logs. Append a new subsection right after it:

```markdown
## Phase 1B — 用户管理

- User 表新增两列：`deactivatedAt`（软删除标记）、`mustChangePassword`（首次登录强制改密）。
- 自服务端点：`PATCH /api/users/me/phone|username|password`、`POST /api/users/me/initial-password-change`、`POST /api/users/me/deactivate`。
- 管理员端点：`GET /api/users`、`POST /api/users`、`PATCH /api/users/:id/role`、`POST /api/users/:id/reset-password`、`POST /api/users/:id/deactivate`。
- 全局 `MustChangePasswordGuard`：任何具有 `mustChangePassword=true` 标记的 session 在访问非白名单端点（`GET /auth/me`、`POST /users/me/initial-password-change`）时收到 403 `{code:"MUST_CHANGE_PASSWORD"}`。
- `JwtStrategy` / `RefreshStrategy` 会拒绝 `deactivatedAt != null` 的账号，注销后最长 15 分钟（access token TTL）后所有活动 session 失效。
```

- [ ] **Step 2: Update frontend-components.md**

Open `docs/technical/frontend-components.md`. Append:

```markdown
## 用户与账号管理（Phase 1B）

- `layouts/UserSettingsLayout.tsx` — 独立标签页 layout，顶部 header + "返回设置"（仅 `/users`）。
- `features/user-settings/` — 用户设置页 + 4 个 self-service modal（手机号、员工姓名、密码、注销）。
- `features/users/` — 全部用户管理列表页 + `RoleDropdown` + 3 个 admin modal（注册、重置密码、注销）。
- `features/auth/ForcePasswordChangePage.tsx` — 首次登录拦截页，走 `/users/me/initial-password-change` 端点。
- AppShell 右上 Popover "用户设置" 按钮 `window.open('/user-settings', '_blank')`；页内"中台全部用户管理"按钮 `window.open('/users', '_blank')`。
- `services/http.ts` 的 403 `MUST_CHANGE_PASSWORD` 拦截器会跳转到 `/force-password-change`；`App.tsx::MustChangePasswordGate` 在 store 标记就绪时也做同样跳转以兜底。
```

- [ ] **Step 3: Update README**

Open `README.md`. In the "模块状态" 或 "阶段进度" 小节里，把 Phase 1B 从"未开始 / Phase 1A only"的说法改为"用户管理已完成"。具体措辞与当前 README 中 Phase 1A 的描述对齐即可，例如添加一行：

```markdown
- Phase 1B 用户管理：用户设置页、全部用户管理页、重置密码/注销账号二次确认、注册账号、角色升降、首次登录强制改密已完整上线。
```

- [ ] **Step 4: End-to-end smoke checklist**

Run through the full flow, ticking each step off:

1. **Schema + 登录**：`pnpm prisma:push` 清洁、`pnpm dev:api`、`pnpm dev:web` 起来，SUPER_ADMIN 登录。
2. **注册 MEMBER**：`/users` → 注册账号 → 13800139001 / 张三 / MEMBER → 初始密码 `139001`。
3. **ADMIN 提升**：SUPER_ADMIN 把张三角色改为 ADMIN（确认后列表刷新）。
4. **ADMIN 视角 smoke**：登出，以张三登录 → 首先走 `/force-password-change` → 设新密 `Abcdef12` → 进入主界面。
5. **ADMIN 能力受限**：ADMIN 打开 `/users` → 注册按钮 disabled、重置/注销按钮 disabled、除了 `MEMBER → ADMIN` 以外的下拉选项都禁用。
6. **最后一个 SUPER_ADMIN 护栏**：登录 SUPER_ADMIN A → 尝试把自己 demote → 前端 RoleDropdown 拒绝（自己不可改）。登录第二个 SUPER_ADMIN B（如无则先 register 一个再升级），再登录 SUPER_ADMIN A 注销自己 → 成功；再登录 B 尝试注销自己 → 返回 409 "系统至少保留 1 个超级管理员"（curl 验证）。
7. **注销后登录**：被注销的用户尝试登录 → 401 "账号已注销"。
8. **审计日志**：`SELECT action, targetType, targetId, "operatorId", "createdAt" FROM "AuditLog" WHERE action LIKE 'user.%' ORDER BY "createdAt" DESC LIMIT 20;` — 能看到 `user.register` / `user.update_role` / `user.reset_password` / `user.deactivate` 等行。

- [ ] **Step 5: Commit**

```bash
git add docs/technical/deployment.md docs/technical/frontend-components.md README.md
git commit -m "docs: document Phase 1B users module and end-to-end smoke"
```

---

## Appendix A: Why each deviation from the spec is acceptable

| Deviation | Reason |
|---|---|
| `AuthUser.mustChangePassword` instead of a top-level response field | The JWT payload stays minimal (`{sub}`); extending the validated user object is the idiomatic Nest/Passport way to pass per-request flags to Guards. No downside — both frontend and backend find the field in one obvious place. |
| `AuditTargetType` gains `"User"` (capital U) alongside existing `"user"` | Phase 1A used lowercase. Phase 1B uses capital-U to match the Prisma model name so future audit queries can filter by exact model. The old lowercase stays in the union for backward compatibility. |
| `ListUsersDto.includeDeactivated` accepts string `"true"` | Query strings arrive as strings; the Transform normalizes. Mirrors `rememberMe` handling in `LoginDto`. |

## Appendix B: What is explicitly NOT in this plan

Cross-reference with spec §14. None of these are implemented here:

- SMS 验证码 (没有 infra)
- 重新激活已注销账号
- 已注销账号释放手机号 unique 槽位
- User↔Employee 强绑定
- 分钟级 lastActivityAt
- Refresh token blocklist
- 登录失败锁定
- 用户列表导出 (Excel)
