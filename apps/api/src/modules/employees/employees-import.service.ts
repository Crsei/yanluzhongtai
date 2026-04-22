import { Injectable, Logger } from "@nestjs/common";
import { EmploymentStatus, Prisma } from "@prisma/client";
import * as ExcelJS from "exceljs";
import {
  EMPLOYEE_SERVING_FOR,
  EMPLOYEE_SOURCE,
  EMPLOYMENT_STATUS,
  EMPLOYMENT_STATUS_LABELS,
  EmployeeServingFor,
  EmployeeSource,
  GENDER,
} from "../../common/dictionaries";
import { IdSequenceService } from "../../common/id-sequence/id-sequence.service";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AuditLogsService } from "../audit-logs/audit-logs.service";
import {
  ImportCommitResult,
  ImportReport,
  ImportRowError,
} from "./employees.types";

const COLUMNS = [
  "name", "gender", "employmentStatus", "jobTitle", "hireDate",
  "phone", "bankCardNo", "bankName", "source", "servingFor", "resumeText",
] as const;

const COLUMN_HEADERS: Record<(typeof COLUMNS)[number], string> = {
  name: "姓名",
  gender: "性别",
  employmentStatus: "雇佣状态(FULL_TIME/PART_TIME/RESIGNED)",
  jobTitle: "具体工作职责",
  hireDate: "入职日期(YYYY-MM-DD)",
  phone: "电话",
  bankCardNo: "银行卡号",
  bankName: "开户行",
  source: "员工来源",
  servingFor: "正服务于(分号分隔)",
  resumeText: "简历(文字)",
};

type ParsedRow = {
  rowNumber: number;
  raw: Partial<Record<(typeof COLUMNS)[number], string>>;
};

type ValidatedRow = {
  rowNumber: number;
  hireYear: number;
  data: Prisma.EmployeeCreateManyInput;
};

@Injectable()
export class EmployeesImportService {
  private readonly logger = new Logger(EmployeesImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly idSequence: IdSequenceService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  /** Generate the .xlsx template; returned as a Buffer so the controller can stream it. */
  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("员工导入");
    sheet.columns = COLUMNS.map((key) => ({
      header: COLUMN_HEADERS[key],
      key,
      width: 24,
    }));

    // One example row to make the format obvious
    sheet.addRow({
      name: "张三",
      gender: "男",
      employmentStatus: "FULL_TIME",
      jobTitle: "考研规划师",
      hireDate: "2026-03-01",
      phone: "13800001111",
      bankCardNo: "",
      bankName: "",
      source: "研录",
      servingFor: "研录考研;内部管理",
      resumeText: "",
    });

    // Headers in bold + freeze first row
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async dryRun(fileKey: string): Promise<ImportReport> {
    const buffer = await this.storage.readObject(fileKey);
    const { rows, errors: parseErrors } = await this.parse(buffer);
    const validated = this.validate(rows);
    const errors = [...parseErrors, ...validated.errors];
    return {
      totalRows: rows.length,
      validRows: validated.rows.length,
      errors,
    };
  }

  async commit(fileKey: string, operatorId: string): Promise<ImportCommitResult> {
    const buffer = await this.storage.readObject(fileKey);
    const { rows, errors: parseErrors } = await this.parse(buffer);
    const validated = this.validate(rows);
    const errors = [...parseErrors, ...validated.errors];
    if (errors.length > 0) {
      // Refuse the whole batch on any error — the UI should never call commit when errors exist
      return { created: 0, errors };
    }

    // Group by year so we ask IdSequence only once per year
    const groupedByYear = new Map<number, ValidatedRow[]>();
    for (const row of validated.rows) {
      const list = groupedByYear.get(row.hireYear) ?? [];
      list.push(row);
      groupedByYear.set(row.hireYear, list);
    }

    // Allocate sequence numbers, then build CreateMany payload preserving sheet order.
    //
    // NOTE: allocation runs OUTSIDE the createMany transaction by design. If the
    // transaction rolls back, the allocated jobNos are "burned" — IdSequence.lastSeq
    // already advanced. This is the intended trade-off for spec §4.2: 工号删除不回收.
    // The alternative (allocate-inside-transaction) would either require Prisma raw
    // SQL inside $transaction's interactive callback (no perf gain) or risk concurrent
    // imports racing for the same lastSeq if we held a row lock without it.
    const idMap = new Map<ValidatedRow, string>();
    for (const [year, group] of groupedByYear) {
      const seqs = await this.idSequence.allocateBatch("employee", year, group.length);
      group.forEach((row, idx) => {
        idMap.set(row, IdSequenceService.formatEmployeeJobNo(year, seqs[idx]));
      });
    }

    const data = validated.rows.map((row) => ({
      ...row.data,
      jobNo: idMap.get(row)!,
    }));

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.createMany({ data });
      // Re-fetch to obtain ids for audit logs
      const inserted = await tx.employee.findMany({
        where: { jobNo: { in: data.map((d) => d.jobNo!) } },
      });
      for (const emp of inserted) {
        await tx.auditLog.create({
          data: {
            operatorId,
            action: "create",
            targetType: "employee",
            targetId: emp.id,
            fieldName: null,
            beforeValue: null,
            afterValue: JSON.stringify(emp),
          },
        });
      }
    });

