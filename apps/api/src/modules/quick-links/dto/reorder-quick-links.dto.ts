import { Type } from "class-transformer";
import { QuickLinkPageType } from "@prisma/client";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class ReorderQuickLinkItem {
  @IsString()
  id!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderQuickLinksDto {
  @IsEnum(QuickLinkPageType)
  pageType!: QuickLinkPageType;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReorderQuickLinkItem)
  items!: ReorderQuickLinkItem[];
}
