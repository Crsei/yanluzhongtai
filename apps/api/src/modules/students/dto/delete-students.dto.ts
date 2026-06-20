import { ArrayMinSize, ArrayUnique, IsArray, IsString } from "class-validator";

export class DeleteStudentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  ids!: string[];
}
