import { QuickLinkPageType } from "@prisma/client";
import { IsEnum } from "class-validator";

export class QueryQuickLinksDto {
  @IsEnum(QuickLinkPageType)
  pageType!: QuickLinkPageType;
}
