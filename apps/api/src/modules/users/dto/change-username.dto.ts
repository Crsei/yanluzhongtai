import { IsString, MaxLength, MinLength } from "class-validator";

export class ChangeUsernameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  newUsername!: string;
}
