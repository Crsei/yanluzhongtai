// apps/api/src/modules/students/dto/update-student.dto.ts
import { OmitType, PartialType } from "@nestjs/mapped-types";
import { CreateStudentDto } from "./create-student.dto";

/**
 * Inherit all CreateStudentDto shape checks, drop enrollmentYear (spec §9
 * locks it after creation), and make every remaining field optional.
 */
export class UpdateStudentDto extends PartialType(
  OmitType(CreateStudentDto, ["enrollmentYear"] as const),
) {}
