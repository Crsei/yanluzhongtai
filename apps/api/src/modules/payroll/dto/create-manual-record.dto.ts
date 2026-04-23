import { IsNumberString, IsString, Matches } from "class-validator";

export class CreateManualRecordDto {
  @IsString()
  @Matches(/^\d{5}$/, { message: "employeeJobNo 必须是 5 位工号" })
  employeeJobNo!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "settlementPeriod 必须是 YYYYMM" })
  settlementPeriod!: string;

  @IsNumberString()
  extraLabor!: string;

  @IsNumberString()
  extraDeduction!: string;
}
