import { Type } from "class-transformer";
import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import {
  TEACHING_TYPE,
  TeachingType,
} from "../../../common/dictionaries";
import { CreateSectionDto } from "./create-section.dto";

export class CreateItemDto {
  /** One of sectionCode / newSection must be provided. */
  @ValidateIf((o: CreateItemDto) => !o.newSection)
  @IsString()
  @MaxLength(10)
  sectionCode?: string;

  @ValidateIf((o: CreateItemDto) => !o.sectionCode)
  @ValidateNested()
  @Type(() => CreateSectionDto)
  newSection?: CreateSectionDto;

  /**
   * Accepts 1–99 as a 1-2 digit string. Service pads to two digits before
   * persisting.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,2}$/, { message: "序列号需为 1-2 位数字" })
  sequenceNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  secondaryCategoryName?: string | null;

  @IsOptional()
  @IsIn(TEACHING_TYPE as unknown as string[])
  suggestedTeachingType?: TeachingType | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  plannedTeacherJobNo?: string;

  @IsOptional()
  @IsUrl({}, { message: "教案排期链接需为合法 URL" })
  lessonPlanUrl?: string;
}
