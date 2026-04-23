import { IsNumberString, IsString, Matches } from "class-validator";

export class SettlePayrollDto {
  @IsString()
  @Matches(/^\d{5}$/, { message: "employeeJobNo 必须是 5 位工号" })
  employeeJobNo!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "settlementPeriod 必须是 YYYYMM" })
  settlementPeriod!: string;

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
