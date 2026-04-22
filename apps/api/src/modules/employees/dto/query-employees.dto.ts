import { Transform, Type } from "class-transformer";
import { IsArray, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { type EmploymentStatus } from "../../../common/dictionaries";

export class QueryEmployeesDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  /**
   * Accept either a single code ("FULL_TIME") or a comma-separated list
   * ("FULL_TIME,PART_TIME"). The transformer normalises to an array; the
   * service reads .length to decide single vs. `in` filtering.
   */
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === "") return undefined;
    if (Array.isArray(value)) return value;
    return String(value).split(",").map((s) => s.trim()).filter(Boolean);
  })
  @IsArray()
  @IsString({ each: true })
  employmentStatus?: EmploymentStatus[];

  /** Comma-separated list of exact jobNo values. When present, keyword is ignored. */
  @IsOptional()
  @IsString()
  jobNo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}
