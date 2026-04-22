import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import {
  EMPLOYMENT_STATUS,
  EmploymentStatus,
} from "../../../common/dictionaries";

export class QueryEmployeesDto {
  @IsOptional() @IsString()
  keyword?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt() @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt() @Min(1) @Max(200)
  pageSize?: number;

  @IsOptional()
  @IsIn(EMPLOYMENT_STATUS as unknown as string[])
  employmentStatus?: EmploymentStatus;
}
