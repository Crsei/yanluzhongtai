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
}
