import { Transform } from "class-transformer";
import { IsBoolean, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: "手机号格式不正确" })
  phone!: string;

  @IsString()
  @MinLength(6, { message: "密码至少 6 位" })
  @MaxLength(64)
  password!: string;

  @Transform(({ value }) => value === true || value === "true" || value === 1)
  @IsBoolean()
  rememberMe!: boolean;
}
