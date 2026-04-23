import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { Prisma, QuickLinkPageType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { CreateQuickLinkDto } from "./dto/create-quick-link.dto";
import { UpdateQuickLinkDto } from "./dto/update-quick-link.dto";
import { ReorderQuickLinksDto } from "./dto/reorder-quick-links.dto";
import type {
  QuickLinkGroup,
  QuickLinkListResponse,
  QuickLinkRow,
} from "./quick-links.types";

type PrismaQuickLink = Prisma.QuickLinkGetPayload<Record<string, never>>;

function toRow(row: PrismaQuickLink): QuickLinkRow {
  return {
    id: row.id,
    pageType: row.pageType,
    category: row.category,
    kind: row.kind,
    title: row.title,
    url: row.url,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function groupByCategory(rows: PrismaQuickLink[]): QuickLinkGroup[] {
  const map = new Map<string, QuickLinkRow[]>();
  for (const row of rows) {
    const list = map.get(row.category) ?? [];
    list.push(toRow(row));
    map.set(row.category, list);
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }));
}

@Injectable()
export class QuickLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async listByPageType(pageType: QuickLinkPageType): Promise<QuickLinkListResponse> {
    const rows = await this.prisma.quickLink.findMany({
      where: { pageType },
      orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return { pageType, groups: groupByCategory(rows) };
  }

  async create(dto: CreateQuickLinkDto, operatorId: string | null): Promise<QuickLinkRow> {
    const max = await this.prisma.quickLink.aggregate({
      where: { pageType: dto.pageType, category: dto.category },
      _max: { sortOrder: true },
    });
    const nextSort = (max._max.sortOrder ?? 0) + 10;
    const row = await this.prisma.quickLink.create({
      data: {
        pageType: dto.pageType,
        category: dto.category,
        kind: dto.kind,
        title: dto.title,
        url: dto.url,
        sortOrder: nextSort,
      },
    });
    await this.auditLogs.record({
      operatorId,
      action: "quick_link.create",
      targetType: "quick_link",
      targetId: row.id,
      after: toRow(row) as unknown as Record<string, unknown>,
    });
    return toRow(row);
  }

  async update(
    id: string,
    dto: UpdateQuickLinkDto,
    operatorId: string | null,
  ): Promise<QuickLinkRow> {
    const existing = await this.prisma.quickLink.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("QuickLink not found");

    let sortOrderOverride: number | undefined;
    if (dto.category && dto.category !== existing.category) {
      const max = await this.prisma.quickLink.aggregate({
        where: { pageType: existing.pageType, category: dto.category },
        _max: { sortOrder: true },
      });
      sortOrderOverride = (max._max.sortOrder ?? 0) + 10;
    }

    const updated = await this.prisma.quickLink.update({
      where: { id },
      data: {
        category: dto.category ?? existing.category,
        kind: dto.kind ?? existing.kind,
        title: dto.title ?? existing.title,
        url: dto.url ?? existing.url,
        ...(sortOrderOverride !== undefined ? { sortOrder: sortOrderOverride } : {}),
      },
    });

    await this.auditLogs.record({
      operatorId,
      action: "quick_link.update",
      targetType: "quick_link",
      targetId: id,
      before: toRow(existing) as unknown as Record<string, unknown>,
      after: toRow(updated) as unknown as Record<string, unknown>,
    });
    return toRow(updated);
  }

  async remove(id: string, operatorId: string | null): Promise<void> {
    const existing = await this.prisma.quickLink.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("QuickLink not found");
    await this.prisma.quickLink.delete({ where: { id } });
    await this.auditLogs.record({
      operatorId,
      action: "quick_link.delete",
      targetType: "quick_link",
      targetId: id,
      before: toRow(existing) as unknown as Record<string, unknown>,
    });
  }

  async reorder(dto: ReorderQuickLinksDto, operatorId: string | null): Promise<void> {
    const ids = dto.items.map((item) => item.id);
    const rows = await this.prisma.quickLink.findMany({
      where: { id: { in: ids } },
      select: { id: true, pageType: true, sortOrder: true, category: true },
    });
    if (rows.length !== ids.length) {
      throw new BadRequestException("部分快捷入口不存在");
    }
    if (rows.some((row) => row.pageType !== dto.pageType)) {
      throw new BadRequestException("排序项与指定 pageType 不一致");
    }

    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.quickLink.update({
          where: { id: item.id },
          data: { sortOrder: item.sortOrder },
        }),
      ),
    );

    await this.auditLogs.record({
      operatorId,
      action: "quick_link.reorder",
      targetType: "quick_link",
      targetId: dto.pageType,
      after: {
        pageType: dto.pageType,
        items: dto.items,
      } as unknown as Record<string, unknown>,
    });
  }
}
