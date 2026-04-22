import { Global, Module } from "@nestjs/common";
import { IdSequenceService } from "./id-sequence.service";

@Global()
@Module({
  providers: [IdSequenceService],
  exports: [IdSequenceService],
})
export class IdSequenceModule {}
