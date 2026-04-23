import { Module } from "@nestjs/common";
import { CourseOutlinesController } from "./course-outlines.controller";
import { CourseOutlinesService } from "./course-outlines.service";
import { CourseOutlineItemsService } from "./course-outline-items.service";
import { CourseOutlineImportService } from "./course-outline-import.service";

@Module({
  controllers: [CourseOutlinesController],
  providers: [CourseOutlinesService, CourseOutlineItemsService, CourseOutlineImportService],
  exports: [CourseOutlinesService],
})
export class CourseOutlinesModule {}
