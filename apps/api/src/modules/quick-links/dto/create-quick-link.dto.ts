import { QuickLinkKind, QuickLinkPageType } from "@prisma/client";
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateQuickLinkDto {
  @IsEnum(QuickLinkPageType)
  pageType!: QuickLinkPageType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  category!: string;

  @IsEnum(QuickLinkKind)
  kind!: QuickLinkKind;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  url!: string;
}
