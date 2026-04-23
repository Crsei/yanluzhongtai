import { Module } from "@nestjs/common";
import { AuditLogsModule } from "../audit-logs/audit-logs.module";
import { PayrollController } from "./payroll.controller";
import { PayrollManualRecordsService } from "./payroll-manual-records.service";
import { PayrollService } from "./payroll.service";
import { PayrollSettlementsService } from "./payroll-settlements.service";

@Module({
  imports: [AuditLogsModule],
  controllers: [PayrollController],
  providers: [
    PayrollService,
    PayrollSettlementsService,
    PayrollManualRecordsService,
  ],
})
export class PayrollModule {}
