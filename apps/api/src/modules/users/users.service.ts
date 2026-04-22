import { Injectable } from "@nestjs/common";
import { User, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";

const BCRYPT_COST = 12;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByPhone(phone: string) {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updateLastLogin(id: string) {
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
}
