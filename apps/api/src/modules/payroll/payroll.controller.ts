import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { normalizePayrollTeachingType } from "../../common/payroll/teaching-type";
import { CreateManualRecordDto } from "./dto/create-manual-record.dto";
import { QueryPayrollDto } from "./dto/query-payroll.dto";
import { SettlePayrollDto } from "./dto/settle-payroll.dto";
import { PayrollManualRecordsService } from "./payroll-manual-records.service";
import { PayrollService } from "./payroll.service";
import { PayrollSettlementsService } from "./payroll-settlements.service";

@Controller("payroll")
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly settlements: PayrollSettlementsService,
    private readonly manuals: PayrollManualRecordsService,
  ) {}

  @Get()
  list(@Query() query: QueryPayrollDto) {
    return this.payroll.list(query);
  }

  @Get("export")
  async exportExcel(@Query() query: QueryPayrollDto, @Res() res: Response) {
    const buf = await this.payroll.exportAll(query);
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="payroll-export-${today}.xlsx"`,
    );
    res.send(buf);
  }

  @Get("row/:jobNo/:period")
  rowState(
    @Param("jobNo") jobNo: string,
    @Param("period") period: string,
    @Query("teachingType") teachingType?: string,
  ) {
    return this.payroll.getRowState(
      jobNo,
      period,
      normalizePayrollTeachingType(teachingType),
    );
  }

  @Get("courses")
  coursesForTeacherPeriod(
    @Query("teacherJobNo") teacherJobNo: string,
    @Query("period") period: string,
    @Query("teachingType") teachingType?: string,
  ) {
    return this.payroll.listCoursesForTeacherPeriod(
      teacherJobNo,
      period,
      normalizePayrollTeachingType(teachingType),
    );
  }

  @Post("settlements")
  createSettlement(
    @Body() dto: SettlePayrollDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.settlements.create(dto, operator);
  }

  @Post("manual-records")
  createManualRecord(
    @Body() dto: CreateManualRecordDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.manuals.create(dto, operator);
  }

  @Delete("manual-records/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteManualRecord(
    @Param("id") id: string,
    @CurrentUser() operator: AuthUser,
  ) {
    await this.manuals.remove(id, operator);
  }
}
