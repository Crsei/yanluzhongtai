import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { COURSE_SECTION_CODES, CourseSectionCode } from "../../../common/dictionaries";

/**
 * spec §2.3.3: 板块代码必须在 12 个预定义枚举 (XX/GP/KY/DC/JS/LW/RZ/ZL/WZ/ZP/KA/QT) 中。
 * XX 是占位"--请选择--",实际创建板块时由前端/后端决定是否允许;这里允许(导入处
 * 已经禁止),因为现有前端使用 XX 作为初始值。
 */
export class CreateSectionDto {
  @IsString()
  @IsIn(COURSE_SECTION_CODES, {
    message: `板块代码仅支持 ${COURSE_SECTION_CODES.join("/")}`,
  })
  code!: CourseSectionCode;

  @IsString()
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
