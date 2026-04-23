import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";

const RETENTION_DAYS = 180;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class AuditLogsRetentionService {
  private readonly logger = new Logger(AuditLogsRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldLogs(): Promise<void> {
    try {
      const threshold = new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY);
      const result = await this.prisma.auditLog.deleteMany({
        where: { createdAt: { lt: threshold } },
      });
      this.logger.log(
        `Purged ${result.count} audit log rows older than ${threshold.toISOString()} (retention=${RETENTION_DAYS}d).`,
      );
    } catch (err) {
      this.logger.error("Audit log retention job failed", err as Error);
    }
  }
}
