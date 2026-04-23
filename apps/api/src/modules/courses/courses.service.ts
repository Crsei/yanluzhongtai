import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { IdSequenceService } from "../../common/id-sequence/id-sequence.service";
import {
  composeCourseSeqKind,
  deriveYy,
  formatCourseNo,
  formatNnn,
  normalizeKk,
  normalizeTt,
} from "../../common/course-no/course-no";
import {
  computeCourseStatus,
  computeCreditHours,
} from "../../common/course-no/course-status";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateCourseDto } from "./dto/create-course.dto";
import { QueryCoursesDto } from "./dto/query-courses.dto";
import { UpdateCourseDto } from "./dto/update-course.dto";
import type {
  CourseDetail,
  CourseListItem,
  CourseListResponse,
} from "./courses.types";

const DEFAULT_PAGE_SIZE = 50;

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idSequence: IdSequenceService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async list(query: QueryCoursesDto): Promise<CourseListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const and: Prisma.CourseWhereInput[] = [];

    if (query.keyword) {
      const kw = query.keyword.trim();
      if (kw) {
        and.push({
          OR: [
            { courseNo: { contains: kw, mode: "insensitive" } },
            { name: { contains: kw, mode: "insensitive" } },
            { secondaryCategoryName: { contains: kw, mode: "insensitive" } },
          ],
        });
      }
    }
    if (query.name) and.push({ name: { contains: query.name, mode: "insensitive" } });
    if (query.secondaryCategoryName)
      and.push({
        secondaryCategoryName: { contains: query.secondaryCategoryName, mode: "insensitive" },
      });
    if (query.sectionCode) and.push({ sectionCode: query.sectionCode.toUpperCase() });
    if (query.actualTeachingType) and.push({ actualTeachingType: query.actualTeachingType });
    if (query.actualTeacherJobNo) and.push({ actualTeacherJobNo: query.actualTeacherJobNo });
    if (query.studentId) and.push({ enrollments: { some: { studentId: query.studentId } } });
    if (query.plannedAtFrom || query.plannedAtTo) {
      and.push({
        plannedAt: {
          gte: query.plannedAtFrom ? new Date(query.plannedAtFrom) : undefined,
          lte: query.plannedAtTo ? new Date(query.plannedAtTo) : undefined,
        },
      });
    }

    // Status is derived from (plannedAt, durationMinutes, now). Translate to
    // equivalent SQL predicates so the DB does the heavy lifting.
    const now = new Date();
    if (query.status === "NOT_SCHEDULED") {
      and.push({ plannedAt: null });
    } else if (query.status === "COMPLETED") {
      and.push({ durationMinutes: { gt: 0 } });
    } else if (query.status === "SCHEDULED") {
      and.push({
        AND: [
          { plannedAt: { gt: now } },
          { OR: [{ durationMinutes: null }, { durationMinutes: { lte: 0 } }] },
        ],
      });
    } else if (query.status === "IN_PROGRESS") {
      and.push({
        AND: [
          { plannedAt: { lte: now } },
          { plannedAt: { not: null } },
          { OR: [{ durationMinutes: null }, { durationMinutes: { lte: 0 } }] },
        ],
      });
    }

    const where: Prisma.CourseWhereInput = and.length > 0 ? { AND: and } : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        orderBy: [{ plannedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
        include: { _count: { select: { enrollments: true } } },
      }),
      this.prisma.course.count({ where }),
    ]);

    const teacherJobNos = [
      ...new Set(rows.map((r) => r.actualTeacherJobNo).filter((v): v is string => Boolean(v))),
    ];
    const teachers = teacherJobNos.length
      ? await this.prisma.employee.findMany({
          where: { jobNo: { in: teacherJobNos } },
          select: { jobNo: true, name: true, employmentStatus: true },
        })
      : [];
    const teacherMap = new Map(teachers.map((t) => [t.jobNo, t]));

    const items: CourseListItem[] = rows.map((row) => ({
      id: row.id,
      courseNo: row.courseNo,
      name: row.name,
      sectionCode: row.sectionCode,
      sectionName: row.sectionName,
      categorySequenceNo: row.categorySequenceNo,
      secondaryCategoryName: row.secondaryCategoryName,
      plannedAt: row.plannedAt,
      status: computeCourseStatus(row.plannedAt, row.durationMinutes, now),
      actualTeachingType: row.actualTeachingType,
      actualTeacher: row.actualTeacherJobNo
        ? teacherMap.get(row.actualTeacherJobNo) ?? null
        : null,
      enrolledStudentCount: row._count.enrollments,
    }));

    return { items, total, page, pageSize };
  }

  async findOne(id: string): Promise<CourseDetail> {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        outlineVersion: { select: { versionName: true } },
        enrollments: {
          include: {
            student: {
              select: { id: true, studentNo: true, name: true, servicePlatform: true },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException("课程不存在");

    const teacher = course.actualTeacherJobNo
      ? await this.prisma.employee.findUnique({
          where: { jobNo: course.actualTeacherJobNo },
          select: { jobNo: true, name: true, employmentStatus: true },
        })
      : null;

    const now = new Date();
    return {
      id: course.id,
      courseNo: course.courseNo,
      name: course.name,
      outlineVersionId: course.outlineVersionId,
      outlineItemId: course.outlineItemId,
      outlineVersionName: course.outlineVersion?.versionName ?? null,
      sectionCode: course.sectionCode,
      sectionName: course.sectionName,
      categorySequenceNo: course.categorySequenceNo,
      secondaryCategoryName: course.secondaryCategoryName,
      suggestedTeachingType: course.suggestedTeachingType,
      plannedAt: course.plannedAt,
      courseYear: course.courseYear,
      actualTeacherJobNo: course.actualTeacherJobNo,
      actualTeacher: teacher,
      actualTeachingType: course.actualTeachingType,
      durationMinutes: course.durationMinutes,
      creditHours: course.creditHours?.toString() ?? null,
      status: computeCourseStatus(course.plannedAt, course.durationMinutes, now),
      replayUrl: course.replayUrl,
      videoUrl: course.videoUrl,
      resourceUrl: course.resourceUrl,
      note: course.note,
      students: course.enrollments.map((e) => ({
        id: e.student.id,
        studentNo: e.student.studentNo,
        name: e.student.name,
        servicePlatform: e.student.servicePlatform,
      })),
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    };
  }

  async create(dto: CreateCourseDto, operatorId: string): Promise<CourseDetail> {
    const item = await this.prisma.courseOutlineItem.findUnique({
      where: { id: dto.outlineItemId },
      include: { outlineVersion: true },
    });
    if (!item) throw new NotFoundException("课程大纲条目不存在");

    const section = await this.prisma.courseSection.findUnique({
      where: {
        outlineVersionId_code: {
          outlineVersionId: item.outlineVersionId,
          code: item.sectionCode,
        },
      },
    });
    if (!section) throw new BadRequestException("大纲条目所属板块缺失,请先修复大纲");

    const tt = normalizeTt(item.sectionCode);
    const kk = normalizeKk(item.sequenceNo);
    const plannedAt = dto.plannedAt ? new Date(dto.plannedAt) : null;
    const { yy, year } = deriveYy(plannedAt);
    const seq = await this.idSequence.allocate(composeCourseSeqKind(tt, kk), year);
    const courseNo = formatCourseNo({ tt, kk, yy, nnn: formatNnn(seq) });

    const studentIds = dto.studentIds ?? [];
    if (studentIds.length > 0) {
      const found = await this.prisma.student.count({ where: { id: { in: studentIds } } });
      if (found !== studentIds.length) {
        throw new BadRequestException("部分学生 id 无效");
      }
    }

    await this.assertTeacher(dto.actualTeacherJobNo ?? null);

    const creditHours = computeCreditHours(dto.durationMinutes ?? null);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.course.create({
        data: {
          courseNo,
          name: dto.name,
          outlineVersionId: item.outlineVersionId,
          outlineItemId: item.id,
          sectionCode: tt,
          sectionName: section.name,
          categorySequenceNo: kk,
          secondaryCategoryName: item.secondaryCategoryName,
          suggestedTeachingType: item.suggestedTeachingType,
          plannedAt,
          courseYear: year,
          actualTeacherJobNo: dto.actualTeacherJobNo ?? null,
          actualTeachingType: dto.actualTeachingType ?? null,
          durationMinutes: dto.durationMinutes ?? null,
          creditHours: creditHours === null ? null : new Prisma.Decimal(creditHours),
          replayUrl: dto.replayUrl ?? null,
          videoUrl: dto.videoUrl ?? null,
          resourceUrl: dto.resourceUrl ?? null,
          note: dto.note ?? null,
        },
      });

      if (studentIds.length > 0) {
        await tx.enrollment.createMany({
          data: studentIds.map((studentId) => ({ studentId, courseId: row.id })),
        });
      }
      return row;
    });

    await this.auditLogs.record({
      operatorId,
      action: "course.create",
      targetType: "course",
      targetId: created.id,
      before: null,
      after: { ...created, studentIds } as unknown as Record<string, unknown>,
    });

    return this.findOne(created.id);
  }

  async update(
    id: string,
    dto: UpdateCourseDto,
    operatorId: string,
  ): Promise<CourseDetail> {
    const before = await this.prisma.course.findUnique({
      where: { id },
      include: { enrollments: { select: { studentId: true } } },
    });
    if (!before) throw new NotFoundException("课程不存在");

    await this.assertTeacher(
      dto.actualTeacherJobNo === undefined
        ? before.actualTeacherJobNo
        : dto.actualTeacherJobNo ?? null,
    );

    // Allow re-picking an outline item (updates TT/KK/section/category copies);
    // courseNo and courseYear stay stable.
    let sectionPatch: Prisma.CourseUpdateInput = {};
    if (dto.outlineItemId && dto.outlineItemId !== before.outlineItemId) {
      const item = await this.prisma.courseOutlineItem.findUnique({
        where: { id: dto.outlineItemId },
      });
      if (!item) throw new NotFoundException("课程大纲条目不存在");
      const section = await this.prisma.courseSection.findUnique({
        where: {
          outlineVersionId_code: {
            outlineVersionId: item.outlineVersionId,
            code: item.sectionCode,
          },
        },
      });
      if (!section) throw new BadRequestException("大纲条目所属板块缺失");
      sectionPatch = {
        outlineVersion: { connect: { id: item.outlineVersionId } },
        outlineItemId: item.id,
        sectionCode: normalizeTt(item.sectionCode),
        sectionName: section.name,
        categorySequenceNo: normalizeKk(item.sequenceNo),
        secondaryCategoryName: item.secondaryCategoryName,
        suggestedTeachingType: item.suggestedTeachingType,
      };
    }

    const hasDuration = Object.prototype.hasOwnProperty.call(dto, "durationMinutes");
    const newDuration = hasDuration ? dto.durationMinutes ?? null : before.durationMinutes;
    const creditHours = computeCreditHours(newDuration);

    const studentIds = dto.studentIds;
    if (studentIds && studentIds.length > 0) {
      const found = await this.prisma.student.count({ where: { id: { in: studentIds } } });
      if (found !== studentIds.length) {
        throw new BadRequestException("部分学生 id 无效");
      }
    }

    const after = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.course.update({
        where: { id },
        data: {
          ...sectionPatch,
          name: dto.name ?? before.name,
          plannedAt:
            dto.plannedAt === undefined
              ? before.plannedAt
              : dto.plannedAt
                ? new Date(dto.plannedAt)
                : null,
          actualTeacherJobNo:
            dto.actualTeacherJobNo === undefined
              ? before.actualTeacherJobNo
              : dto.actualTeacherJobNo,
          actualTeachingType:
            dto.actualTeachingType === undefined
              ? before.actualTeachingType
              : dto.actualTeachingType,
          durationMinutes: newDuration,
          creditHours: creditHours === null ? null : new Prisma.Decimal(creditHours),
          replayUrl: dto.replayUrl === undefined ? before.replayUrl : dto.replayUrl,
          videoUrl: dto.videoUrl === undefined ? before.videoUrl : dto.videoUrl,
          resourceUrl:
            dto.resourceUrl === undefined ? before.resourceUrl : dto.resourceUrl,
          note: dto.note === undefined ? before.note : dto.note,
        },
      });

      if (studentIds) {
        // replace-all semantics — picker drives the full set
        await tx.enrollment.deleteMany({ where: { courseId: id } });
        if (studentIds.length > 0) {
          await tx.enrollment.createMany({
            data: studentIds.map((studentId) => ({ studentId, courseId: id })),
          });
        }
      }
      return updated;
    });

    const beforeSnapshot = {
      ...before,
      studentIds: before.enrollments.map((e) => e.studentId),
    };
    const afterSnapshot = {
      ...after,
      studentIds: studentIds ?? before.enrollments.map((e) => e.studentId),
    };

    await this.auditLogs.record({
      operatorId,
      action: "course.update",
      targetType: "course",
      targetId: id,
      before: beforeSnapshot as unknown as Record<string, unknown>,
      after: afterSnapshot as unknown as Record<string, unknown>,
    });

    return this.findOne(id);
  }

  async removeMany(ids: string[], operatorId: string): Promise<{ deleted: number }> {
    if (ids.length === 0) return { deleted: 0 };
    const rows = await this.prisma.course.findMany({ where: { id: { in: ids } } });
    if (rows.length !== ids.length) {
      throw new NotFoundException("部分课程 id 不存在");
    }
    await this.prisma.course.deleteMany({ where: { id: { in: ids } } });
    for (const row of rows) {
      await this.auditLogs.record({
        operatorId,
        action: "course.delete",
        targetType: "course",
        targetId: row.id,
        before: row as unknown as Record<string, unknown>,
        after: null,
      });
    }
    return { deleted: rows.length };
  }

  private async assertTeacher(jobNo: string | null): Promise<void> {
    if (!jobNo) return;
    const emp = await this.prisma.employee.findUnique({
      where: { jobNo },
      select: { jobNo: true, employmentStatus: true },
    });
    if (!emp) throw new BadRequestException(`老师工号 ${jobNo} 不存在`);
    if (emp.employmentStatus === "RESIGNED") {
      throw new BadRequestException(`老师工号 ${jobNo} 已离职,请改选其他老师`);
    }
  }
}
