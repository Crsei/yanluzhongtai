// apps/api/src/modules/students/students.controller.ts
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
import { CreateStudentDto } from "./dto/create-student.dto";
import { DeleteStudentsDto } from "./dto/delete-students.dto";
import { ImportFileKeyDto } from "./dto/import.dto";
import { QueryStudentsDto } from "./dto/query-students.dto";
import { UpdateStudentDto } from "./dto/update-student.dto";
import { StudentsService } from "./students.service";
import { StudentsImportService } from "./students-import.service";

@Controller("students")
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly imports: StudentsImportService,
  ) {}

  @Get()
  list(@Query() query: QueryStudentsDto) {
    return this.students.list(query);
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

      const today = new Date().toISOString().slice(0, 10);

      res.setHeader(

        "Content-Disposition",

        `attachment; filename="student-export-${today}.xlsx"`,

      );

      res.send(buf);

    } catch (err) {

      res.status(500).json({ message: "导出失败" });

    }

  }



  @Get(":id")

  findOne(@Param("id") id: string) {

    return this.students.findOne(id);

  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Post()
  create(@Body() dto: CreateStudentDto, @CurrentUser() operator: AuthUser) {
    return this.students.create(dto, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Put(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.students.update(id, dto, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete()
  @HttpCode(HttpStatus.OK)
  removeMany(@Body() dto: DeleteStudentsDto, @CurrentUser() operator: AuthUser) {
    return this.students.removeMany(dto.ids, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string, @CurrentUser() operator: AuthUser) {
    await this.students.remove(id, operator.id);
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
        'attachment; filename="student-import-template.xlsx"',
      );
      res.send(buf);
    } catch (err) {
      res.status(500).json({ message: "模板生成失败" });
    }
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Post("import/dry-run")
  importDryRun(@Body() dto: ImportFileKeyDto) {
    return this.imports.dryRun(dto.fileKey);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Post("import/commit")
  importCommit(
    @Body() dto: ImportFileKeyDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.imports.commit(dto.fileKey, operator.id);
  }
}
