import { IsString, MaxLength } from "class-validator";

export class ImportFileKeyDto {
  @IsString() @MaxLength(300)
  fileKey!: string;
}
