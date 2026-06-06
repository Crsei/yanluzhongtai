import { IsInt, IsOptional, IsString, IsUrl, Matches, MaxLength, Min } from "class-validator";

export class CreateSectionDto {
  @IsString()
  @MaxLength(10)
  @Matches(/^[A-Z]{1,2}$/, { message: "板块缩写需为 1-2 位大写字母" })
  code!: string;

  @IsString()
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsUrl({}, { message: "板块资源链接需为合法 URL" })
  resourceUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
