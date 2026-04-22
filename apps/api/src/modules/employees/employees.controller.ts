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
} from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import type { AuthUser } from "../auth/auth.types";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { QueryEmployeesDto } from "./dto/query-employees.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import { EmployeesService } from "./employees.service";

@Controller("employees")
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  list(@Query() query: QueryEmployeesDto) {
    return this.employees.list(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.employees.findOne(id);
  }

  @Roles("SUPER_ADMIN", "ADMIN")
  @Post()
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() operator: AuthUser) {
    return this.employees.create(dto, operator.id);
  }

  @Roles("SUPER_ADMIN", "ADMIN")
  @Put(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() operator: AuthUser,
  ) {
    return this.employees.update(id, dto, operator.id);
  }

  @Roles("SUPER_ADMIN", "ADMIN")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("id") id: string,
    @CurrentUser() operator: AuthUser,
  ) {
    await this.employees.remove(id, operator.id);
  }
}
