import { IsIn, IsString, MaxLength } from "class-validator";
import { STORAGE_FOLDERS, StorageFolder } from "../../../common/dictionaries";

export class SignUploadDto {
  @IsIn(STORAGE_FOLDERS as unknown as string[])
  folder!: StorageFolder;

  @IsString()
  @MaxLength(200)
  filename!: string;

  @IsString()
  @MaxLength(200)
  contentType!: string;
}
