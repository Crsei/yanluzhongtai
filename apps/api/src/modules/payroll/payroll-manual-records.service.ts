import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PayrollManualRecord } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import type { AuthUser } from "../auth/auth.types";
import { CreateManualRecordDto } from "./dto/create-manual-record.dto";
import { SettleManualRecordDto } from "./dto/settle-manual-record.dto";

@Injectable()
export class PayrollManualRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(
    dto: CreateManualRecordDto,
    operator: AuthUser,
  ): Promise<PayrollManualRecord> {
    const emp = await this.prisma.employee.findUnique({
      where: { jobNo: dto.employeeJobNo },
      select: { jobNo: true },
    });
    if (!emp) {
      throw new BadRequestException("指定员工不存在");
    }

    const extraLabor = Number(dto.extraLabor);
    const extraDeduction = Number(dto.extraDeduction);
    if (!Number.isFinite(extraLabor) || !Number.isFinite(extraDeduction)) {
      throw new BadRequestException("金额字段必须是数字");
    }
    if (extraLabor <= 0) {
      throw new BadRequestException("其他劳务必须大于 0");
    }
    if (extraLabor === extraDeduction) {
      throw new BadRequestException("其他扣除不得等于其他劳务");
    }

    const created = await this.prisma.payrollManualRecord.create({
      data: {
        employeeJobNo: dto.employeeJobNo,
        settlementPeriod: dto.settlementPeriod,
        extraLabor,
        extraDeduction,
        operatorPhone: operator.phone,
      },
    });

    await this.auditLogs.record({
      operatorId: operator.id,
      action: "create",
      targetType: "payroll_manual_record",
      targetId: created.id,
      after: this.snapshot(created),
    });

    return created;
  }

  async remove(id: string, operator: AuthUser): Promise<void> {
    const before = await this.prisma.payrollManualRecord.findUnique({
      where: { id },
    });
    if (!before) {
      throw new NotFoundException("手动记录不存在");
    }

    await this.prisma.payrollManualRecord.delete({ where: { id } });

    await this.auditLogs.record({
      operatorId: operator.id,
      action: "delete",
      targetType: "payroll_manual_record",
      targetId: id,
      before: this.snapshot(before),
    });
  }

  async settle(
    id: string,
    dto: SettleManualRecordDto,
    operator: AuthUser,
  ): Promise<PayrollManualRecord> {
    const before = await this.prisma.payrollManualRecord.findUnique({
      where: { id },
    });
    if (!before) {
      throw new NotFoundException("手动记录不存在");
    }

    const paidAmount = Number(dto.paidAmount);
    if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
      throw new BadRequestException("本次结算金额必须大于 0");
    }

    const payable = Number(before.extraLabor) - Number(before.extraDeduction);
    const alreadyPaid = Number(before.subtotalPaid);
    const remaining = payable - alreadyPaid;
    if (paidAmount > remaining + 1e-6) {
      throw new BadRequestException(
        `本次结算金额超出剩余应结算 ${(remaining).toFixed(2)} 元`,
      );
    }

    const after = await this.prisma.payrollManualRecord.update({
      where: { id },
      data: { subtotalPaid: alreadyPaid + paidAmount },
    });

    await this.auditLogs.record({
      operatorId: operator.id,
      action: "settle",
      targetType: "payroll_manual_record",
      targetId: id,
      before: this.snapshot(before),
      after: this.snapshot(after),
    });

    return after;
  }

  private snapshot(record: PayrollManualRecord): Record<string, unknown> {
    return {
      employeeJobNo: record.employeeJobNo,
      settlementPeriod: record.settlementPeriod,
      extraLabor: record.extraLabor.toString(),
      extraDeduction: record.extraDeduction.toString(),
      subtotalPaid: record.subtotalPaid.toString(),
      operatorPhone: record.operatorPhone,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
