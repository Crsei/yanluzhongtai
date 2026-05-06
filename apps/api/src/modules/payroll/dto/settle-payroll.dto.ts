import { IsIn, IsNumberString, IsString, Matches } from "class-validator";
import {
  PAYROLL_TEACHING_TYPES,
  type PayrollTeachingType,
} from "../../../common/payroll/teaching-type";

export class SettlePayrollDto {
  @IsString()
  @Matches(/^\d{5}$/, { message: "employeeJobNo 必须是 5 位工号" })
  employeeJobNo!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "settlementPeriod 必须是 YYYYMM" })
  settlementPeriod!: string;

  @IsString()
  @IsIn(PAYROLL_TEACHING_TYPES, {
    message: "teachingType 必须是 1v1 或 公共",
  })
  teachingType!: PayrollTeachingType;

  /** Required on every submit. If the month already has settlements, must equal the existing rate. */
  @IsNumberString()
  hourlyRate!: string;

  /** Amount paid in this one settlement event. */
  @IsNumberString()
  paidAmount!: string;

  @IsNumberString()
  extraLabor!: string;

  @IsNumberString()
  extraDeduction!: string;
}
