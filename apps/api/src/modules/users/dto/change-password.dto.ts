import { IsString, Matches, MinLength } from "class-validator";

export class ChangePasswordDto {
  @IsString()
  oldPassword!: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, {
    message: "密码需≥8字符且含字母与数字",
  })
  newPassword!: string;
}
