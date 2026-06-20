import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
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

/**
 * Single source of truth for the columns returned by `list()`. Mirrors
 * `EmployeeListItem` (Pick<...>) in `employees.types.ts`. Used both as the
 * Prisma `select` shape (if we ever add a non-raw query path) and as the
 * column list interpolated into the raw SQL `SELECT` in
 * `buildSortedListQuery`. Keep this list in sync with `EmployeeListItem`.
 */
const LIST_SELECT = {
  id: true,
  jobNo: true,
  billingType: true,
  name: true,
  gender: true,
  employmentStatus: true,
  jobTitle: true,
  phone: true,
  source: true,
  servingFor: true,
  hireDate: true,
} as const;

const EMPLOYMENT_STATUS_RANK: Record<string, number> = {
  FULL_TIME: 0,
  PART_TIME: 1,
  RESIGNED: 2,
};

function normalizeBillingType(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed || "常规";
}

function compareEmployeeListItems(a: EmployeeListItem, b: EmployeeListItem): number {
  const statusRank =
    (a.employmentStatus ? EMPLOYMENT_STATUS_RANK[a.employmentStatus] : undefined) ?? 3;
  const nextStatusRank =
    (b.employmentStatus ? EMPLOYMENT_STATUS_RANK[b.employmentStatus] : undefined) ?? 3;
  if (statusRank !== nextStatusRank) return statusRank - nextStatusRank;
  return (a.name ?? "").localeCompare(b.name ?? "", "zh-Hans-CN", {
    sensitivity: "base",
  });
}

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

    if (query.employmentStatus && query.employmentStatus.length > 0) {
      where.employmentStatus =
        query.employmentStatus.length === 1
          ? (query.employmentStatus[0] as EmploymentStatus)
          : { in: query.employmentStatus as EmploymentStatus[] };
    }

    if (query.jobNo && query.jobNo.trim().length > 0) {
      const jobNos = query.jobNo
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      where.jobNo = jobNos.length === 1 ? jobNos[0] : { in: jobNos };
    } else if (query.keyword && query.keyword.trim().length > 0) {
      const keyword = query.keyword.trim();
      where.OR = [
        { name: { contains: keyword, mode: "insensitive" } },
        { jobNo: { contains: keyword, mode: "insensitive" } },
        { phone: { contains: keyword, mode: "insensitive" } },
      ];
    }

    const [allItems, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({ where, select: LIST_SELECT }),
      this.prisma.employee.count({ where }),
    ]);

    const items = allItems
      .sort(compareEmployeeListItems)
      .slice(skip, skip + pageSize);

    return { items, total, page, pageSize };
  }

  async findOne(id: string): Promise<EmployeeDetail> {
    const emp = await this.prisma.employee.findUnique({ where: { id } });
    if (!emp) throw new NotFoundException("员工不存在");
    return { ...emp, relatedCourses: [] };
  }

  async create(dto: CreateEmployeeDto, operatorId: string): Promise<Employee> {
    const hireDate = dto.hireDate ? new Date(dto.hireDate) : null;
    const year = (hireDate ?? new Date()).getFullYear();
    const seq = await this.idSequence.allocate("employee", year);
    const jobNo = IdSequenceService.formatEmployeeJobNo(year, seq);

    const created = await this.prisma.employee.create({
      data: {
        jobNo,
        billingType: normalizeBillingType(dto.billingType),
        name: dto.name ?? null,
        gender: dto.gender ?? null,
        employmentStatus: (dto.employmentStatus as EmploymentStatus | undefined) ?? null,
        jobTitle: dto.jobTitle ?? null,
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
    if (dto.billingType !== undefined) {
      data.billingType = normalizeBillingType(dto.billingType);
    }
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

    // No recognized fields in the PATCH body — return the existing row
    // unchanged so we don't silently bump `updatedAt` without an audit row.
    if (Object.keys(data).length === 0) {
      return before;
    }

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

  async remove(id: string, operatorId: string): Promise<void> {
    const before = await this.prisma.employee.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("员工不存在");

    const [payrollCount, manualRecordCount, courseCount, counselorCount, plannerCount] =
      await this.prisma.$transaction([
        this.prisma.payrollSettlement.count({ where: { employeeJobNo: before.jobNo } }),
        this.prisma.payrollManualRecord.count({ where: { employeeJobNo: before.jobNo } }),
        this.prisma.course.count({ where: { actualTeacherJobNo: before.jobNo } }),
        this.prisma.student.count({ where: { counselorJobNo: before.jobNo } }),
        this.prisma.student.count({ where: { plannerJobNo: before.jobNo } }),
      ]);

    if (
      payrollCount + manualRecordCount + courseCount + counselorCount + plannerCount >
      0
    ) {
      throw new ConflictException(
        "该员工有关联学生/薪酬/课程，不可删除，请将状态改为已离职",
      );
    }

    await this.prisma.employee.delete({ where: { id } });
    await this.auditLogs.record({
      operatorId,
      action: "delete",
      targetType: "employee",
      targetId: id,
      before: this.snapshot(before),
    });
  }

  async removeMany(ids: string[], operatorId: string): Promise<{ deleted: number }> {
    if (ids.length === 0) return { deleted: 0 };
    const rows = await this.prisma.employee.findMany({
      where: { id: { in: ids } },
    });
    if (rows.length !== ids.length) {
      throw new NotFoundException("部分员工不存在");
    }

    const jobNos = rows.map((row) => row.jobNo);
    const [payrollCount, manualRecordCount, courseCount, counselorCount, plannerCount] =
      await this.prisma.$transaction([
        this.prisma.payrollSettlement.count({ where: { employeeJobNo: { in: jobNos } } }),
        this.prisma.payrollManualRecord.count({ where: { employeeJobNo: { in: jobNos } } }),
        this.prisma.course.count({ where: { actualTeacherJobNo: { in: jobNos } } }),
        this.prisma.student.count({ where: { counselorJobNo: { in: jobNos } } }),
        this.prisma.student.count({ where: { plannerJobNo: { in: jobNos } } }),
      ]);

    if (
      payrollCount + manualRecordCount + courseCount + counselorCount + plannerCount >
      0
    ) {
      throw new ConflictException(
        "所选员工中存在关联学生/薪酬/课程的记录，不可批量删除",
      );
    }

    await this.prisma.employee.deleteMany({ where: { id: { in: ids } } });
    for (const row of rows) {
      await this.auditLogs.record({
        operatorId,
        action: "delete",
        targetType: "employee",
        targetId: row.id,
        before: this.snapshot(row),
      });
    }
    return { deleted: rows.length };
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
