import { IsString } from "class-validator";

export class DeactivateUserDto {
  @IsString()
  phoneConfirmation!: string;
}
