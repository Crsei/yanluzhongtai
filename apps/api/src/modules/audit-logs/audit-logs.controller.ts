import { Controller, Get, Query, Res } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import type { Response } from "express";
import { Roles } from "../auth/decorators/roles.decorator";
import { buildExportWorkbook, type ExportColumn } from "../../common/export/export-utils";
import { PrismaService } from "../../prisma/prisma.service";
import { QueryAuditLogsDto } from "./dto/query-audit-logs.dto";
import type {
  AuditLogItem,
  AuditLogListResponse,
} from "./audit-logs.types";

const DEFAULT_PAGE_SIZE = 50;
const EXPORT_COLUMNS: ExportColumn[] = [
  { header: "时间", key: "createdAt" },
  { header: "操作人", key: "operator" },
  { header: "动作", key: "action" },
  { header: "目标类型", key: "targetType" },
  { header: "目标 ID", key: "targetId" },
  { header: "字段", key: "fieldName" },
  { header: "前值", key: "beforeValue" },
  { header: "后值", key: "afterValue" },
];

@Controller("audit-logs")
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(query: QueryAuditLogsDto): Prisma.AuditLogWhereInput {
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
    return where;
  }

  @Get()
  async list(@Query() query: QueryAuditLogsDto): Promise<AuditLogListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const where = this.buildWhere(query);

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

  @Get("export")
  async exportExcel(@Query() query: QueryAuditLogsDto, @Res() res: Response) {
    const rows = await this.prisma.auditLog.findMany({
      where: this.buildWhere(query),
      orderBy: { createdAt: "desc" },
      include: {
        operator: {
          select: { username: true, phone: true },
        },
      },
    });
    const workbook = await buildExportWorkbook(
      EXPORT_COLUMNS,
      rows.map((row) => ({
        createdAt: row.createdAt.toISOString(),
        operator: row.operator
          ? `${row.operator.username}(${row.operator.phone})`
          : "系统",
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        fieldName: row.fieldName ?? "",
        beforeValue: row.beforeValue ?? "",
        afterValue: row.afterValue ?? "",
      })),
    );
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-logs-${today}.xlsx"`,
    );
    res.send(workbook);
  }
}
