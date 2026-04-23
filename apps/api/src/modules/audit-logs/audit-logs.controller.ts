import { Controller, Get, Query } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { Roles } from "../auth/decorators/roles.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { QueryAuditLogsDto } from "./dto/query-audit-logs.dto";
import type {
  AuditLogItem,
  AuditLogListResponse,
} from "./audit-logs.types";

const DEFAULT_PAGE_SIZE = 50;

@Controller("audit-logs")
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: QueryAuditLogsDto): Promise<AuditLogListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AuditLogWhereInput = {};
    if (query.operatorId) where.operatorId = query.operatorId;
    if (query.targetType) where.targetType = query.targetType;
    if (query.action) where.action = query.action;
    if (query.fromDate || query.toDate) {
      where.createdAt = {
        gte: query.fromDate ? new Date(query.fromDate) : undefined,
        lte: query.toDate ? new Date(query.toDate) : undefined,
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          operator: {
            select: { username: true, phone: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const items: AuditLogItem[] = rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      operatorId: row.operatorId,
      operatorUsername: row.operator?.username ?? null,
      operatorPhone: row.operator?.phone ?? null,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      fieldName: row.fieldName,
      beforeValue: row.beforeValue,
      afterValue: row.afterValue,
    }));

    return { items, total, page, pageSize };
  }
}
