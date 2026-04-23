import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Built-in kinds are narrow strings; callers that need composite scopes
 * (e.g. course numbers scoped by TT+KK+YY) can pass any string — the
 * IdSequence table only enforces uniqueness on (kind, year).
 */
export type IdSequenceKind =
  | "employee"
  | "student"
  | `course:${string}`;

@Injectable()
export class IdSequenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** 单次分配，返回 lastSeq 对应的下一个序号（即递增后的那个值） */
  async allocate(kind: IdSequenceKind, year: number): Promise<number> {
    const [first] = await this.allocateBatch(kind, year, 1);
    return first;
  }

  /** 批量分配，返回 N 个连续序号；count<1 时返回空数组 */
  async allocateBatch(
    kind: IdSequenceKind,
    year: number,
    count: number,
  ): Promise<number[]> {
    if (count < 1) return [];
    const rows = await this.prisma.$queryRaw<{ lastSeq: number }[]>(
      Prisma.sql`
        INSERT INTO "IdSequence" ("kind", "year", "lastSeq", "updatedAt")
        VALUES (${kind}, ${year}, ${count}, now())
        ON CONFLICT ("kind", "year")
        DO UPDATE SET "lastSeq" = "IdSequence"."lastSeq" + ${count}, "updatedAt" = now()
        RETURNING "lastSeq"
      `,
    );
    // Prisma `$queryRaw` can hand back BigInt for integer columns depending on
    // the driver; coerce to a plain number so downstream arithmetic stays safe.
    const lastSeq = Number(rows[0].lastSeq);
    const start = lastSeq - count + 1;
    return Array.from({ length: count }, (_, i) => start + i);
  }

  /** 工号格式化：YY (2位) + NNN (3位) */
  static formatEmployeeJobNo(year: number, seq: number): string {
    if (seq < 1 || seq > 999) {
      throw new Error(`员工工号序号 ${seq} 超出 1-999 范围`);
    }
    const yy = String(year).slice(-2).padStart(2, "0");
    return `${yy}${String(seq).padStart(3, "0")}`;
  }
}
