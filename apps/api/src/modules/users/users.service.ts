import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, User, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";

export const BCRYPT_COST = 12;

/**
 * spec §1.2: 超级管理员 1–3 人、管理员 0–10 人。
 * 下限通过 `guardLastActiveSuperAdmin` 保证至少 1 个超管；
 * 这里只负责上限,在 `register` / `updateRole` 晋升路径上检查。
 */
export const ROLE_CAPS: Partial<Record<UserRole, number>> = {
  [UserRole.SUPER_ADMIN]: 3,
  [UserRole.ADMIN]: 10,
};

const ROLE_CAP_MESSAGES: Partial<Record<UserRole, string>> = {
  [UserRole.SUPER_ADMIN]: "超级管理员人数已达上限(最多 3 人)",
  [UserRole.ADMIN]: "管理员人数已达上限(最多 10 人)",
};

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
   *
   * TODO(phase-1c): make this atomic. Currently a count() + update() race:
   * two simultaneous demote/deactivate calls targeting different SAs can
   * both pass the guard against pre-update state, then both apply, leaving
   * zero active SAs. Fix is to wrap the count + update in a Serializable
   * transaction (and surface 40001 as a 409 with retry guidance) or use a
   * raw UPDATE ... WHERE (count > 1) returning rowcount. See design doc §15.
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

  /**
   * spec §1.2 上限侧:只在将 newRole 人数 +1 之前检查,因此需要排除 `excludeUserId`
   * (即正被"从别的角色晋升过来"那个人本身,不然会把自己计入现有容量)。
   * register 场景没有既存用户可排除,传 undefined 即可。
   */
  async guardRoleCap(
    newRole: UserRole,
    excludeUserId?: string,
  ): Promise<void> {
    const cap = ROLE_CAPS[newRole];
    if (cap === undefined) return;
    const current = await this.prisma.user.count({
      where: {
        role: newRole,
        deactivatedAt: null,
        ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
      },
    });
    if (current >= cap) {
      throw new ConflictException(
        ROLE_CAP_MESSAGES[newRole] ?? "该角色人数已达上限",
      );
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
    // spec §1.2:注册前校验目标角色人数上限(SUPER_ADMIN≤3 / ADMIN≤10)。
    await this.guardRoleCap(input.role);
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
    if (
      target.role === UserRole.SUPER_ADMIN &&
      input.newRole !== UserRole.SUPER_ADMIN
    ) {
      await this.guardLastActiveSuperAdmin(input.targetId, target.role);
    }

    // spec §1.2:晋升到 SUPER_ADMIN / ADMIN 前检查人数上限(SUPER_ADMIN≤3 / ADMIN≤10)
    await this.guardRoleCap(input.newRole, input.targetId);

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
}
