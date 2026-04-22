import { UserRole } from "@prisma/client";
import { IsEnum, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class RegisterUserDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: "手机号格式不正确" })
  phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  username!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
