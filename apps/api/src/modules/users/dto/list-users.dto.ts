import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListUsersDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize: number = 50;

  @IsOptional()
  @IsString()
  keyword?: string;

  @Transform(({ value }) => value === true || value === "true" || value === 1)
  @IsBoolean()
  includeDeactivated: boolean = false;
}
