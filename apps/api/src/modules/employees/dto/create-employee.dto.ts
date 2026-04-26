import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from "class-validator";
import {
  EMPLOYEE_SERVING_FOR,
  EMPLOYEE_SOURCE,
  EMPLOYMENT_STATUS,
  EmployeeServingFor,
  EmployeeSource,
  EmploymentStatus,
  GENDER,
  Gender,
} from "../../../common/dictionaries";

export class CreateEmployeeDto {
  @IsString() @MaxLength(50)
  name!: string;

  @IsIn(GENDER as unknown as string[])
  gender!: Gender;

  @IsIn(EMPLOYMENT_STATUS as unknown as string[])
  employmentStatus!: EmploymentStatus;

  @IsOptional() @IsString() @MaxLength(100)
  jobTitle?: string;

  @IsOptional() @IsDateString()
  hireDate?: string;

  @IsOptional() @IsString() @Matches(/^1[3-9]\d{9}$/, { message: "phone must be a valid Chinese mobile number" })
  phone?: string;

  @IsOptional() @IsString() @MaxLength(64)
  bankCardNo?: string;

  @IsOptional() @IsString() @MaxLength(64)
  bankName?: string;

  @IsOptional() @IsIn(EMPLOYEE_SOURCE as unknown as string[])
  source?: EmployeeSource;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(EMPLOYEE_SERVING_FOR as unknown as string[], { each: true })
  servingFor?: EmployeeServingFor[];

  @IsOptional() @IsString() @MaxLength(5000)
  resumeText?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  attachmentKeys?: string[];
}
