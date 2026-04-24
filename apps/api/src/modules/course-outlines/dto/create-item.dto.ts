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
  COURSE_SECTION_CODES,
  TEACHING_TYPE,
  TeachingType,
} from "../../../common/dictionaries";
import { CreateSectionDto } from "./create-section.dto";

export class CreateItemDto {
  /** One of sectionCode / newSection must be provided. */
  @ValidateIf((o: CreateItemDto) => !o.newSection)
  @IsString()
  @IsIn(COURSE_SECTION_CODES, {
    // spec §2.3.3: 12 个预定义板块代码
    message: `板块代码仅支持 ${COURSE_SECTION_CODES.join("/")}`,
  })
  sectionCode?: string;

  @ValidateIf((o: CreateItemDto) => !o.sectionCode)
  @ValidateNested()
  @Type(() => CreateSectionDto)
  newSection?: CreateSectionDto;

  /**
   * Accepts 1–99 as a 1-2 digit string. Service pads to two digits before
   * persisting.
   */
  @IsString()
  @Matches(/^\d{1,2}$/, { message: "序列号需为 1-2 位数字" })
  sequenceNo!: string;

  @IsString()
  @MaxLength(100)
  secondaryCategoryName!: string;

  @IsIn(TEACHING_TYPE as unknown as string[])
  suggestedTeachingType!: TeachingType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  plannedTeacherJobNo?: string;

  @IsOptional()
  @IsUrl({}, { message: "教案排期链接需为合法 URL" })
  lessonPlanUrl?: string;
}
