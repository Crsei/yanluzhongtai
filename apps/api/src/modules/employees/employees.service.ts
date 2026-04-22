import { Injectable, NotFoundException } from "@nestjs/common";
import { Employee, EmploymentStatus, Prisma } from "@prisma/client";
import { IdSequenceService } from "../../common/id-sequence/id-sequence.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import { QueryEmployeesDto } from "./dto/query-employees.dto";
import type {
  EmployeeDetail,
  EmployeeListItem,
  EmployeeListResponse,
} from "./employees.types";

const DEFAULT_PAGE_SIZE = 50;

const LIST_SELECT = {
  id: true,
  jobNo: true,
  name: true,
  gender: true,
  employmentStatus: true,
  jobTitle: true,
  phone: true,
  source: true,
  servingFor: true,
  hireDate: true,
} as const;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idSequence: IdSequenceService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async list(query: QueryEmployeesDto): Promise<EmployeeListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * pageSize;

    const where: Prisma.EmployeeWhereInput = {};
    if (query.employmentStatus) {
      where.employmentStatus = query.employmentStatus as EmploymentStatus;
    }
    if (query.keyword && query.keyword.trim().length > 0) {
      const keyword = query.keyword.trim();
      where.OR = [
        { name: { contains: keyword, mode: "insensitive" } },
        { jobNo: { contains: keyword, mode: "insensitive" } },
        { phone: { contains: keyword, mode: "insensitive" } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.$queryRaw<EmployeeListItem[]>(this.buildSortedListQuery(where, skip, pageSize)),
      this.prisma.employee.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /**
   * spec §4.3 排序：'已离职' 排在最后，其它按姓名升序。
   * 用 raw SQL 因为 Prisma 不支持 CASE WHEN ORDER BY。
   */
  private buildSortedListQuery(
    where: Prisma.EmployeeWhereInput,
    skip: number,
    take: number,
  ): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];
    if (where.employmentStatus) {
      conditions.push(Prisma.sql`"employmentStatus"::text = ${where.employmentStatus as string}`);
    }
    if (where.OR) {
      const ors = (where.OR as Prisma.EmployeeWhereInput[])
        .map((clause) => {
          if (clause.name && typeof clause.name === "object" && "contains" in clause.name) {
            const k = clause.name.contains as string;
            return Prisma.sql`"name" ILIKE ${"%" + k + "%"}`;
          }
          if (clause.jobNo && typeof clause.jobNo === "object" && "contains" in clause.jobNo) {
            const k = clause.jobNo.contains as string;
            return Prisma.sql`"jobNo" ILIKE ${"%" + k + "%"}`;
          }
          if (clause.phone && typeof clause.phone === "object" && "contains" in clause.phone) {
            const k = clause.phone.contains as string;
            return Prisma.sql`"phone" ILIKE ${"%" + k + "%"}`;
          }
          return Prisma.sql`TRUE`;
        });
      conditions.push(Prisma.sql`(${Prisma.join(ors, " OR ")})`);
    }
    const whereSql =
      conditions.length === 0
        ? Prisma.sql`TRUE`
        : Prisma.join(conditions, " AND ");

    return Prisma.sql`
      SELECT
        "id", "jobNo", "name", "gender", "employmentStatus", "jobTitle",
        "phone", "source", "servingFor", "hireDate"
      FROM "Employee"
      WHERE ${whereSql}
      ORDER BY
        CASE WHEN "employmentStatus" = 'RESIGNED' THEN 1 ELSE 0 END ASC,
        "name" ASC
      LIMIT ${take} OFFSET ${skip}
    `;
  }

  async findOne(id: string): Promise<EmployeeDetail> {
    const emp = await this.prisma.employee.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException("员工不存在");
    return { ...emp, relatedCourses: [] };
  }

  async create(dto: CreateEmployeeDto, operatorId: string): Promise<Employee> {
    const hireDate = dto.hireDate ? new Date(dto.hireDate) : new Date();
    const year = hireDate.getFullYear();
    const seq = await this.idSequence.allocate("employee", year);
    const jobNo = IdSequenceService.formatEmployeeJobNo(year, seq);

    const created = await this.prisma.employee.create({
      data: {
        jobNo,
        name: dto.name,
        gender: dto.gender,
        employmentStatus: dto.employmentStatus as EmploymentStatus,
        jobTitle: dto.jobTitle,
        hireDate,
        phone: dto.phone ?? null,
        bankCardNo: dto.bankCardNo ?? null,
        bankName: dto.bankName ?? null,
        source: dto.source ?? null,
        servingFor: dto.servingFor ?? [],
        resumeText: dto.resumeText ?? null,
        attachmentKeys: dto.attachmentKeys ?? [],
      },
    });

    await this.auditLogs.record({
      operatorId,
      action: "create",
      targetType: "employee",
      targetId: created.id,
      after: this.snapshot(created),
    });

    return created;
  }

  async update(
    id: string,
    dto: UpdateEmployeeDto,
    operatorId: string,
  ): Promise<Employee> {
    const before = await this.prisma.employee.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("员工不存在");

    const data: Prisma.EmployeeUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.gender !== undefined) data.gender = dto.gender;
    if (dto.employmentStatus !== undefined) {
      data.employmentStatus = dto.employmentStatus as EmploymentStatus;
    }
    if (dto.jobTitle !== undefined) data.jobTitle = dto.jobTitle;
    if (dto.hireDate !== undefined) data.hireDate = new Date(dto.hireDate);
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.bankCardNo !== undefined) data.bankCardNo = dto.bankCardNo || null;
    if (dto.bankName !== undefined) data.bankName = dto.bankName || null;
    if (dto.source !== undefined) data.source = dto.source || null;
    if (dto.servingFor !== undefined) data.servingFor = dto.servingFor;
    if (dto.resumeText !== undefined) data.resumeText = dto.resumeText || null;
    if (dto.attachmentKeys !== undefined) data.attachmentKeys = dto.attachmentKeys;

    const after = await this.prisma.employee.update({ where: { id }, data });

    await this.auditLogs.record({
      operatorId,
      action: "update",
      targetType: "employee",
      targetId: id,
      before: this.snapshot(before),
      after: this.snapshot(after),
    });

    return after;
  }

  /** Strip volatile / internal columns before audit-log diff. */
  private snapshot(emp: Employee): Record<string, unknown> {
    const { id, createdAt, updatedAt, ...rest } = emp;
    void id;
    void createdAt;
    void updatedAt;
    return rest as unknown as Record<string, unknown>;
  }
}
