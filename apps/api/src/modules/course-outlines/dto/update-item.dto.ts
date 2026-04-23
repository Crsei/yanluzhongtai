import {
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from "class-validator";
import { TEACHING_TYPE, TeachingType } from "../../../common/dictionaries";

export class UpdateItemDto {
  /** sectionCode must reference an existing section within the item's version. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: "板块代码需为两位大写字母" })
  sectionCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,2}$/, { message: "序列号需为 1-2 位数字" })
  sequenceNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  secondaryCategoryName?: string;

  @IsOptional()
  @IsIn(TEACHING_TYPE as unknown as string[])
  suggestedTeachingType?: TeachingType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  plannedTeacherJobNo?: string | null;

  @IsOptional()
  @IsUrl({}, { message: "教案排期链接需为合法 URL" })
  lessonPlanUrl?: string | null;
}
