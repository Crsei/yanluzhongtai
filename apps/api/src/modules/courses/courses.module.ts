import { Module } from "@nestjs/common";
import { CoursesController } from "./courses.controller";
import { CoursesService } from "./courses.service";
import { CoursesImportService } from "./courses-import.service";

/**
 * AuditLogsModule, StorageModule and IdSequenceModule are all @Global() in
 * their own definitions, so they're available without re-importing here.
 */
@Module({
  controllers: [CoursesController],
  providers: [CoursesService, CoursesImportService],
  exports: [CoursesService],
})
export class CoursesModule {}
