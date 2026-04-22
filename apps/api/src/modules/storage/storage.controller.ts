import { BadRequestException, Body, Controller, Get, Post, Query } from "@nestjs/common";
import { STORAGE_FOLDERS } from "../../common/dictionaries";
import { SignUploadDto } from "./dto/sign-upload.dto";
import { StorageService } from "./storage.service";

@Controller("storage")
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post("uploads/sign")
  async signUpload(@Body() dto: SignUploadDto) {
    return this.storage.signUpload(dto.folder, dto.filename, dto.contentType);
  }

  @Get("downloads/sign")
  async signDownload(@Query("key") key: string) {
    if (!key) {
      throw new BadRequestException("缺少 key");
    }
    const allowed = STORAGE_FOLDERS.some((folder) => key.startsWith(`${folder}/`));
    if (!allowed) {
      throw new BadRequestException("非法的对象 key");
    }
    return { url: await this.storage.signDownload(key) };
  }
}
