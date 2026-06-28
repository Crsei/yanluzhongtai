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
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { UserRole } from "@prisma/client";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { DeleteEmployeesDto } from "./dto/delete-employees.dto";
import { QueryEmployeesDto } from "./dto/query-employees.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import { EmployeesService } from "./employees.service";
import { EmployeesImportService } from "./employees-import.service";
import { ImportFileKeyDto } from "./dto/import.dto";

@Controller("employees")
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly imports: EmployeesImportService,
  ) {}

  @Get()
  list(@Query() query: QueryEmployeesDto) {
    return this.employees.list(query);
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
        'attachment; filename="employee-export.xlsx"',
      );
      res.send(buf);
    } catch (err) {
      res.status(500).json({ message: "导出失败" });
    }
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.employees.findOne(id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Post()
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() operator: AuthUser) {
    return this.employees.create(dto, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MEMBER)
  @Put(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.employees.update(id, dto, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete()
  @HttpCode(HttpStatus.OK)
  removeMany(@Body() dto: DeleteEmployeesDto, @CurrentUser() operator: AuthUser) {
    return this.employees.removeMany(dto.ids, operator.id);
  }

  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("id") id: string,
    @CurrentUser() operator: AuthUser,
  ) {
    await this.employees.remove(id, operator.id);
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
        'attachment; filename="employee-import-template.xlsx"',
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
