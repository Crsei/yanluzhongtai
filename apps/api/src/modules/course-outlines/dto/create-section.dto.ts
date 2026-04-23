import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from "class-validator";

export class CreateSectionDto {
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: "板块代码需为两位大写字母" })
  code!: string;

  @IsString()
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
