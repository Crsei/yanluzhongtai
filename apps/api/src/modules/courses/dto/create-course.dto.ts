import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { TEACHING_TYPE, type TeachingType } from "../../../common/dictionaries";

export class CreateCourseDto {
  /** Outline item (TT + KK source of truth). */
  @IsString()
  outlineItemId!: string;

  /** Course record display name (defaults to the item's secondaryCategoryName on form but still required). */
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsDateString()
  plannedAt?: string | null;

  @IsOptional()
  @IsString()
  actualTeacherJobNo?: string | null;

  @IsOptional()
  @IsIn(TEACHING_TYPE)
  actualTeachingType?: TeachingType | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  durationMinutes?: number | null;

  @IsOptional()
  @IsString()
  replayUrl?: string | null;

  @IsOptional()
  @IsString()
  videoUrl?: string | null;

  @IsOptional()
  @IsString()
  resourceUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  studentIds?: string[];
}
