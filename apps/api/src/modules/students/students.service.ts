// apps/api/src/modules/students/students.service.ts
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Student } from "@prisma/client";
import {
  computeCourseStatus,
  computeCreditHours,
} from "../../common/course-no/course-status";
import { IdSequenceService } from "../../common/id-sequence/id-sequence.service";
import {
  SERVICE_STATUS_SORT,
  type ServiceStatus,
} from "../../common/dictionaries";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateStudentDto } from "./dto/create-student.dto";
import { QueryStudentsDto } from "./dto/query-students.dto";
import { UpdateStudentDto } from "./dto/update-student.dto";
import type {
  StudentDetail,
  StudentListItem,
  StudentListResponse,
} from "./students.types";
import {
  GRADE_SORT_SQL,
  GRADE_TEXT_CASE_SQL,
  calculateGrade,
  formatStudentNo,
} from "./utils/grade";

const DEFAULT_PAGE_SIZE = 50;
const PUBLIC_CREDIT_SECTION_CODES = new Set(["GP", "WZ", "JS"]);

function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined): number {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function compareStudentListItems(a: StudentListItem, b: StudentListItem): number {
  const statusRankA =
    a.serviceStatus && SERVICE_STATUS_SORT[a.serviceStatus as ServiceStatus] != null
      ? SERVICE_STATUS_SORT[a.serviceStatus as ServiceStatus]
      : 999;
  const statusRankB =
    b.serviceStatus && SERVICE_STATUS_SORT[b.serviceStatus as ServiceStatus] != null
      ? SERVICE_STATUS_SORT[b.serviceStatus as ServiceStatus]
      : 999;
  if (statusRankA !== statusRankB) return statusRankA - statusRankB;

  const yearA = a.enrollmentYear ?? -Infinity;
  const yearB = b.enrollmentYear ?? -Infinity;
  if (yearA !== yearB) return yearA - yearB; // enrollmentYear越小(年级越高)越靠前

  return (a.name ?? "").localeCompare(b.name ?? "", "zh-Hans-CN", {
    sensitivity: "base",
  });
}

@Injectable()
export class StudentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idSequence: IdSequenceService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async list(query: QueryStudentsDto): Promise<StudentListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const conditions: Prisma.Sql[] = [];
    if (query.keyword && query.keyword.trim().length > 0) {
      const kw = `%${query.keyword.trim()}%`;
      conditions.push(
        Prisma.sql`("name" ILIKE ${kw} OR "studentNo" ILIKE ${kw} OR "phone" ILIKE ${kw})`,
      );
    }
    if (query.studentNo) {
      conditions.push(Prisma.sql`"studentNo" ILIKE ${`%${query.studentNo}%`}`);
    }
    if (query.name) {
      conditions.push(Prisma.sql`"name" ILIKE ${`%${query.name}%`}`);
    }
    if (query.major) {
      conditions.push(Prisma.sql`"major" ILIKE ${`%${query.major}%`}`);
    }
    if (query.source) {
      conditions.push(Prisma.sql`"source" = ${query.source}`);
    }
    if (query.servicePlatform) {
      conditions.push(Prisma.sql`"servicePlatform" = ${query.servicePlatform}`);
    }
    // grade is applied AFTER the CTE below so it can compare the computed text
    const preGradeWhere =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
        : Prisma.empty;
    const gradeWhere = query.grade
      ? Prisma.sql`WHERE grade_text = ${query.grade}`
      : Prisma.empty;

    const itemsQuery = Prisma.sql`
      WITH s AS (
        SELECT *, ${Prisma.raw(GRADE_TEXT_CASE_SQL)} AS grade_text,
               ${Prisma.raw(GRADE_SORT_SQL)} AS grade_rank
        FROM "Student"
        ${preGradeWhere}
      )
      SELECT "id", "studentNo", "name", "gender", "school", "major",
             "enrollmentYear", "graduationYear",
             "totalPublicCredits", "totalPrivateCredits",
             "remainingPublicCredits", "remainingPrivateCredits",
             "serviceChecklistUrl", "serviceChecklistKeys",
             "serviceStatus", "servicePlatform",
             "counselorJobNo", "plannerJobNo",
             grade_text AS grade
      FROM s
      ${gradeWhere}
    `;

    const countQuery = Prisma.sql`
      WITH s AS (
        SELECT "id", ${Prisma.raw(GRADE_TEXT_CASE_SQL)} AS grade_text
        FROM "Student"
        ${preGradeWhere}
      )
      SELECT COUNT(*)::int AS count FROM s ${gradeWhere}
    `;

    const [rawItems, countRows] = await this.prisma.$transaction([
      this.prisma.$queryRaw<
        Array<StudentListItem & Pick<Student, "totalPublicCredits" | "totalPrivateCredits">>
      >(itemsQuery),
      this.prisma.$queryRaw<{ count: number }[]>(countQuery),
    ]);

    const allItems = await this.withComputedRemainingCredits(rawItems);
    const items = allItems.sort(compareStudentListItems).slice(skip, skip + pageSize);

    return {
      items,
      total: countRows[0]?.count ?? 0,
      page,
      pageSize,
    };
  }

  async findOne(id: string): Promise<StudentDetail> {
    const s = await this.prisma.student.findUnique({
      where: { id },
      include: {
        enrollments: {
          include: {
            course: {
              select: {
                id: true,
                name: true,
                secondaryCategoryName: true,
                plannedAt: true,
                actualTeachingType: true,
                actualTeacherJobNo: true,
                durationMinutes: true,
                creditHours: true,
              },
            },
          },
        },
      },
    });
    if (!s) throw new NotFoundException("学生不存在");
    const { enrollments, ...student } = s;
    const [computed] = await this.withComputedRemainingCredits([student]);

    const teacherJobNos = [
      ...new Set(
        enrollments
          .map((e) => e.course.actualTeacherJobNo)
          .filter((v): v is string => Boolean(v)),
      ),
    ];
    const teachers = teacherJobNos.length
      ? await this.prisma.employee.findMany({
          where: { jobNo: { in: teacherJobNos } },
          select: { jobNo: true, name: true },
        })
      : [];
    const teacherMap = new Map(teachers.map((t) => [t.jobNo, t]));
    const now = new Date();
    const completedCourses = enrollments
      .map((enrollment) => {
        const course = enrollment.course;
        return {
          id: course.id,
          name: course.name,
          secondaryCategoryName: course.secondaryCategoryName,
          plannedAt: course.plannedAt,
          status: computeCourseStatus(course.plannedAt, course.durationMinutes, now),
          actualTeachingType: course.actualTeachingType,
          actualTeacher: course.actualTeacherJobNo
            ? teacherMap.get(course.actualTeacherJobNo) ?? {
                jobNo: course.actualTeacherJobNo,
                name: null,
              }
            : null,
          creditHours:
            course.creditHours == null
              ? computeCreditHours(course.durationMinutes)
              : Number(course.creditHours),
        };
      })
      .sort((a, b) => {
        const timeA = a.plannedAt?.getTime() ?? -Infinity;
        const timeB = b.plannedAt?.getTime() ?? -Infinity;
        return timeB - timeA;
      });

    return {
      ...computed,
      grade: calculateGrade(s.enrollmentYear, s.graduationYear),
      relatedCourseCategories: [
        ...new Set(
          completedCourses
            .map((course) => course.secondaryCategoryName)
            .filter((v): v is string => Boolean(v)),
        ),
      ],
      completedCourses,
    };
  }

  async create(dto: CreateStudentDto, operatorId: string): Promise<Student> {
    const sequenceYear = dto.enrollmentYear ?? new Date().getFullYear();
    const seq = await this.idSequence.allocate("student", sequenceYear);
    const studentNo = formatStudentNo(sequenceYear, seq);
    const payload = { ...dto };
    delete (payload as Record<string, unknown>).remainingPublicCredits;
    delete (payload as Record<string, unknown>).remainingPrivateCredits;
    const created = await this.prisma.student.create({
      data: {
        ...payload,
        studentNo,
        name: dto.name ?? null,
        gender: dto.gender ?? null,
        servicePlatform: dto.servicePlatform ?? null,
        source: dto.source ?? null,
        serviceStatus: dto.serviceStatus ?? null,
        remainingPublicCredits: dto.totalPublicCredits ?? null,
        remainingPrivateCredits: dto.totalPrivateCredits ?? null,
        serviceChecklistKeys: dto.serviceChecklistKeys ?? [],
        policyKeys: dto.policyKeys ?? [],
        scheduleKeys: dto.scheduleKeys ?? [],
        transcriptKeys: dto.transcriptKeys ?? [],
        attachmentKeys: dto.attachmentKeys ?? [],
        detailNotes: (dto.detailNotes ?? null) as Prisma.InputJsonValue,
      },
    });
    await this.auditLogs.record({
      operatorId,
      action: "student.create",
      targetType: "student",
      targetId: created.id,
      before: null,
      after: created as unknown as Record<string, unknown>,
    });
    return created;
  }

  async update(
    id: string,
    dto: UpdateStudentDto,
    operatorId: string,
  ): Promise<Student> {
    const before = await this.prisma.student.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("学生不存在");

    // UpdateStudentDto already omits enrollmentYear; belt-and-braces strip
    // anything the caller might have snuck in via the raw payload.
    const payload = { ...dto };
    delete (payload as Record<string, unknown>).id;
    delete (payload as Record<string, unknown>).studentNo;
    delete (payload as Record<string, unknown>).enrollmentYear;
    delete (payload as Record<string, unknown>).remainingPublicCredits;
    delete (payload as Record<string, unknown>).remainingPrivateCredits;
    delete (payload as Record<string, unknown>).createdAt;
    delete (payload as Record<string, unknown>).updatedAt;

    const after = await this.prisma.student.update({
      where: { id },
      data: payload as Prisma.StudentUpdateInput,
    });
    await this.auditLogs.record({
      operatorId,
      action: "student.update",
      targetType: "student",
      targetId: id,
      before: before as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
    return after;
  }

  async remove(id: string, operatorId: string): Promise<void> {
    const before = await this.prisma.student.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("学生不存在");

    const enrolled = await this.prisma.enrollment.count({
      where: { studentId: id },
    });
    if (enrolled > 0) {
      throw new ConflictException(
        "该学生已有选课记录，不可删除。请将服务状态改为服务完成或取消/终止后保留档案。",
      );
    }

    await this.prisma.student.delete({ where: { id } });
    await this.auditLogs.record({
      operatorId,
      action: "student.delete",
      targetType: "student",
      targetId: id,
      before: before as unknown as Record<string, unknown>,
      after: null,
    });
  }

  async removeMany(ids: string[], operatorId: string): Promise<{ deleted: number }> {
    if (ids.length === 0) return { deleted: 0 };
    const rows = await this.prisma.student.findMany({
      where: { id: { in: ids } },
    });
    if (rows.length !== ids.length) {
      throw new NotFoundException("部分学生不存在");
    }

    const enrolled = await this.prisma.enrollment.count({
      where: { studentId: { in: ids } },
    });
    if (enrolled > 0) {
      throw new ConflictException(
        "所选学生中存在选课记录，不可批量删除。请先调整服务状态并保留档案。",
      );
    }

    await this.prisma.student.deleteMany({ where: { id: { in: ids } } });
    for (const row of rows) {
      await this.auditLogs.record({
        operatorId,
        action: "student.delete",
        targetType: "student",
        targetId: row.id,
        before: row as unknown as Record<string, unknown>,
        after: null,
      });
    }
    return { deleted: rows.length };
  }

  private async withComputedRemainingCredits<
    T extends {
      id: string;
      totalPublicCredits?: Prisma.Decimal | number | string | null;
      totalPrivateCredits?: Prisma.Decimal | number | string | null;
      remainingPublicCredits?: Prisma.Decimal | number | string | null;
      remainingPrivateCredits?: Prisma.Decimal | number | string | null;
    },
  >(students: T[]): Promise<T[]> {
    if (students.length === 0) return students;
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId: { in: students.map((s) => s.id) } },
      include: {
        course: {
          select: {
            sectionCode: true,
            actualTeachingType: true,
            creditHours: true,
            durationMinutes: true,
          },
        },
      },
    });

    const usedByStudent = new Map<string, { publicCredits: number; privateCredits: number }>();
    for (const enrollment of enrollments) {
      const course = enrollment.course;
      const creditHours = decimalToNumber(course.creditHours) || computeCreditHours(course.durationMinutes) || 0;
      const current = usedByStudent.get(enrollment.studentId) ?? {
        publicCredits: 0,
        privateCredits: 0,
      };
      if (course.sectionCode && PUBLIC_CREDIT_SECTION_CODES.has(course.sectionCode)) {
        current.publicCredits += creditHours;
      }
      if (course.actualTeachingType === "1v1") {
        current.privateCredits += creditHours;
      }
      usedByStudent.set(enrollment.studentId, current);
    }

    return students.map((student) => {
      const used = usedByStudent.get(student.id) ?? {
        publicCredits: 0,
        privateCredits: 0,
      };
      const remainingPublicCredits = round2(
        decimalToNumber(student.totalPublicCredits) - used.publicCredits,
      );
      const remainingPrivateCredits = round2(
        decimalToNumber(student.totalPrivateCredits) - used.privateCredits,
      );
      return {
        ...student,
        remainingPublicCredits: new Prisma.Decimal(remainingPublicCredits),
        remainingPrivateCredits: new Prisma.Decimal(remainingPrivateCredits),
      };
    });
  }
}