    return { created: data.length, errors: [] };
  }

  // ------------------------------- internals ------------------------------- //

  private async parse(buffer: Buffer): Promise<{ rows: ParsedRow[]; errors: ImportRowError[] }> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return { rows: [], errors: [{ row: 0, field: "header", message: "未找到任何工作表" }] };
    }

    // Match headers to expected COLUMNS
    const headerRow = sheet.getRow(1);
    const headerMap = new Map<number, (typeof COLUMNS)[number]>();
    headerRow.eachCell((cell, colNumber) => {
      const headerText = String(cell.value ?? "").trim();
      const matched = COLUMNS.find((key) => COLUMN_HEADERS[key] === headerText);
      if (matched) headerMap.set(colNumber, matched);
    });
    const missing = COLUMNS.filter((key) => ![...headerMap.values()].includes(key));
    if (missing.length > 0) {
      return {
        rows: [],
        errors: [
          {
            row: 1,
            field: "header",
            message: `缺少列：${missing.map((k) => COLUMN_HEADERS[k]).join("、")}`,
          },
        ],
      };
    }

    const rows: ParsedRow[] = [];
    for (let r = 2; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const raw: ParsedRow["raw"] = {};
      let hasAny = false;
      headerMap.forEach((key, colNumber) => {
        const value = row.getCell(colNumber).value;
        if (value !== null && value !== undefined && String(value).trim() !== "") {
          raw[key] = String(value).trim();
          hasAny = true;
        }
      });
      if (hasAny) rows.push({ rowNumber: r, raw });
    }
    return { rows, errors: [] };
  }

  private validate(rows: ParsedRow[]): { rows: ValidatedRow[]; errors: ImportRowError[] } {
    const validated: ValidatedRow[] = [];
    const errors: ImportRowError[] = [];

    for (const { rowNumber, raw } of rows) {
      const rowErrors: ImportRowError[] = [];

      const required: Array<[keyof typeof raw, string]> = [
        ["name", "姓名"],
        ["gender", "性别"],
        ["employmentStatus", "雇佣状态"],
        ["jobTitle", "具体工作职责"],
      ];
      for (const [key, label] of required) {
        if (!raw[key]) rowErrors.push({ row: rowNumber, field: label, message: "必填" });
      }

      if (raw.gender && !(GENDER as readonly string[]).includes(raw.gender)) {
        rowErrors.push({ row: rowNumber, field: "性别", message: `非法值，仅支持 ${GENDER.join("/")}` });
      }
      if (
        raw.employmentStatus &&
        !(EMPLOYMENT_STATUS as readonly string[]).includes(raw.employmentStatus)
      ) {
        rowErrors.push({
          row: rowNumber,
          field: "雇佣状态",
          message: `非法值，仅支持 ${EMPLOYMENT_STATUS.join("/")}（即 ${Object.values(EMPLOYMENT_STATUS_LABELS).join("/")}）`,
        });
      }
      if (raw.source && !(EMPLOYEE_SOURCE as readonly string[]).includes(raw.source)) {
        rowErrors.push({ row: rowNumber, field: "员工来源", message: `非法值，仅支持 ${EMPLOYEE_SOURCE.join("/")}` });
      }
      if (raw.phone && !/^1[3-9]\d{9}$/.test(raw.phone)) {
        rowErrors.push({ row: rowNumber, field: "电话", message: "格式不正确" });
      }

      let hireDate: Date | null = null;
      if (raw.hireDate) {
        const parsed = new Date(raw.hireDate);
        if (Number.isNaN(parsed.getTime())) {
          rowErrors.push({ row: rowNumber, field: "入职日期", message: "无法解析为日期" });
        } else {
          hireDate = parsed;
        }
      }

      let servingFor: EmployeeServingFor[] = [];
      if (raw.servingFor) {
        const items = raw.servingFor.split(/[;；,，]/).map((s) => s.trim()).filter(Boolean);
        for (const item of items) {
          if (!(EMPLOYEE_SERVING_FOR as readonly string[]).includes(item)) {
            rowErrors.push({
              row: rowNumber,
              field: "正服务于",
              message: `非法值 "${item}"，仅支持 ${EMPLOYEE_SERVING_FOR.join("/")}`,
            });
          }
        }
        servingFor = items as EmployeeServingFor[];
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        continue;
      }

      // hireDate is optional per CreateEmployeeDto; matches EmployeesService.create
      // fallback — when absent, the server year is used for jobNo allocation.
      const hireYear = hireDate ? hireDate.getFullYear() : new Date().getFullYear();
      validated.push({
        rowNumber,
        hireYear,
        data: {
          jobNo: "PLACEHOLDER", // overwritten in commit() after IdSequence allocation
          name: raw.name!,
          gender: raw.gender!,
          employmentStatus: raw.employmentStatus as EmploymentStatus,
          jobTitle: raw.jobTitle!,
          hireDate: hireDate ?? undefined,
          phone: raw.phone ?? null,
          bankCardNo: raw.bankCardNo ?? null,
          bankName: raw.bankName ?? null,
          source: (raw.source as EmployeeSource | undefined) ?? null,
          servingFor,
          resumeText: raw.resumeText ?? null,
          attachmentKeys: [],
        },
      });
    }

    return { rows: validated, errors };
  }
}
