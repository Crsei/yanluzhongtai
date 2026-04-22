// apps/api/src/modules/students/students.module.ts
import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { StudentsController } from "./students.controller";
import { StudentsImportService } from "./students-import.service";
import { StudentsService } from "./students.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentsImportService],
})
export class StudentsModule {}
