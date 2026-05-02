import { Injectable, NotFoundException } from "@nestjs/common";
import { PayrollManualRecord } from "@prisma/client";
import {
  computeCreditHours,
} from "../../common/course-no/course-status";
import {
  formatPeriod,
  periodBounds,
  periodRangeToList,
} from "../../common/payroll/period";
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
  hours: number;
};

type SettlementAggregate = {
  jobNo: string;
  period: string;
  rate: number;
  sumPaid: number;
  settlementIds: string[];
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class PayrollService {
  constructor(private readonly prisma: PrismaService) {}

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
          select: { jobNo: true, name: true },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.jobNo, e.name]));

    // Auto rows: one per (teacher, period) we actually saw course hours for,
    // plus any (teacher, period) that has historical settlements even if no
    // courses fell in this window (keeps paid history visible).
    const autoKeys = new Set<string>(autoMap.keys());
    settlementMap.forEach((_, key) => autoKeys.add(key));

    const autoRows: PayrollAutoRow[] = [];
    for (const key of autoKeys) {
      const hours = autoMap.get(key);
      const s = settlementMap.get(key);
      const [jobNo, period] = (hours?.jobNo && hours?.period)
        ? [hours.jobNo, hours.period]
        : s
          ? [s.jobNo, s.period]
          : ["", ""];
      if (!jobNo) continue;
      const deliveredHours = round2(hours?.hours ?? 0);
      const rate = s?.rate ?? null;
      const totalFee = rate != null ? round2(rate * deliveredHours) : null;
      autoRows.push({
        kind: "auto",
        employeeJobNo: jobNo,
        employeeName:
          empMap.get(jobNo) ?? `(工号 ${jobNo} 已不存在)`,
        period,
        hourlyRate: rate,
        deliveredHours,
        totalCourseFee: totalFee,
        extraLabor: 0,
        extraDeduction: 0,
        subtotalPayable: totalFee,
        subtotalPaid: round2(s?.sumPaid ?? 0),
        settlementIds: s?.settlementIds ?? [],
      });
    }

    const manualRows: PayrollManualRow[] = manuals.map((m) => {
      const extraLabor = Number(m.extraLabor);
      const extraDeduction = Number(m.extraDeduction);
      return {
        kind: "manual",
        id: m.id,
        employeeJobNo: m.employeeJobNo,
        employeeName:
          empMap.get(m.employeeJobNo) ??
          `(工号 ${m.employeeJobNo} 已不存在)`,
        period: m.settlementPeriod,
        hourlyRate: null,
        deliveredHours: 0,
        totalCourseFee: 0,
        extraLabor: round2(extraLabor),
        extraDeduction: round2(extraDeduction),
        subtotalPayable: round2(extraLabor - extraDeduction),
        subtotalPaid: 0,
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
      if (row.kind === "manual") return true;
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
        if (a.kind === "manual" && b.kind === "manual") {
          return a.createdAt.localeCompare(b.createdAt);
        }
        return 0;
      });

    return { items, total: items.length };
  }

  async getRowState(
    teacherJobNo: string,
    period: string,
  ): Promise<PayrollRowState> {
    const emp = await this.prisma.employee.findUnique({
      where: { jobNo: teacherJobNo },
      select: { jobNo: true, name: true },
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
        },
        select: { durationMinutes: true },
      }),
      this.prisma.payrollSettlement.findMany({
        where: { employeeJobNo: teacherJobNo, settlementPeriod: period },
        select: { hourlyRate: true, subtotalPaid: true },
      }),
    ]);

    const deliveredHours = round2(
      courses.reduce(
        (acc, c) => acc + (computeCreditHours(c.durationMinutes) ?? 0),
        0,
      ),
    );
    const rate = settlements.length
      ? Number(settlements[0].hourlyRate)
      : null;
    const payable = rate != null ? round2(rate * deliveredHours) : null;
    const alreadyPaid = round2(
      settlements.reduce((s, h) => s + Number(h.subtotalPaid), 0),
    );

    return {
      employeeJobNo: teacherJobNo,
      employeeName: emp.name ?? "",
      period,
      hourlyRate: rate,
      deliveredHours,
      payable,
      alreadyPaid,
    };
  }

  async listCoursesForTeacherPeriod(
    teacherJobNo: string,
    period: string,
  ): Promise<PayrollCourseItem[]> {
    const bounds = periodBounds(period);
    const rows = await this.prisma.course.findMany({
      where: {
        actualTeacherJobNo: teacherJobNo,
        durationMinutes: { not: null },
        plannedAt: { gte: bounds.start, lt: bounds.end },
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
      const key = `${c.actualTeacherJobNo}::${p}`;
      const prev = map.get(key) ?? {
        jobNo: c.actualTeacherJobNo,
        period: p,
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
      const key = `${s.employeeJobNo}::${s.settlementPeriod}`;
      const cur = map.get(key) ?? {
        jobNo: s.employeeJobNo,
        period: s.settlementPeriod,
        rate: Number(s.hourlyRate),
        sumPaid: 0,
        settlementIds: [] as string[],
      };
      cur.rate = Number(s.hourlyRate);
      cur.sumPaid += Number(s.subtotalPaid);
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
