import { Global, Module } from "@nestjs/common";
import { AuditLogsController } from "./audit-logs.controller";
import { AuditLogsRetentionService } from "./audit-logs-retention.service";
import { AuditLogsService } from "./audit-logs.service";

@Global()
@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService, AuditLogsRetentionService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
