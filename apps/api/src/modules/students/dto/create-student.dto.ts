// apps/api/src/modules/students/dto/create-student.dto.ts
import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsDecimal,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  GENDER,
  type Gender,
  SERVICE_PLATFORM,
  type ServicePlatform,
  SERVICE_STATUS,
  type ServiceStatus,
  STUDENT_SOURCE,
  type StudentSource,
} from "../../../common/dictionaries";

export class CreateStudentDto {
  @IsString()
  @MaxLength(50)
  name!: string;

  @IsIn(GENDER)
  gender!: Gender;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  enrollmentYear!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  graduationYear!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  school?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  major?: string;

  @IsOptional()
  @IsString()
  counselorJobNo?: string;

  @IsOptional()
  @IsString()
  plannerJobNo?: string;

  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsIn(SERVICE_PLATFORM)
  servicePlatform!: ServicePlatform;

  @IsIn(STUDENT_SOURCE)
  source!: StudentSource;

  @IsIn(SERVICE_STATUS)
  serviceStatus!: ServiceStatus;

  @IsOptional()
  @IsDecimal({ decimal_digits: "0,2" })
  totalPublicCredits?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: "0,2" })
  totalPrivateCredits?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: "0,2" })
  remainingPublicCredits?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: "0,2" })
  remainingPrivateCredits?: string;

  @IsOptional()
  @IsString()
  serviceChecklistUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  serviceChecklistKeys?: string[];

  @IsOptional()
  @IsString()
  overallPlanUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  overallPlanText?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  policyKeys?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  policyText?: string;

  @IsOptional()
  @IsObject()
  detailNotes?: unknown;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  scheduleKeys?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  transcriptKeys?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  attachmentKeys?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;
}
