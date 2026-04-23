import { IsString, MaxLength } from "class-validator";

export class OutlineImportDto {
  @IsString()
  @MaxLength(300)
  fileKey!: string;
}
