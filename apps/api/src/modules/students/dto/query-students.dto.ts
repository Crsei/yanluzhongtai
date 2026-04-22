// apps/api/src/modules/students/dto/query-students.dto.ts
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import {
  GRADE_VALUES,
  type GradeValue,
  SERVICE_PLATFORM,
  type ServicePlatform,
  STUDENT_SOURCE,
  type StudentSource,
} from "../../../common/dictionaries";

export class QueryStudentsDto {
  /** Simple search (name | studentNo | phone ILIKE) */
  @IsOptional()
  @IsString()
  keyword?: string;

  /** Advanced search fields (spec §7) */
  @IsOptional()
  @IsString()
  studentNo?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(GRADE_VALUES)
  grade?: GradeValue;

  @IsOptional()
  @IsString()
  major?: string;

  @IsOptional()
  @IsIn(STUDENT_SOURCE)
  source?: StudentSource;

  @IsOptional()
  @IsIn(SERVICE_PLATFORM)
  servicePlatform?: ServicePlatform;

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
