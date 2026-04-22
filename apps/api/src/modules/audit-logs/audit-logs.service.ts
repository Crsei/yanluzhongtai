import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import type { AuditRecordInput } from "./audit-logs.types";

function safeStringify(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function diffKeys(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (safeStringify(before[key]) !== safeStringify(after[key])) {
      changed.push(key);
    }
  }
  return changed;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput): Promise<void> {
    const { action, before, after, ...rest } = input;

    // Behaviour-level row for create / delete / updates without a diff payload
    if (action !== "update" || !before || !after) {
      await this.prisma.auditLog.create({
        data: {
          ...rest,
          action,
          fieldName: null,
          beforeValue: safeStringify(before ?? null),
          afterValue: safeStringify(after ?? null),
        },
      });
      return;
    }

    // Field-level rows for updates — one row per changed field
    const changed = diffKeys(before, after);
    // No fields actually changed — skip writing an empty audit row.
    if (changed.length === 0) return;
    await this.prisma.auditLog.createMany({
      data: changed.map((field) => ({
        ...rest,
        action,
        fieldName: field,
        beforeValue: safeStringify(before[field]),
        afterValue: safeStringify(after[field]),
      })),
    });
  }
}
