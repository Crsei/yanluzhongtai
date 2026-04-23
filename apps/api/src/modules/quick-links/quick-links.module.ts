import { Module } from "@nestjs/common";
import { QuickLinksController } from "./quick-links.controller";
import { QuickLinksService } from "./quick-links.service";

@Module({
  controllers: [QuickLinksController],
  providers: [QuickLinksService],
  exports: [QuickLinksService],
})
export class QuickLinksModule {}
