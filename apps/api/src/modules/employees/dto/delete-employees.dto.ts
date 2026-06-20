import { ArrayMinSize, ArrayUnique, IsArray, IsString } from "class-validator";

export class DeleteEmployeesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  ids!: string[];
}
