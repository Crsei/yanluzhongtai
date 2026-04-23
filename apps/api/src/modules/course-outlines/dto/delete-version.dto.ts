import { IsString, MaxLength } from "class-validator";

export class DeleteVersionDto {
  @IsString()
  @MaxLength(30)
  confirmVersionName!: string;
}
