// apps/api/src/modules/students/students.service.ts
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type Student } from "@prisma/client";
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

    const statusOrder = Prisma.sql`CASE "serviceStatus"::text
      ${Prisma.join(
        (Object.entries(SERVICE_STATUS_SORT) as [ServiceStatus, number][]).map(
          ([k, v]) => Prisma.sql`WHEN ${k} THEN ${v}`,
        ),
        " ",
      )}
      ELSE 999 END`;

    const itemsQuery = Prisma.sql`
      WITH s AS (
        SELECT *, ${Prisma.raw(GRADE_TEXT_CASE_SQL)} AS grade_text,
               ${Prisma.raw(GRADE_SORT_SQL)} AS grade_rank
        FROM "Student"
        ${preGradeWhere}
      )
      SELECT "id", "studentNo", "name", "gender", "school", "major",
             "enrollmentYear", "graduationYear",
             "remainingPublicCredits", "remainingPrivateCredits",
             "serviceStatus", "servicePlatform",
             "counselorJobNo", "plannerJobNo",
             grade_text AS grade
      FROM s
      ${gradeWhere}
      ORDER BY ${statusOrder} ASC, grade_rank ASC, "name" ASC
      LIMIT ${pageSize} OFFSET ${skip}
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
      this.prisma.$queryRaw<StudentListItem[]>(itemsQuery),
      this.prisma.$queryRaw<{ count: number }[]>(countQuery),
    ]);

    const items: StudentListItem[] = rawItems.map((r) => ({
      ...r,
      remainingPublicCredits: r.remainingPublicCredits ?? null,
      remainingPrivateCredits: r.remainingPrivateCredits ?? null,
    }));

    return {
      items,
      total: countRows[0]?.count ?? 0,
      page,
      pageSize,
    };
  }

  async findOne(id: string): Promise<StudentDetail> {
    const s = await this.prisma.student.findUnique({ where: { id } });
    if (!s) throw new NotFoundException("学生不存在");
    return {
      ...s,
      grade: calculateGrade(s.enrollmentYear, s.graduationYear),
      relatedCourseCategories: [],
    };
  }

  async create(dto: CreateStudentDto, operatorId: string): Promise<Student> {
    const sequenceYear = dto.enrollmentYear ?? new Date().getFullYear();
    const seq = await this.idSequence.allocate("student", sequenceYear);
    const studentNo = formatStudentNo(sequenceYear, seq);
    const created = await this.prisma.student.create({
      data: {
        ...dto,
        studentNo,
        name: dto.name ?? null,
        gender: dto.gender ?? null,
        servicePlatform: dto.servicePlatform ?? null,
        source: dto.source ?? null,
        serviceStatus: dto.serviceStatus ?? null,
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
}
