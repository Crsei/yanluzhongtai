import { IsNumberString } from "class-validator";

export class SettleManualRecordDto {
  @IsNumberString()
  paidAmount!: string;
}
