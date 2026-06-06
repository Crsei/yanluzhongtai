import { IsInt, IsOptional, IsString, IsUrl, MaxLength, Min } from "class-validator";

export class CreateSectionDto {
  @IsString()
  @MaxLength(10)
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
