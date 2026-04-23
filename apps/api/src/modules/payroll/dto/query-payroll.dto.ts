import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";

export class QueryPayrollDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: "from 必须是 YYYYMM" })
  from!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: "to 必须是 YYYYMM" })
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  keyword?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === "true" || value === "1")
  @IsBoolean()
  unpaidOnly?: boolean;
}
