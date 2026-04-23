import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { QuickLinkPageType, UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { CreateQuickLinkDto } from "./dto/create-quick-link.dto";
import { QueryQuickLinksDto } from "./dto/query-quick-links.dto";
import { ReorderQuickLinksDto } from "./dto/reorder-quick-links.dto";
import { UpdateQuickLinkDto } from "./dto/update-quick-link.dto";
import { QuickLinksService } from "./quick-links.service";

@Controller()
export class QuickLinksController {
  constructor(private readonly service: QuickLinksService) {}

  /** Public entry for the SOP page — accessible to anonymous visitors per spec §8. */
  @Public()
  @Get("public/sop-links")
  listSop() {
    return this.service.listByPageType(QuickLinkPageType.SOP);
  }

  /** Authenticated entry — supports both DATA_TABLE and SOP for internal pages. */
  @Get("quick-links")
  list(@Query() query: QueryQuickLinksDto) {
    return this.service.listByPageType(query.pageType);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("quick-links")
  create(@Body() dto: CreateQuickLinkDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("quick-links/reorder")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reorder(@Body() dto: ReorderQuickLinksDto, @CurrentUser() user: AuthUser) {
    await this.service.reorder(dto, user.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Patch("quick-links/:id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateQuickLinkDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete("quick-links/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    await this.service.remove(id, user.id);
  }
}
