import { PartialType } from "@nestjs/mapped-types";
import { CreateCourseDto } from "./create-course.dto";

/**
 * `outlineItemId` stays updatable so users can correct a wrong pick, but
 * `courseNo` is never in the DTO — it's managed entirely server-side.
 */
export class UpdateCourseDto extends PartialType(CreateCourseDto) {}
