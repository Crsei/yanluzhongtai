import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { CreateItemDto } from "./dto/create-item.dto";
import { UpdateItemDto } from "./dto/update-item.dto";
import { DeleteItemsDto } from "./dto/delete-items.dto";
import { DeleteVersionDto } from "./dto/delete-version.dto";
import { OutlineImportDto } from "./dto/import.dto";
import { CourseOutlinesService } from "./course-outlines.service";
import { CourseOutlineItemsService } from "./course-outline-items.service";
import { CourseOutlineImportService } from "./course-outline-import.service";

@Controller("course-outlines")
export class CourseOutlinesController {
  constructor(
    private readonly versions: CourseOutlinesService,
    private readonly items: CourseOutlineItemsService,
    private readonly imports: CourseOutlineImportService,
  ) {}

  @Get("versions")
  listVersions() {
    return this.versions.listVersions();
  }

  @Get("versions/:id")
  getVersion(@Param("id") id: string) {
    return this.versions.getVersion(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("versions")
  createVersion(@CurrentUser() operator: AuthUser) {
    return this.versions.createVersion(operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete("versions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteVersion(
    @Param("id") id: string,
    @Body() dto: DeleteVersionDto,
    @CurrentUser() operator: AuthUser,
  ) {
    await this.versions.deleteVersion(id, dto.confirmVersionName, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("versions/:id/items")
  addItem(
    @Param("id") versionId: string,
    @Body() dto: CreateItemDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.items.addItem(versionId, dto, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Put("items/:itemId")
  updateItem(
    @Param("itemId") itemId: string,
    @Body() dto: UpdateItemDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.items.updateItem(itemId, dto, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete("items")
  deleteItems(@Body() dto: DeleteItemsDto, @CurrentUser() operator: AuthUser) {
    return this.items.deleteItems(dto.ids, operator.id);
  }

  /**
   * Reserved standalone endpoint — Phase 3 has no UI entry. The "add item"
   * dialog creates sections inline. Phase 4+ may wire this up if section-only
   * flows are needed.
   */
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("versions/:id/sections")
  createSection() {
    return { message: "暂未启用,Phase 4+ 打开时再补实现" };
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Get("template")
  async downloadTemplate(@Res() res: Response) {
    try {
      const buf = await this.imports.generateTemplate();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="course-outline-template.xlsx"',
      );
      res.send(buf);
    } catch (err) {
      res.status(500).json({ message: "模板生成失败" });
    }
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("versions/:id/import/dry-run")
  importDryRun(@Param("id") versionId: string, @Body() dto: OutlineImportDto) {
    return this.imports.dryRun(versionId, dto.fileKey);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Post("versions/:id/import/commit")
  importCommit(
    @Param("id") versionId: string,
    @Body() dto: OutlineImportDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.imports.commit(versionId, dto.fileKey, operator.id);
  }
}
