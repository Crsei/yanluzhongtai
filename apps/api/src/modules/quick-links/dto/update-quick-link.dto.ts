import { QuickLinkKind } from "@prisma/client";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class UpdateQuickLinkDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsEnum(QuickLinkKind)
  kind?: QuickLinkKind;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  url?: string;
}
