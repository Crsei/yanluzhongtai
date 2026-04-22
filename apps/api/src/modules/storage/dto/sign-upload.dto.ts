import { IsIn, IsString, MaxLength, MinLength } from "class-validator";
import { STORAGE_FOLDERS, StorageFolder } from "../../../common/dictionaries";

export class SignUploadDto {
  @IsIn(STORAGE_FOLDERS as unknown as string[])
  folder!: StorageFolder;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  filename!: string;

  /**
   * Advisory only — the presigned PUT URL does not constrain the actual
   * Content-Type header sent by the browser. Validate enforced types via
   * MinIO bucket policy if strict typing is required.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  contentType!: string;
}
