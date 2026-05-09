import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CourseOutlineItem,
  CourseSection,
  Prisma,
} from "@prisma/client";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateItemDto } from "./dto/create-item.dto";
import { UpdateItemDto } from "./dto/update-item.dto";
import type { CourseOutlineItemDetail } from "./course-outlines.types";

@Injectable()
export class CourseOutlineItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async addItem(
    versionId: string,
    dto: CreateItemDto,
    operatorId: string,
  ): Promise<CourseOutlineItemDetail> {
    const version = await this.prisma.courseOutlineVersion.findUnique({
      where: { id: versionId },
    });
    if (!version) throw new NotFoundException("大纲版本不存在");

    const created = await this.prisma.$transaction(async (tx) => {
      let section: CourseSection | null;
      if (dto.newSection) {
        const existing = await tx.courseSection.findUnique({
          where: {
            outlineVersionId_code: {
              outlineVersionId: versionId,
              code: dto.newSection.code,
            },
          },
        });
        if (existing) {
          throw new ConflictException(
            `板块代码 ${dto.newSection.code} 在当前大纲版本已存在`,
          );
        }
        section = await tx.courseSection.create({
          data: {
            outlineVersionId: versionId,
            code: dto.newSection.code,
            name: dto.newSection.name,
            resourceUrl: dto.newSection.resourceUrl ?? null,
            displayOrder: dto.newSection.displayOrder ?? 0,
          },
        });
      } else if (dto.sectionCode) {
        section = await tx.courseSection.findUnique({
          where: {
            outlineVersionId_code: {
              outlineVersionId: versionId,
              code: dto.sectionCode,
            },
          },
        });
        if (!section) throw new BadRequestException("指定板块在当前大纲版本不存在");
      } else {
        throw new BadRequestException("必须提供 sectionCode 或 newSection");
      }

      const sequenceNo = dto.sequenceNo?.padStart(2, "0") ?? null;
      try {
        return await tx.courseOutlineItem.create({
          data: {
            outlineVersionId: versionId,
            sectionCode: section.code,
            sequenceNo,
            secondaryCategoryName: dto.secondaryCategoryName ?? null,
            suggestedTeachingType: dto.suggestedTeachingType ?? null,
            plannedTeacherJobNo: dto.plannedTeacherJobNo ?? null,
            lessonPlanUrl: dto.lessonPlanUrl ?? null,
          },
        });
      } catch (err) {
        if (this.isUniqueViolation(err)) {
          throw new ConflictException(
            `板块 ${section.code} 下序列号 ${sequenceNo} 已存在`,
          );
        }
        throw err;
      }
    });

    await this.auditLogs.record({
      operatorId,
      action: "create",
      targetType: "course_outline_item",
      targetId: created.id,
      after: this.snapshot(created),
    });

    return this.enrichOne(created);
  }

  async updateItem(
    itemId: string,
    dto: UpdateItemDto,
    operatorId: string,
  ): Promise<CourseOutlineItemDetail> {
    const before = await this.prisma.courseOutlineItem.findUnique({ where: { id: itemId } });
    if (!before) throw new NotFoundException("大纲条目不存在");

    if (dto.sectionCode && dto.sectionCode !== before.sectionCode) {
      const target = await this.prisma.courseSection.findUnique({
        where: {
          outlineVersionId_code: {
            outlineVersionId: before.outlineVersionId,
            code: dto.sectionCode,
          },
        },
      });
      if (!target) throw new BadRequestException("目标板块在当前大纲版本不存在");
    }

    const data: Prisma.CourseOutlineItemUpdateInput = {};
    if (dto.sectionCode !== undefined) data.sectionCode = dto.sectionCode;
    if (dto.sequenceNo !== undefined) data.sequenceNo = dto.sequenceNo ? dto.sequenceNo.padStart(2, "0") : null;
    if (dto.secondaryCategoryName !== undefined) data.secondaryCategoryName = dto.secondaryCategoryName || null;
    if (dto.suggestedTeachingType !== undefined) data.suggestedTeachingType = dto.suggestedTeachingType || null;
    if (dto.plannedTeacherJobNo !== undefined) {
      data.plannedTeacherJobNo = dto.plannedTeacherJobNo || null;
    }
    if (dto.lessonPlanUrl !== undefined) {
      data.lessonPlanUrl = dto.lessonPlanUrl || null;
    }

    if (Object.keys(data).length === 0) return this.enrichOne(before);

    let after: CourseOutlineItem;
    try {
      after = await this.prisma.courseOutlineItem.update({ where: { id: itemId }, data });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException("同板块下序列号冲突");
      }
      throw err;
    }

    await this.auditLogs.record({
      operatorId,
      action: "update",
      targetType: "course_outline_item",
      targetId: itemId,
      before: this.snapshot(before),
      after: this.snapshot(after),
    });

    return this.enrichOne(after);
  }

  async deleteItems(ids: string[], operatorId: string): Promise<{ deleted: number }> {
    const items = await this.prisma.courseOutlineItem.findMany({
      where: { id: { in: ids } },
    });
    if (items.length === 0) return { deleted: 0 };

    await this.prisma.courseOutlineItem.deleteMany({ where: { id: { in: ids } } });

    for (const item of items) {
      await this.auditLogs.record({
        operatorId,
        action: "delete",
        targetType: "course_outline_item",
        targetId: item.id,
        before: this.snapshot(item),
      });
    }

    return { deleted: items.length };
  }

  private async enrichOne(item: CourseOutlineItem): Promise<CourseOutlineItemDetail> {
    const plannedTeacher = item.plannedTeacherJobNo
      ? await this.prisma.employee.findUnique({
          where: { jobNo: item.plannedTeacherJobNo },
          select: { jobNo: true, name: true, employmentStatus: true },
        })
      : null;
    return { ...item, plannedTeacher, actualTeachers: [] };
  }

  private snapshot(item: CourseOutlineItem): Record<string, unknown> {
    const { id: _id, ...rest } = item;
    void _id;
    return rest as unknown as Record<string, unknown>;
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code: unknown }).code === "P2002"
    );
  }
}
