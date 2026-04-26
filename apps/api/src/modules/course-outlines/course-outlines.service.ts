import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { CourseOutlineVersion } from "@prisma/client";
import {
  computeNextVersionName,
  parseVersionName,
} from "../../common/course-outline-version/version-name";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrismaService } from "../../prisma/prisma.service";
import type {
  VersionDetail,
  VersionListItem,
  CourseOutlineItemDetail,
} from "./course-outlines.types";

@Injectable()
export class CourseOutlinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async listVersions(): Promise<VersionListItem[]> {
    const versions = await this.prisma.courseOutlineVersion.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      include: { _count: { select: { items: true } } },
    });
    return versions.map((v) => ({
      id: v.id,
      versionName: v.versionName,
      isActive: v.isActive,
      itemCount: v._count.items,
      createdAt: v.createdAt,
    }));
  }

  async getVersion(id: string): Promise<VersionDetail> {
    const version = await this.prisma.courseOutlineVersion.findUnique({
      where: { id },
      include: {
        sections: { orderBy: { displayOrder: "asc" } },
        items: true,
      },
    });
    if (!version) throw new NotFoundException("大纲版本不存在");

    const teacherJobNos = [
      ...new Set(
        version.items
          .map((i) => i.plannedTeacherJobNo)
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    const teachers = teacherJobNos.length
      ? await this.prisma.employee.findMany({
          where: { jobNo: { in: teacherJobNos } },
          select: { jobNo: true, name: true, employmentStatus: true },
        })
      : [];
    const teacherMap = new Map(teachers.map((t) => [t.jobNo, t]));

    const enrichedItems: CourseOutlineItemDetail[] = [...version.items]
      .sort(
        (a, b) => this.sequenceOrder(a.sequenceNo) - this.sequenceOrder(b.sequenceNo),
      )
      .map((item) => ({
        ...item,
        plannedTeacher: item.plannedTeacherJobNo
          ? teacherMap.get(item.plannedTeacherJobNo) ?? null
          : null,
        actualTeachers: [],
      }));

    const { sections, items: _items, ...bare } = version;
    void _items;
    return {
      version: bare as CourseOutlineVersion,
      sections,
      items: enrichedItems,
    };
  }

  async createVersion(operatorId: string): Promise<CourseOutlineVersion> {
    const latest = await this.prisma.courseOutlineVersion.findFirst({
      where: { isActive: true },
    });
    const parsed = latest ? parseVersionName(latest.versionName) : null;
    let nextName: string;
    try {
      nextName = computeNextVersionName(parsed, new Date().getFullYear());
    } catch (err) {
      throw new ConflictException((err as Error).message);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.courseOutlineVersion.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
      return tx.courseOutlineVersion.create({
        data: { versionName: nextName, isActive: true },
      });
    });

    await this.auditLogs.record({
      operatorId,
      action: "create",
      targetType: "course_outline_version",
      targetId: created.id,
      after: { versionName: created.versionName, isActive: true },
    });
    return created;
  }

  async deleteVersion(
    id: string,
    confirmVersionName: string,
    operatorId: string,
  ): Promise<void> {
    const before = await this.prisma.courseOutlineVersion.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("大纲版本不存在");
    if (before.versionName !== confirmVersionName) {
      throw new BadRequestException("版本号确认不匹配");
    }

    await this.prisma.$transaction(async (tx) => {
      if (before.isActive) {
        const next = await tx.courseOutlineVersion.findFirst({
          where: { id: { not: id } },
          orderBy: { createdAt: "desc" },
        });
        if (next) {
          await tx.courseOutlineVersion.update({
            where: { id: next.id },
            data: { isActive: true },
          });
        }
      }
      await tx.courseOutlineVersion.delete({ where: { id } });
    });

    await this.auditLogs.record({
      operatorId,
      action: "delete",
      targetType: "course_outline_version",
      targetId: id,
      before: { versionName: before.versionName, isActive: before.isActive },
    });
  }

  private sequenceOrder(seq: string | null): number {
    const n = Number(seq);
    return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
  }
}
