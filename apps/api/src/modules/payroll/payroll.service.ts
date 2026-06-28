import { Injectable, NotFoundException } from "@nestjs/common";
import { PayrollManualRecord, Prisma } from "@prisma/client";
import {
  computeCreditHours,
} from "../../common/course-no/course-status";
import {
  formatPeriod,
  periodBounds,
  periodRangeToList,
} from "../../common/payroll/period";
import {
  getPayrollRateRule,
  normalizePayrollTeachingType,
  roundPayrollAmount,
  type PayrollTeachingType,
} from "../../common/payroll/teaching-type";
import {
  buildExportWorkbook,
  type ExportColumn,
} from "../../common/export/export-utils";
import { PrismaService } from "../../prisma/prisma.service";
import { QueryPayrollDto } from "./dto/query-payroll.dto";
import type {
  PayrollAutoRow,
  PayrollCourseItem,
  PayrollListResponse,
  PayrollManualRow,
  PayrollRow,
  PayrollRowState,
} from "./payroll.types";

type AutoAggregate = {
  jobNo: string;
  period: string;
  teachingType: PayrollTeachingType;
  hours: number;
};

type SettlementAggregate = {
  jobNo: string;
  period: string;
  teachingType: PayrollTeachingType;
  rate: number;
  sumPaid: number;
  extraLabor: number;
  extraDeduction: number;
  settlementIds: string[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const DEFAULT_BILLING_TYPE = "常规";

function aggregateKey(
  jobNo: string,
  period: string,
  teachingType: PayrollTeachingType,
): string {
  return `${jobNo}::${period}::${teachingType}`;
}

function courseTypeWhere(teachingType: PayrollTeachingType): Prisma.CourseWhereInput {
  if (teachingType === "其他") {
    return { OR: [{ actualTeachingType: null }, { actualTeachingType: "其他" }] };
  }
  return { actualTeachingType: teachingType };
}

function settlementTypeWhere(
  teachingType: PayrollTeachingType,
): Prisma.PayrollSettlementWhereInput {
  if (teachingType === "公共课直播") {
    return { OR: [{ teachingType }, { teachingType: "公共" }] };
  }
  if (teachingType === "其他") {
    return { OR: [{ teachingType }, { teachingType: null }] };
  }
  return { teachingType };
}

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly exportColumns: ExportColumn[] = [
    { header: "记录类型", key: "kind" },
    { header: "工号", key: "employeeJobNo" },
    { header: "老师姓名", key: "employeeName" },
    { header: "计费方式", key: "employeeBillingType" },
    { header: "所属年月", key: "period" },
    { header: "授课方式", key: "teachingType" },
    { header: "单位课时费", key: "hourlyRate" },
    { header: "已授课时", key: "deliveredHours" },
    { header: "总课时费", key: "totalCourseFee" },
    { header: "其他劳务", key: "extraLabor" },
    { header: "其他扣除", key: "extraDeduction" },
    { header: "应结算薪资", key: "subtotalPayable" },
    { header: "已结算薪资", key: "subtotalPaid" },
    { header: "结算记录ID", key: "settlementIds" },
    { header: "手动记录创建时间", key: "createdAt" },
  ];

  async list(query: QueryPayrollDto): Promise<PayrollListResponse> {
    const periods = periodRangeToList(query.from, query.to);

    const [autoMap, settlementMap, manuals] = await Promise.all([
      this.aggregateAutoHours(periods),
      this.aggregateSettlements(periods),
      this.listManualRecords(periods),
    ]);

    const allJobNos = new Set<string>();
    autoMap.forEach((v) => allJobNos.add(v.jobNo));
    settlementMap.forEach((v) => allJobNos.add(v.jobNo));
    manuals.forEach((m) => allJobNos.add(m.employeeJobNo));

    const employees = allJobNos.size
      ? await this.prisma.employee.findMany({
          where: { jobNo: { in: [...allJobNos] } },
          select: { jobNo: true, name: true, billingType: true },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.jobNo, e]));

    // Auto rows: one per (teacher, period, teachingType) we actually saw
    // course hours for, plus any split that has historical settlements even
    // if no courses fell in this window (keeps paid history visible).
    const autoKeys = new Set<string>(autoMap.keys());
    settlementMap.forEach((_, key) => autoKeys.add(key));

    const autoRows: PayrollAutoRow[] = [];
    for (const key of autoKeys) {
      const hours = autoMap.get(key);
      const s = settlementMap.get(key);
      const [jobNo, period, teachingType] = (hours?.jobNo && hours?.period)
        ? [hours.jobNo, hours.period, hours.teachingType]
        : s
          ? [s.jobNo, s.period, s.teachingType]
          : ["", "", "其他" as PayrollTeachingType];
      if (!jobNo) continue;
      const employee = empMap.get(jobNo);
      const employeeBillingType = employee?.billingType ?? DEFAULT_BILLING_TYPE;
      const rateRule = getPayrollRateRule(employeeBillingType, teachingType);
      const deliveredHours = round2(hours?.hours ?? 0);
      const rate = rateRule.editable ? s?.rate ?? rateRule.defaultRate : rateRule.defaultRate;
      const totalFee = round2(rate * deliveredHours);
      const extraLabor = round2(s?.extraLabor ?? 0);
      const extraDeduction = round2(s?.extraDeduction ?? 0);
      autoRows.push({
        kind: "auto",
        employeeJobNo: jobNo,
        employeeBillingType,
        employeeName:
          employee?.name ?? `(工号 ${jobNo} 已不存在)`,
        period,
        teachingType,
        hourlyRate: rate,
        rateEditable: rateRule.editable,
        deliveredHours,
        totalCourseFee: totalFee,
        extraLabor,
        extraDeduction,
        subtotalPayable: roundPayrollAmount(totalFee + extraLabor - extraDeduction),
        subtotalPaid: round2(s?.sumPaid ?? 0),
        settlementIds: s?.settlementIds ?? [],
      });
    }

    const manualRows: PayrollManualRow[] = manuals.map((m) => {
      const extraLabor = Number(m.extraLabor);
      const extraDeduction = Number(m.extraDeduction);
      const subtotalPayable = round2(extraLabor - extraDeduction);
      return {
        kind: "manual",
        id: m.id,
        employeeJobNo: m.employeeJobNo,
        employeeBillingType:
          empMap.get(m.employeeJobNo)?.billingType ?? DEFAULT_BILLING_TYPE,
        employeeName:
          empMap.get(m.employeeJobNo)?.name ??
          `(工号 ${m.employeeJobNo} 已不存在)`,
        period: m.settlementPeriod,
        teachingType: null,
        hourlyRate: null,
        deliveredHours: 0,
        totalCourseFee: 0,
        extraLabor: round2(extraLabor),
        extraDeduction: round2(extraDeduction),
        subtotalPayable,
        subtotalPaid: round2(Number(m.subtotalPaid)),
        createdAt: m.createdAt.toISOString(),
      };
    });

    const kw = query.keyword?.trim();
    const filterByKw = (row: PayrollRow) => {
      if (!kw) return true;
      const lower = kw.toLowerCase();
      return (
        row.employeeJobNo.includes(kw) ||
        row.employeeName.toLowerCase().includes(lower)
      );
    };

    const filterUnpaid = (row: PayrollRow) => {
      if (!query.unpaidOnly) return true;
      if (row.subtotalPayable == null) return true;
      return row.subtotalPaid < row.subtotalPayable - 1e-6;
    };

    const items: PayrollRow[] = [...autoRows, ...manualRows]
      .filter(filterByKw)
      .filter(filterUnpaid)
      .sort((a, b) => {
        const byName = a.employeeName.localeCompare(
          b.employeeName,
          "zh-Hans-CN",
          { sensitivity: "base" },
        );
        if (byName !== 0) return byName;
        if (a.kind !== b.kind) return a.kind === "auto" ? -1 : 1;
        if (a.period !== b.period) return a.period.localeCompare(b.period);
        if (a.kind === "auto" && b.kind === "auto") {
          return a.teachingType.localeCompare(b.teachingType, "zh-Hans-CN", {
            sensitivity: "base",
          });
        }
        if (a.kind === "manual" && b.kind === "manual") {
          return a.createdAt.localeCompare(b.createdAt);
        }
        return 0;
      });

    return { items, total: items.length };
  }

  async exportAll(query: QueryPayrollDto): Promise<Buffer> {
    const { items } = await this.list(query);
    const rows = items.map((row) => ({
      kind: row.kind === "auto" ? "自动汇总" : "手动记录",
      employeeJobNo: row.employeeJobNo,
      employeeName: row.employeeName,
      employeeBillingType: row.employeeBillingType,
      period: row.period,
      teachingType: row.teachingType ?? "",
      hourlyRate: row.hourlyRate ?? "",
      deliveredHours: row.deliveredHours,
      totalCourseFee: row.totalCourseFee ?? "",
      extraLabor: row.extraLabor,
      extraDeduction: row.extraDeduction,
      subtotalPayable: row.subtotalPayable ?? "",
      subtotalPaid: row.subtotalPaid,
      settlementIds: row.kind === "auto" ? row.settlementIds.join("; ") : "",
      createdAt: row.kind === "manual" ? row.createdAt : "",
    }));
    return buildExportWorkbook(this.exportColumns, rows);
  }

  async getRowState(
    teacherJobNo: string,
    period: string,
    teachingType: PayrollTeachingType,
  ): Promise<PayrollRowState> {
    const emp = await this.prisma.employee.findUnique({
      where: { jobNo: teacherJobNo },
      select: { jobNo: true, name: true, billingType: true },
    });
    if (!emp) {
      throw new NotFoundException("员工不存在");
    }

    const bounds = periodBounds(period);
    const [courses, settlements] = await Promise.all([
      this.prisma.course.findMany({
        where: {
          actualTeacherJobNo: teacherJobNo,
          durationMinutes: { not: null },
          plannedAt: { gte: bounds.start, lt: bounds.end },
          ...courseTypeWhere(teachingType),
        },
        select: { durationMinutes: true },
      }),
      this.prisma.payrollSettlement.findMany({
        where: {
          employeeJobNo: teacherJobNo,
          settlementPeriod: period,
          ...settlementTypeWhere(teachingType),
        },
        orderBy: { settledAt: "desc" },
        select: { hourlyRate: true, subtotalPaid: true },
      }),
    ]);

    const deliveredHours = round2(
      courses.reduce(
        (acc, c) => acc + (computeCreditHours(c.durationMinutes) ?? 0),
        0,
      ),
    );
    const rateRule = getPayrollRateRule(emp.billingType, teachingType);
    const rate = rateRule.editable
      ? settlements.length
        ? Number(settlements[0].hourlyRate)
        : rateRule.defaultRate
      : rateRule.defaultRate;
    const payable = roundPayrollAmount(rate * deliveredHours);
    const alreadyPaid = round2(
      settlements.reduce((s, h) => s + Number(h.subtotalPaid), 0),
    );

    return {
      employeeJobNo: teacherJobNo,
      employeeName: emp.name ?? "",
      employeeBillingType: emp.billingType ?? DEFAULT_BILLING_TYPE,
      period,
      teachingType,
      hourlyRate: rate,
      defaultHourlyRate: rateRule.defaultRate,
      rateEditable: rateRule.editable,
      deliveredHours,
      payable,
      alreadyPaid,
    };
  }

  async listCoursesForTeacherPeriod(
    teacherJobNo: string,
    period: string,
    teachingType: PayrollTeachingType,
  ): Promise<PayrollCourseItem[]> {
    const bounds = periodBounds(period);
    const rows = await this.prisma.course.findMany({
      where: {
        actualTeacherJobNo: teacherJobNo,
        durationMinutes: { not: null },
        plannedAt: { gte: bounds.start, lt: bounds.end },
        ...courseTypeWhere(teachingType),
      },
      orderBy: [{ plannedAt: "asc" }],
      include: { _count: { select: { enrollments: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      courseNo: r.courseNo,
      name: r.name ?? "",
      plannedAt: r.plannedAt ? r.plannedAt.toISOString() : null,
      durationMinutes: r.durationMinutes,
      creditHours: computeCreditHours(r.durationMinutes),
      actualTeachingType: r.actualTeachingType,
      enrolledStudentCount: r._count.enrollments,
    }));
  }

  private async aggregateAutoHours(
    periods: string[],
  ): Promise<Map<string, AutoAggregate>> {
    if (periods.length === 0) return new Map();
    const first = periodBounds(periods[0]);
    const last = periodBounds(periods[periods.length - 1]);

    const courses = await this.prisma.course.findMany({
      where: {
        actualTeacherJobNo: { not: null },
        durationMinutes: { not: null },
        plannedAt: { gte: first.start, lt: last.end },
      },
      select: {
        actualTeacherJobNo: true,
        plannedAt: true,
        durationMinutes: true,
        actualTeachingType: true,
      },
    });

    const map = new Map<string, AutoAggregate>();
    const periodSet = new Set(periods);
    for (const c of courses) {
      if (!c.actualTeacherJobNo || !c.plannedAt) continue;
      const y = c.plannedAt.getUTCFullYear();
      const m = c.plannedAt.getUTCMonth() + 1;
      const p = formatPeriod(y, m);
      if (!periodSet.has(p)) continue;
      const teachingType = normalizePayrollTeachingType(c.actualTeachingType);
      const key = aggregateKey(c.actualTeacherJobNo, p, teachingType);
      const prev = map.get(key) ?? {
        jobNo: c.actualTeacherJobNo,
        period: p,
        teachingType,
        hours: 0,
      };
      prev.hours += computeCreditHours(c.durationMinutes) ?? 0;
      map.set(key, prev);
    }
    return map;
  }

  private async aggregateSettlements(
    periods: string[],
  ): Promise<Map<string, SettlementAggregate>> {
    if (periods.length === 0) return new Map();
    const rows = await this.prisma.payrollSettlement.findMany({
      where: { settlementPeriod: { in: periods } },
      orderBy: { settledAt: "asc" },
    });
    const map = new Map<string, SettlementAggregate>();
    for (const s of rows) {
      const teachingType = normalizePayrollTeachingType(s.teachingType);
      const key = aggregateKey(s.employeeJobNo, s.settlementPeriod, teachingType);
      const cur = map.get(key) ?? {
        jobNo: s.employeeJobNo,
        period: s.settlementPeriod,
        teachingType,
        rate: Number(s.hourlyRate),
        sumPaid: 0,
        extraLabor: 0,
        extraDeduction: 0,
        settlementIds: [] as string[],
      };
      cur.rate = Number(s.hourlyRate);
      cur.sumPaid += Number(s.subtotalPaid);
      cur.extraLabor += Number(s.extraLabor);
      cur.extraDeduction += Number(s.extraDeduction);
      cur.settlementIds.push(s.id);
      map.set(key, cur);
    }
    return map;
  }

  private async listManualRecords(
    periods: string[],
  ): Promise<PayrollManualRecord[]> {
    return this.prisma.payrollManualRecord.findMany({
      where: { settlementPeriod: { in: periods } },
      orderBy: { createdAt: "asc" },
    });
  }
}
