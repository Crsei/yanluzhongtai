import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import {
  COURSE_STATUS,
  type CourseStatus,
  TEACHING_TYPE,
  type TeachingType,
} from "../../../common/dictionaries";

export class QueryCoursesDto {
  /** Simple search: matches courseNo / name / secondaryCategoryName ILIKE. */
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  secondaryCategoryName?: string;

  @IsOptional()
  @IsString()
  sectionCode?: string;

  @IsOptional()
  @IsIn(TEACHING_TYPE)
  actualTeachingType?: TeachingType;

  @IsOptional()
  @IsString()
  actualTeacherJobNo?: string;

  /** Filter by a single enrolled student id. */
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsIn(COURSE_STATUS)
  status?: CourseStatus;

  @IsOptional()
  @IsDateString()
  plannedAtFrom?: string;

  @IsOptional()
  @IsDateString()
  plannedAtTo?: string;

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
