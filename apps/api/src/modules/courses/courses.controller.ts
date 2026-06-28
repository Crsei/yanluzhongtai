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
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { CreateCourseDto } from "./dto/create-course.dto";
import { DeleteCoursesDto } from "./dto/delete-courses.dto";
import { CourseImportDto } from "./dto/import.dto";
import { QueryCoursesDto } from "./dto/query-courses.dto";
import { UpdateCourseDto } from "./dto/update-course.dto";
import { CoursesService } from "./courses.service";
import { CoursesImportService } from "./courses-import.service";

@Controller("courses")
export class CoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly imports: CoursesImportService,
  ) {}

  @Get()
  list(@Query() query: QueryCoursesDto) {
    return this.courses.list(query);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Get("import/template")
  async downloadTemplate(@Res() res: Response) {
    try {
      const buf = await this.imports.generateTemplate();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="course-import-template.xlsx"',
      );
      res.send(buf);
    } catch {
      res.status(500).json({ message: "模板生成失败" });
    }
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Post("import/dry-run")
  importDryRun(@Body() dto: CourseImportDto) {
    return this.imports.dryRun(dto.fileKey);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Post("import/commit")
  importCommit(@Body() dto: CourseImportDto, @CurrentUser() operator: AuthUser) {
    return this.imports.commit(dto.fileKey, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Get("export")
  async exportExcel(@Res() res: Response) {
    try {
      const buf = await this.imports.exportAll();
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="course-export.xlsx"',
      );
      res.send(buf);
    } catch {
      res.status(500).json({ message: "导出失败" });
    }
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.courses.findOne(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Post()
  create(@Body() dto: CreateCourseDto, @CurrentUser() operator: AuthUser) {
    return this.courses.create(dto, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Put(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.courses.update(id, dto, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete()
  @HttpCode(HttpStatus.OK)
  removeMany(@Body() dto: DeleteCoursesDto, @CurrentUser() operator: AuthUser) {
    return this.courses.removeMany(dto.ids, operator.id);
  }
}
