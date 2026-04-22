import { Module } from "@nestjs/common";
import { EmployeesController } from "./employees.controller";
import { EmployeesImportService } from "./employees-import.service";
import { EmployeesService } from "./employees.service";

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeesImportService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
