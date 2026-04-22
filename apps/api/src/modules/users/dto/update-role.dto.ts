import { UserRole } from "@prisma/client";
import { IsEnum } from "class-validator";

export class UpdateRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}
