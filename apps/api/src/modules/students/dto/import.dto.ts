// apps/api/src/modules/students/dto/import.dto.ts
import { IsString } from "class-validator";

export class ImportFileKeyDto {
  @IsString()
  fileKey!: string;
}
