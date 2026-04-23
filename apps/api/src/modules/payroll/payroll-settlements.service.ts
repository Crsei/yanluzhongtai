import {
  BadRequestException,
  Injectable,
} from "@nestjs/common";
import { PayrollSettlement } from "@prisma/client";
import { periodBounds } from "../../common/payroll/period";
import { computeCreditHours } from "../../common/course-no/course-status";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import type { AuthUser } from "../auth/auth.types";
import { SettlePayrollDto } from "./dto/settle-payroll.dto";

/** Float tolerance so settlements that are numerically "right at the cap"
 * don't get falsely rejected by a binary-FP rounding error. */
const FLOAT_EPS = 1e-6;

@Injectable()
export class PayrollSettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(
    dto: SettlePayrollDto,
    operator: AuthUser,
  ): Promise<PayrollSettlement> {
    // 1. Re-aggregate deliveredHours now (TOCTOU safe: we read from the
    //    authoritative Course table rather than trusting a client-supplied value).
    const bounds = periodBounds(dto.settlementPeriod);
    const courses = await this.prisma.course.findMany({
      where: {
        actualTeacherJobNo: dto.employeeJobNo,
        durationMinutes: { not: null },
        plannedAt: { gte: bounds.start, lt: bounds.end },
      },
      select: { durationMinutes: true },
    });
    const deliveredHours = courses.reduce(
      (acc, c) => acc + (computeCreditHours(c.durationMinutes) ?? 0),
      0,
    );

    // 2. Enforce the "one rate per (teacher, period)" invariant (spec §9.2).
    const history = await this.prisma.payrollSettlement.findMany({
      where: {
        employeeJobNo: dto.employeeJobNo,
        settlementPeriod: dto.settlementPeriod,
      },
      select: { hourlyRate: true, subtotalPaid: true },
    });

    const newRate = Number(dto.hourlyRate);
    if (!Number.isFinite(newRate) || newRate <= 0) {
      throw new BadRequestException("单位课时费必须大于 0");
    }
    if (history.length > 0) {
      const existingRate = Number(history[0].hourlyRate);
      if (Math.abs(newRate - existingRate) > FLOAT_EPS) {
        throw new BadRequestException(
          `该月单位课时费已为 ${existingRate} 元,不得更改`,
        );
      }
    }

    const extraLabor = Number(dto.extraLabor);
    const extraDeduction = Number(dto.extraDeduction);
    const paidAmount = Number(dto.paidAmount);
    if (
      !Number.isFinite(extraLabor) ||
      !Number.isFinite(extraDeduction) ||
      !Number.isFinite(paidAmount)
    ) {
      throw new BadRequestException("金额字段必须是数字");
    }
    if (paidAmount <= 0) {
      throw new BadRequestException("本次结算金额必须大于 0");
    }

    const payable = newRate * deliveredHours + extraLabor - extraDeduction;
    const alreadyPaid = history.reduce(
      (s, h) => s + Number(h.subtotalPaid),
      0,
    );
    if (paidAmount > payable - alreadyPaid + FLOAT_EPS) {
      throw new BadRequestException(
        `本次结算金额超出剩余应结算 ${(payable - alreadyPaid).toFixed(2)} 元`,
      );
    }

    const created = await this.prisma.payrollSettlement.create({
      data: {
        operatorPhone: operator.phone,
        employeeJobNo: dto.employeeJobNo,
        settlementPeriod: dto.settlementPeriod,
        hourlyRate: newRate,
        deliveredHours,
        extraLabor,
        extraDeduction,
        subtotalPayable: payable,
        subtotalPaid: paidAmount,
      },
    });

    await this.auditLogs.record({
      operatorId: operator.id,
      action: "settle",
      targetType: "payroll_settlement",
      targetId: created.id,
      after: this.snapshot(created),
    });

    return created;
  }

  private snapshot(s: PayrollSettlement): Record<string, unknown> {
    return {
      employeeJobNo: s.employeeJobNo,
      settlementPeriod: s.settlementPeriod,
      hourlyRate: s.hourlyRate.toString(),
      deliveredHours: s.deliveredHours.toString(),
      extraLabor: s.extraLabor.toString(),
      extraDeduction: s.extraDeduction.toString(),
      subtotalPayable: s.subtotalPayable.toString(),
      subtotalPaid: s.subtotalPaid.toString(),
      operatorPhone: s.operatorPhone,
      settledAt: s.settledAt.toISOString(),
    };
  }
}
