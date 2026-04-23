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

  // Write paths implemented in Task 8 — stubs keep DI graph satisfied.
  create(dto: CreateCourseDto, operatorId: string): Promise<CourseDetail> {
    void dto; void operatorId; void this.idSequence; void this.auditLogs;
    throw new BadRequestException("not implemented yet");
  }
  update(
    id: string,
    dto: UpdateCourseDto,
    operatorId: string,
  ): Promise<CourseDetail> {
    void id; void dto; void operatorId;
    throw new BadRequestException("not implemented yet");
  }
  removeMany(ids: string[], operatorId: string): Promise<{ deleted: number }> {
    void ids; void operatorId;
    throw new BadRequestException("not implemented yet");
  }
}
