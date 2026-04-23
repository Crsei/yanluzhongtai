import { IsString } from "class-validator";

export class CourseImportDto {
  @IsString()
  fileKey!: string;
}
