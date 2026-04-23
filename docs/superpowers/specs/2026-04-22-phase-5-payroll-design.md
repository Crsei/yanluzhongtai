# Phase 5 — 薪酬管理 · 实现设计

> 对应需求:[docs/spec/06-Phase5-薪酬管理.md](../../spec/06-Phase5-薪酬管理.md)
> 上游:[Phase 1A · 员工模块](./2026-04-22-phase-1a-employees-design.md) / [Phase 4A · 课程核心闭环](./2026-04-22-phase-4a-courses-core-design.md)
> 下游预留:Phase 6(数据表 / SOP / 关于页日志入口)/ Phase 7(移动端适配)

## 1. 范围与决策摘要

Phase 5 聚焦薪酬列表聚合、结算事件留痕、手动劳务/扣除补录三件事。单轮落地,不拆子阶段。spec 明确 `/payroll` 只有 `SUPER_ADMIN` / `ADMIN` 可访问,Phase 0 的 `RequireRole` 已就位,Phase 5 只替换当前 `ModulePage` 占位。

**硬性依赖**:
- Phase 1A(`Employee` 表、姓名/工号查询、`EmployeePicker` 跨模块组件)
- Phase 4A(`Course.actualTeacherJobNo` / `plannedAt` / `durationMinutes` 数据齐全、`computeCreditHours(durationMinutes)` 纯函数、`TEACHING_TYPE_BUCKET` 字典)

| # | 决策 | 选择 | 备注 |
| --- | --- | --- | --- |
| Q1 | 列表行语义 | 独立实体:auto 行 + manual 行分别渲染 | 同 (老师, 年月) 可能同时有 1 auto + N manual 行 |
| Q2 | 手动记录 schema | 新增独立 `PayrollManualRecord` model | 与 `PayrollSettlement` 职责分离 |
| Q3 | 已授课时数据源 | 只计 `已完成` 课程(`durationMinutes` 有值,`creditHours` 有值) | spec §9.3 "已授" 字面 |
| Q4 | 所属年月归属 | `plannedAt` 的 `YYYYMM` | `plannedAt` 为空的 Course 不归任何月 |
| Q5 | 单位课时费每月唯一 (§9.2) | service 层校验:同 (teacher, period) 所有 settlement 的 hourlyRate 必须一致 | 新 settlement 若 rate ≠ 历史,拒绝 400 |
| Q6 | 时间范围筛选 | 本月 / 上月 / 自定义(`DatePicker.RangePicker picker="month"`) | 自定义区间拆成 `YYYYMM` 集合后并集聚合 |
| Q7 | "仅查看薪资未结清"范围 | auto 行 `subtotalPayable > SUM(subtotalPaid)`;manual 行视为始终"未结清"一并保留 | manual 不走结算流程,过滤时保留保证用户能看到补录 |
| Q8 | 自动行首次结算的 rate 来源 | 若无历史 settlement → 弹窗 rate 输入为空需用户填;有历史 → 带出最近值(spec §9.2) | 空值提交 400 |
| Q9 | "汇总快照表"要不要 | 不要,每次请求实时聚合 | 薪酬页访问频率低,不需缓存;数据一致性最优 |
| Q10 | 手动记录的编辑 | 不提供,只支持"添加 / 删除" | spec §2 / §6 只列"手动添加记录"和"删除记录" |
| Q11 | "查看课程" 弹窗列 | `课程编号 / 课程名称 / 计划时间 / 课时 / 学生数 / 授课方式` | 限定当前筛选时间范围内该老师的已完成课程 |
| Q12 | 列表页搜索 | 老师姓名或工号 ILIKE 命中,命中的 (teacher, period) 全部保留 | 搜索不过滤 period,避免"搜到老师但看不到他的其他月份数据" |

---

## 2. 高层架构

```
┌── apps/web ─────────────────────────────────────┐    ┌── apps/api ─────────────────────────────────┐
│ features/payroll/                                 │    │ modules/payroll/                               │
│   PayrollListPage.tsx                             │    │   payroll.module.ts                            │
│     └─ 时间范围 RangePicker + 本月/上月快捷按钮    │    │   payroll.controller.ts                        │
│     └─ 搜索框 + 仅未结清 Switch                    │    │   payroll.service.ts        (聚合查询:auto+manual)│
│   SettleDialog.tsx (spec §7.2)                    │    │   payroll-settlements.service.ts (结算事件 CRUD)│
│   AddManualRecordDialog.tsx (spec §8)             │────┤   payroll-manual-records.service.ts            │
│   DeleteManualRecordConfirm.tsx                   │    │   payroll.types.ts                             │
│   ViewCoursesDialog.tsx (spec §7.1)               │    │   dto/{query,settle,create-manual}.dto.ts     │
│   hooks/usePayroll.ts / usePayrollMutations.ts    │    │                                                 │
│ services/payroll.ts                               │    │ common/payroll/                               │
│                                                   │    │   period.ts (formatPeriod / parsePeriod /      │
│ components/EmployeePicker.tsx (Phase 2 既有)     │    │              periodRangeToList / currentMonth)   │
│                                                   │    │                                                 │
│ router.tsx: /payroll → PayrollListPage            │    │ prisma/schema.prisma:                           │
│  (已包 RequireRole + RequireAuth,仅换组件)       │    │   + model PayrollManualRecord                   │
│                                                   │    │   ~ PayrollSettlement 不变(Phase 5 首次写数据) │
│                                                   │    │   + PayrollSettlement @@index([employeeJobNo,  │
│                                                   │    │                                 settlementPeriod])│
└───────────────────────────────────────────────────┘    └──────────────────────────────────────────────┘
```

**典型时序**:

```
列表查询:
  web  用户进入 /payroll
  web  默认 range = 本月 → useSearchParams ?from=202604&to=202604
  web  usePayroll({ from, to, keyword, unpaidOnly }) → api.get('/payroll?...')
  api  PayrollController.list → PayrollService.list:
       1. 解析 period range (from, to) → periods: string[]
       2. 查 Course WHERE actualTeacherJobNo IS NOT NULL AND durationMinutes IS NOT NULL
              AND plannedAt IN (periodStart..periodEnd)
          → GROUP BY (actualTeacherJobNo, YYYYMM(plannedAt)) → 每组 SUM(creditHours) = deliveredHours
       3. 查 PayrollSettlement WHERE (employeeJobNo, settlementPeriod) IN 上述聚合键
          → 聚合每组 lastHourlyRate / sumPaid
       4. 查 PayrollManualRecord WHERE settlementPeriod IN periods
          → 与 auto 行分开归类
       5. 批量 join Employee 取 name;按 keyword 过滤(姓名/工号 ILIKE);按 name pinyin 排序
       6. 若 unpaidOnly:auto 行 subtotalPayable > sumPaid 才保留;manual 行始终保留
       7. merge 成 List<PayrollRow>:每 auto 行 + 同 (teacher, period) 的所有 manual 行按 createdAt ASC 交织
  web  PayrollListPage 渲染表格;操作列根据 row.kind 分叉

查看课程:
  web  auto 行"查看课程"→ ViewCoursesDialog({ teacherJobNo, period })
  web  api.get('/payroll/courses?teacherJobNo=...&period=...')
  api  service.listCoursesForTeacherPeriod:
       1. 查 Course WHERE actualTeacherJobNo = ... AND plannedAt BETWEEN periodStart AND periodEnd
          AND durationMinutes IS NOT NULL(已完成)
       2. enrichWithDerivedFields(复用 4A 既有)
  web  表格展示 6 列

结算(spec §7.2):
  web  auto 行"结算"→ SettleDialog({ teacherJobNo, teacherName, period })
  web  对话框内查 GET /payroll/row/:teacherJobNo/:period 取 { payable, alreadyPaid, lastHourlyRate, deliveredHours }
  web  显示 老师名 / 应结算总额 / 此前已结算 / 本次金额输入(max = payable - alreadyPaid)
       若 lastHourlyRate 为空(首次结算),弹窗额外要求用户输入 "单位课时费"
  web  提交 → api.post('/payroll/settlements', { teacherJobNo, period, hourlyRate, paidAmount, extraLabor, extraDeduction })
  api  payroll-settlements.service.create:
       1. 校验:
          - 重新聚合 deliveredHours(防 TOCTOU)
          - 若历史 settlement 存在 → newRate === lastRate,否则 400 "该月单位课时费已为 X,不得更改"
          - subtotalPayable = lastHourlyRate × deliveredHours + extraLabor - extraDeduction
          - paidAmount ≤ subtotalPayable - sum(alreadyPaid);否则 400
       2. prisma.payrollSettlement.create({ ...snapshot, subtotalPaid: paidAmount })
       3. auditLog.record({ action: 'create', targetType: 'payroll_settlement', targetId })

手动添加记录(spec §8):
  web  右上"手动添加记录" → 二次确认 → AddManualRecordDialog
  web  字段:员工 EmployeePicker / 所属年月 DatePicker picker="month" / 其他劳务 / 其他扣除
  web  本地校验 extraLabor > 0 AND extraDeduction !== extraLabor
  web  提交 → api.post('/payroll/manual-records', { employeeJobNo, period, extraLabor, extraDeduction })
  api  payroll-manual-records.service.create:
       1. 校验 employeeJobNo 存在(不强制未离职;手动补录可能面向离职老师)
       2. 校验 period 格式 + DTO 数值
       3. prisma.payrollManualRecord.create
       4. auditLog.record({ action: 'create', targetType: 'payroll_manual_record', ... })

删除手动记录(manual 行):
  web  manual 行"删除记录" → DeleteManualRecordConfirm
  web  确认 → api.delete('/payroll/manual-records/:id')
  api  service.remove:
       1. 取 before 快照
       2. prisma.payrollManualRecord.delete
       3. auditLog.record({ action: 'delete', targetType: 'payroll_manual_record', before })
```

---

## 3. Prisma schema 增量

```prisma
model PayrollSettlement {
  id                String   @id @default(cuid())
  operatorPhone     String
  settledAt         DateTime @default(now())
  employeeJobNo     String
  settlementPeriod  String                               // YYYYMM
  hourlyRate        Decimal  @db.Decimal(10, 2)
  deliveredHours    Decimal  @db.Decimal(10, 2)
  extraLabor        Decimal  @db.Decimal(10, 2)
  extraDeduction    Decimal  @db.Decimal(10, 2)
  subtotalPayable   Decimal  @db.Decimal(10, 2)
  subtotalPaid      Decimal  @db.Decimal(10, 2)

  @@index([employeeJobNo, settlementPeriod])             // ← 新增:聚合查询主索引
}

model PayrollManualRecord {                               // ← 全新 model
  id                String   @id @default(cuid())
  employeeJobNo     String
  settlementPeriod  String                               // YYYYMM
  extraLabor        Decimal  @db.Decimal(10, 2)
  extraDeduction    Decimal  @db.Decimal(10, 2)
  operatorPhone     String
  createdAt         DateTime @default(now())

  @@index([employeeJobNo, settlementPeriod])
  @@index([settlementPeriod])                            // 全局按月扫描(自定义区间查询用)
}
```

**变更说明**:

- `PayrollManualRecord` 是全新表,`db push` 零风险(无历史数据)。
- `PayrollSettlement` 保持字段不变(Phase 5 首次真正写数据);仅补 `@@index([employeeJobNo, settlementPeriod])` 以提速聚合查询。
- 两张表都**不**硬 FK 到 `Employee.jobNo`(与 Phase 1/2 `counselorJobNo` / Phase 4 `actualTeacherJobNo` 同策略,保持松 FK);Phase 1A `EmployeesService.remove` 已阻止存在 `payrollSettlement` 引用时删除员工,Phase 5 沿用。同样需要把 manual record 加入该保护清单(见 §5.7)。

---

## 4. 领域约定

### 4.1 `common/payroll/period.ts`

```ts
/** YYYYMM 字符串 <-> (year, month) 互转 */
export function formatPeriod(year: number, month: number): string {
  if (month < 1 || month > 12) throw new Error(`月份非法: ${month}`)
  return `${year}${String(month).padStart(2, '0')}`
}

export function parsePeriod(period: string): { year: number; month: number } | null {
  if (!/^\d{6}$/.test(period)) return null
  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(4, 6))
  if (year < 1900 || year > 2100 || month < 1 || month > 12) return null
  return { year, month }
}

/** "本月" / "上月" 快捷 */
export function currentMonthPeriod(now: Date = new Date()): string {
  return formatPeriod(now.getFullYear(), now.getMonth() + 1)
}

export function previousMonthPeriod(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return formatPeriod(d.getFullYear(), d.getMonth() + 1)
}

/** 区间 (fromPeriod, toPeriod) 展开为连续 YYYYMM 列表 */
export function periodRangeToList(from: string, to: string): string[] {
  const a = parsePeriod(from), b = parsePeriod(to)
  if (!a || !b) throw new Error(`period 范围格式非法: ${from}-${to}`)
  const result: string[] = []
  let y = a.year, m = a.month
  while (y < b.year || (y === b.year && m <= b.month)) {
    result.push(formatPeriod(y, m))
    m++
    if (m > 12) { y++; m = 1 }
    if (result.length > 36) throw new Error('period 区间超过 36 个月,拒绝')  // 防爆
  }
  return result
}

/** period 对应月份的 [start, nextMonthStart) 时间窗 */
export function periodBounds(period: string): { start: Date; end: Date } {
  const { year, month } = parsePeriod(period)!
  const start = new Date(Date.UTC(year, month - 1, 1))
  const end = new Date(Date.UTC(year, month, 1))
  return { start, end }
}
```

**时区注意**:`plannedAt` 是 DateTime,DB 中以 UTC 存。用户看到的"2026-04" 通常按本地时间理解;`periodBounds` 取 UTC 的月起止作近似,项目整体用北京时间部署(`TZ=Asia/Shanghai`)时 UTC vs CST 偏 8 小时,边缘凌晨课程可能错归。**4A / 4B 约定 `plannedAt` 以 UTC 存储但前端按本地展示**,Phase 5 沿用该约定,不做额外调整。若运营发现跨月错归,后续升级成 `toZonedTime(plannedAt, 'Asia/Shanghai')` 再取年月。

### 4.2 行类型 `payroll.types.ts`

```ts
export type PayrollAutoRow = {
  kind: 'auto'
  employeeJobNo: string
  employeeName: string
  period: string                // YYYYMM
  hourlyRate: number | null     // 无历史结算时 null
  deliveredHours: number        // 实时聚合
  totalCourseFee: number        // = hourlyRate × deliveredHours;null rate 时 null
  extraLabor: number            // auto 行固定 0(§1 Q1 决策)
  extraDeduction: number        // auto 行固定 0
  subtotalPayable: number | null  // rate null 时 null
  subtotalPaid: number          // SUM(settlement.subtotalPaid)
  settlementIds: string[]       // 结算事件 id 列表(历史)
}

export type PayrollManualRow = {
  kind: 'manual'
  id: string                    // PayrollManualRecord.id
  employeeJobNo: string
  employeeName: string
  period: string
  hourlyRate: null              // manual 无课时费概念
  deliveredHours: 0
  totalCourseFee: 0
  extraLabor: number
  extraDeduction: number
  subtotalPayable: number       // = extraLabor - extraDeduction
  subtotalPaid: 0
  createdAt: string
}

export type PayrollRow = PayrollAutoRow | PayrollManualRow

export type PayrollListResponse = {
  items: PayrollRow[]
  total: number                 // items.length(不分页,见 §4.3)
}
```

### 4.3 分页策略

spec §4 / §10 没提分页,页面筛选范围最大 36 个月 × N 老师,预计单次查询 rows ≤ 数百行;**Phase 5 不分页**,一次性返回全部 `items`,前端本地 `<Table pagination={{ defaultPageSize: 50 }}>` 做展示分页。若后续规模增长,升级 cursor 分页。

### 4.4 "单位课时费每月唯一" (§9.2) 的校验语义

结算提交时,service 查该 (teacher, period) 已有 `PayrollSettlement.hourlyRate` 集合:
- 集合为空(首次结算)→ DTO 的 `hourlyRate` 必须显式传值(大于 0)
- 集合非空 → 新传入 `hourlyRate` 必须严格等于 `集合[0].hourlyRate`(历史值全部相等是 service 侧的不变式;不可能出现"历史多值",因为每次结算都走这同一段校验)
- 不等 → `400 BadRequest: 该月单位课时费已为 X 元,不得更改`

前端 SettleDialog 从 `lastHourlyRate` 带出后字段锁定只读;显示"首次结算可输入"时才可编辑。

### 4.5 `已授课时` 聚合的精确 Prisma 查询

```ts
// 一次性算出 range 内所有 (teacher, period) 的 deliveredHours
const courses = await this.prisma.course.findMany({
  where: {
    actualTeacherJobNo: { not: null },
    durationMinutes:    { not: null },
    plannedAt: {
      gte: periodBounds(periods[0]).start,
      lt:  periodBounds(periods[periods.length - 1]).end,
    },
  },
  select: { actualTeacherJobNo: true, plannedAt: true, durationMinutes: true },
})

// JS 端 GROUP BY (jobNo, YYYYMM):
const autoMap = new Map<string, { jobNo: string; period: string; hours: number }>()
for (const c of courses) {
  const y = c.plannedAt!.getUTCFullYear(), m = c.plannedAt!.getUTCMonth() + 1
  const p = formatPeriod(y, m)
  if (!periods.includes(p)) continue  // 防边界 off-by-one
  const key = `${c.actualTeacherJobNo}::${p}`
  const row = autoMap.get(key) ?? { jobNo: c.actualTeacherJobNo!, period: p, hours: 0 }
  row.hours += computeCreditHours(c.durationMinutes)!
  autoMap.set(key, row)
}
```

规模:一个月几百节课,30 个月上限下 SQL 返回 ≤ 数千行,JS GROUP BY 常数时间可忽略。若未来真的过万条,升级成 `prisma.$queryRaw` 做 `GROUP BY date_trunc('month', "plannedAt"), "actualTeacherJobNo"` + `SUM(duration_minutes)/45.0`。

### 4.6 前端排序稳定性

- 一级:按 `employeeName` 的中文拼音升序(利用 `String.prototype.localeCompare(other, 'zh-Hans-CN', { sensitivity: 'base' })`)
- 二级:同姓名下,auto 行在前,manual 行按 `createdAt ASC`
- 后端查询已按 name ASC 预排序(`Intl.Collator` 在 Node 下可用);前端如需二次稳排,用同一 locale

---

## 5. 后端详设 (apps/api)

### 5.1 依赖增补

无新增三方包。

### 5.2 `dto/*`

```ts
// query-payroll.dto.ts
export class QueryPayrollDto {
  @IsString() @Matches(/^\d{6}$/) from!: string      // 起始 YYYYMM
  @IsString() @Matches(/^\d{6}$/) to!: string        // 结束 YYYYMM(包含)
  @IsOptional() @IsString() @MaxLength(80) keyword?: string
  @IsOptional() @IsBoolean() unpaidOnly?: boolean
}

// settle-payroll.dto.ts
export class SettlePayrollDto {
  @IsString() @Matches(/^\d{5}$/) employeeJobNo!: string      // YYNNN 员工工号
  @IsString() @Matches(/^\d{6}$/) settlementPeriod!: string
  @IsNumberString() hourlyRate!: string              // Decimal 串,必填
  @IsNumberString() paidAmount!: string              // 本次结算金额
  @IsNumberString() extraLabor!: string              // 允许 0,允许负(结算时的一次性调整)
  @IsNumberString() extraDeduction!: string
}

// create-manual-record.dto.ts
export class CreateManualRecordDto {
  @IsString() @Matches(/^\d{5}$/) employeeJobNo!: string
  @IsString() @Matches(/^\d{6}$/) settlementPeriod!: string
  @IsNumberString() extraLabor!: string              // 前端校验 > 0;后端重校
  @IsNumberString() extraDeduction!: string          // extraDeduction !== extraLabor
}
```

**service 侧补校验**(DTO 装饰器表达力不足时在 service 做):
- `settle`:`hourlyRate > 0`,`paidAmount > 0`,`paidAmount ≤ payable - alreadyPaid`
- `create-manual`:`extraLabor > 0`,`extraLabor !== extraDeduction`(spec §8)

### 5.3 `payroll.service.ts` 主聚合查询

```ts
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settlements: PayrollSettlementsService,
    private readonly manuals: PayrollManualRecordsService,
  ) {}

  async list(query: QueryPayrollDto): Promise<PayrollListResponse> {
    const periods = periodRangeToList(query.from, query.to)
    const [autoMap, settlementMap, manuals] = await Promise.all([
      this.aggregateAutoHours(periods),
      this.aggregateSettlements(periods),
      this.listManualRecordsInPeriods(periods),
    ])

    // 收集所有出现过的 jobNos:auto + settlement + manual 并集
    const allJobNos = new Set<string>()
    autoMap.forEach(v => allJobNos.add(v.jobNo))
    settlementMap.forEach(v => allJobNos.add(v.jobNo))
    manuals.forEach(m => allJobNos.add(m.employeeJobNo))

    const employees = await this.prisma.employee.findMany({
      where: { jobNo: { in: [...allJobNos] } },
      select: { jobNo: true, name: true },
    })
    const empMap = new Map(employees.map(e => [e.jobNo, e.name]))

    // 构 auto 行:autoMap 的每项 + 对应 settlementMap 命中值
    const autoRows: PayrollAutoRow[] = [...autoMap.values()].map(v => {
      const s = settlementMap.get(`${v.jobNo}::${v.period}`)
      const rate = s?.lastHourlyRate ?? null
      const totalFee = rate != null ? Number((rate * v.hours).toFixed(2)) : null
      // auto 行的 extraLabor / extraDeduction 严格为 0(Q1 决策:劳务/扣除只出现在 manual 行)
      const payable = totalFee != null ? totalFee : null
      return {
        kind: 'auto',
        employeeJobNo: v.jobNo,
        employeeName: empMap.get(v.jobNo) ?? '(工号 ' + v.jobNo + ' 已不存在)',
        period: v.period,
        hourlyRate: rate,
        deliveredHours: v.hours,
        totalCourseFee: totalFee,
        extraLabor: 0,
        extraDeduction: 0,
        subtotalPayable: payable,
        subtotalPaid: s?.sumPaid ?? 0,
        settlementIds: s?.settlementIds ?? [],
      }
    })

    // 构 manual 行
    const manualRows: PayrollManualRow[] = manuals.map(m => ({
      kind: 'manual',
      id: m.id,
      employeeJobNo: m.employeeJobNo,
      employeeName: empMap.get(m.employeeJobNo) ?? '(工号 ' + m.employeeJobNo + ' 已不存在)',
      period: m.settlementPeriod,
      hourlyRate: null,
      deliveredHours: 0,
      totalCourseFee: 0,
      extraLabor: Number(m.extraLabor),
      extraDeduction: Number(m.extraDeduction),
      subtotalPayable: Number(m.extraLabor) - Number(m.extraDeduction),
      subtotalPaid: 0,
      createdAt: m.createdAt.toISOString(),
    }))

    // keyword 过滤
    const kw = query.keyword?.trim()
    const filterByKw = (row: PayrollRow) =>
      !kw || row.employeeJobNo.includes(kw) || row.employeeName.toLowerCase().includes(kw.toLowerCase())

    // unpaidOnly
    const filterUnpaid = (row: PayrollRow) => {
      if (!query.unpaidOnly) return true
      if (row.kind === 'manual') return true  // manual 视为始终未结清
      return row.subtotalPayable != null && row.subtotalPaid < row.subtotalPayable
    }

    let allRows: PayrollRow[] = [...autoRows, ...manualRows].filter(filterByKw).filter(filterUnpaid)

    // 排序:姓名拼音 → auto 优先 → manual createdAt
    allRows.sort((a, b) => {
      const byName = a.employeeName.localeCompare(b.employeeName, 'zh-Hans-CN', { sensitivity: 'base' })
      if (byName !== 0) return byName
      if (a.kind !== b.kind) return a.kind === 'auto' ? -1 : 1
      if (a.kind === 'manual' && b.kind === 'manual') return a.createdAt.localeCompare(b.createdAt)
      return 0
    })

    return { items: allRows, total: allRows.length }
  }

  private async aggregateAutoHours(periods: string[]): Promise<Map<string, { jobNo: string; period: string; hours: number }>> { /* §4.5 */ }

  private async aggregateSettlements(periods: string[]): Promise<Map<string, { jobNo: string; period: string; lastHourlyRate: number; sumPaid: number; settlementIds: string[] }>> {
    const settlements = await this.prisma.payrollSettlement.findMany({
      where: { settlementPeriod: { in: periods } },
      orderBy: { settledAt: 'asc' },
    })
    const map = new Map<string, any>()
    for (const s of settlements) {
      const key = `${s.employeeJobNo}::${s.settlementPeriod}`
      const cur = map.get(key) ?? { jobNo: s.employeeJobNo, period: s.settlementPeriod, lastHourlyRate: 0, sumPaid: 0, settlementIds: [] as string[] }
      cur.lastHourlyRate = Number(s.hourlyRate)  // 所有行 rate 一致,覆盖取最后一行即可
      cur.sumPaid += Number(s.subtotalPaid)
      cur.settlementIds.push(s.id)
      map.set(key, cur)
    }
    return map
  }

  private async listManualRecordsInPeriods(periods: string[]) {
    return this.prisma.payrollManualRecord.findMany({
      where: { settlementPeriod: { in: periods } },
      orderBy: { createdAt: 'asc' },
    })
  }

  /** 给 SettleDialog 拉单行状态 */
  async getRowState(teacherJobNo: string, period: string): Promise<{
    employeeName: string;
    hourlyRate: number | null;
    deliveredHours: number;
    payable: number | null;
    alreadyPaid: number;
  }> { /* 简化单元素查询,复用聚合路径 */ }

  /** 给 ViewCoursesDialog */
  async listCoursesForTeacherPeriod(teacherJobNo: string, period: string): Promise<CourseForPayroll[]> { /* 查 Course + enrichWithDerivedFields + 选字段投影 */ }
}
```

### 5.4 `payroll-settlements.service.ts`

```ts
@Injectable()
export class PayrollSettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async create(dto: SettlePayrollDto, operator: AuthUser): Promise<PayrollSettlement> {
    // 1. 聚合当前 deliveredHours / 历史 settlements
    const courses = await this.prisma.course.findMany({
      where: {
        actualTeacherJobNo: dto.employeeJobNo,
        durationMinutes: { not: null },
        plannedAt: { gte: periodBounds(dto.settlementPeriod).start, lt: periodBounds(dto.settlementPeriod).end },
      },
      select: { durationMinutes: true },
    })
    const deliveredHours = courses.reduce((acc, c) => acc + (computeCreditHours(c.durationMinutes) ?? 0), 0)

    const history = await this.prisma.payrollSettlement.findMany({
      where: { employeeJobNo: dto.employeeJobNo, settlementPeriod: dto.settlementPeriod },
      select: { hourlyRate: true, subtotalPaid: true },
    })

    const newRate = Number(dto.hourlyRate)
    if (history.length > 0) {
      const existingRate = Number(history[0].hourlyRate)
      if (newRate !== existingRate) {
        throw new BadRequestException(`该月单位课时费已为 ${existingRate} 元,不得更改`)
      }
    }
    if (newRate <= 0) throw new BadRequestException('单位课时费必须大于 0')

    const extraLabor     = Number(dto.extraLabor)
    const extraDeduction = Number(dto.extraDeduction)
    const payable        = newRate * deliveredHours + extraLabor - extraDeduction
    const alreadyPaid    = history.reduce((s, h) => s + Number(h.subtotalPaid), 0)
    const paidAmount     = Number(dto.paidAmount)
    if (paidAmount <= 0) throw new BadRequestException('本次结算金额必须大于 0')
    if (paidAmount > payable - alreadyPaid + 1e-6) {   // 浮点容差
      throw new BadRequestException(`本次结算金额超出剩余应结算 ${payable - alreadyPaid} 元`)
    }

    const created = await this.prisma.payrollSettlement.create({
      data: {
        operatorPhone:    operator.phone,
        employeeJobNo:    dto.employeeJobNo,
        settlementPeriod: dto.settlementPeriod,
        hourlyRate:       newRate,
        deliveredHours,
        extraLabor,
        extraDeduction,
        subtotalPayable:  payable,
        subtotalPaid:     paidAmount,
      },
    })

    await this.auditLogs.record({
      operatorId:  operator.id,
      action:      'settle',                 // spec §0 §4.3 要求 "结算" 单独 action
      targetType:  'payroll_settlement',
      targetId:    created.id,
      after:       { ...created, hourlyRate: newRate, subtotalPayable: payable, subtotalPaid: paidAmount },
    })
    return created
  }
}
```

**action='settle'**:`AuditLog.action` 的枚举当前由 `AuditLogsService` 动态接受 string,Phase 0 设计里列过 `'reset_password' | 'deactivate' | ...`;Phase 5 新增 `'settle'` 作为独立动作,便于 Phase 6 的 "关于" 页日志过滤。

### 5.5 `payroll-manual-records.service.ts`

```ts
async create(dto: CreateManualRecordDto, operator: AuthUser): Promise<PayrollManualRecord> {
  const emp = await this.prisma.employee.findUnique({ where: { jobNo: dto.employeeJobNo }, select: { jobNo: true } })
  if (!emp) throw new BadRequestException('指定员工不存在')

  const extraLabor = Number(dto.extraLabor)
  const extraDeduction = Number(dto.extraDeduction)
  if (extraLabor <= 0) throw new BadRequestException('其他劳务必须大于 0')
  if (extraLabor === extraDeduction) throw new BadRequestException('其他扣除不得等于其他劳务')

  const created = await this.prisma.payrollManualRecord.create({
    data: {
      employeeJobNo:    dto.employeeJobNo,
      settlementPeriod: dto.settlementPeriod,
      extraLabor,
      extraDeduction,
      operatorPhone:    operator.phone,
    },
  })

  await this.auditLogs.record({
    operatorId: operator.id,
    action:     'create',
    targetType: 'payroll_manual_record',
    targetId:   created.id,
    after:      { ...created },
  })
  return created
}

async remove(id: string, operator: AuthUser): Promise<void> {
  const before = await this.prisma.payrollManualRecord.findUnique({ where: { id } })
  if (!before) throw new NotFoundException('手动记录不存在')
  await this.prisma.payrollManualRecord.delete({ where: { id } })
  await this.auditLogs.record({
    operatorId: operator.id,
    action:     'delete',
    targetType: 'payroll_manual_record',
    targetId:   id,
    before,
  })
}
```

### 5.6 `payroll.controller.ts`

| 方法 | 路径 | 守卫 | 说明 |
| --- | --- | --- | --- |
| GET | `/payroll` | `@Roles(SUPER_ADMIN, ADMIN)` | `QueryPayrollDto` |
| GET | `/payroll/row/:jobNo/:period` | `@Roles(SUPER_ADMIN, ADMIN)` | 单行状态,给 SettleDialog |
| GET | `/payroll/courses` | `@Roles(SUPER_ADMIN, ADMIN)` | query `teacherJobNo` + `period`,给 ViewCoursesDialog |
| POST | `/payroll/settlements` | `@Roles(SUPER_ADMIN, ADMIN)` | `SettlePayrollDto` |
| POST | `/payroll/manual-records` | `@Roles(SUPER_ADMIN, ADMIN)` | `CreateManualRecordDto` |
| DELETE | `/payroll/manual-records/:id` | `@Roles(SUPER_ADMIN, ADMIN)` | 204 |

守卫统一 `@Roles(SUPER_ADMIN, ADMIN)`,与 spec §0 §3 "一般成员不可访问薪酬管理" 对齐。

### 5.7 `employees.service.ts` 联动改动

Phase 1A 的 `EmployeesService.remove` 已检测:
- `payrollSettlement` 引用 → 阻止删除

Phase 5 落地后 `PayrollManualRecord` 也要纳入引用保护,补一行:

```ts
const [payrollCount, manualCount, courseCount, counselorCount, plannerCount] =
  await this.prisma.$transaction([
    this.prisma.payrollSettlement.count({ where: { employeeJobNo: before.jobNo } }),
    this.prisma.payrollManualRecord.count({ where: { employeeJobNo: before.jobNo } }),  // ← 新增
    // ... 其余不变
  ])

if (payrollCount + manualCount + courseCount + counselorCount + plannerCount > 0) {
  throw new ConflictException('该员工有关联学生/薪酬/课程,不可删除,请将状态改为已离职')
}
```

文案不变,只扩展引用源。

### 5.8 `app.module.ts` + 模块装配

```ts
imports: [
  ...,
  PayrollModule,
]
```

```ts
@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [PayrollController],
  providers: [PayrollService, PayrollSettlementsService, PayrollManualRecordsService],
})
export class PayrollModule {}
```

---

## 6. 前端详设 (apps/web)

### 6.1 依赖增补

无新增三方包。AntD 的 `DatePicker.RangePicker picker="month"` 已足够。

### 6.2 `services/payroll.ts`

```ts
export const payrollApi = {
  list:   (p: QueryPayroll) => api.get<PayrollListResponse>(`/payroll${toQuery(p)}`),
  row:    (jobNo: string, period: string) => api.get<PayrollRowState>(`/payroll/row/${jobNo}/${period}`),
  courses: (teacherJobNo: string, period: string) =>
    api.get<CourseForPayroll[]>(`/payroll/courses?teacherJobNo=${encodeURIComponent(teacherJobNo)}&period=${period}`),
  settle: (body: SettlePayrollBody) => api.post<PayrollSettlement>('/payroll/settlements', body),
  addManual: (body: CreateManualRecordBody) => api.post<PayrollManualRecord>('/payroll/manual-records', body),
  deleteManual: (id: string) => api.delete<void>(`/payroll/manual-records/${id}`),
}
```

### 6.3 `features/payroll/`

#### `PayrollListPage.tsx`

布局:

- 标题 `员工薪酬管理` 左上
- 工具条(单行,spec §4 顺序):
  - 左 `<Input.Search placeholder="搜索 老师姓名 / 工号">` 280px
  - `<Radio.Group>` "本月 / 上月 / 自定义";选 "自定义" → 紧随展开 `<DatePicker.RangePicker picker="month">`
  - `<Switch>` "仅查看薪资未结清"
  - 右上 `<Button type="primary">手动添加记录</Button>`
- `<Table>` 首列为操作列(`render` 根据 `row.kind` 分叉显示不同按钮组):
  - `auto`:`[查看课程] [结算]`,若 `subtotalPayable == null || subtotalPaid >= subtotalPayable` 则 `[结算]` 禁用
  - `manual`:`[删除记录]`(红色文字按钮,spec §6)
- 列(spec §5):
  - 工号 / 老师姓名 / 所属年月(`YYYYMM`)
  - 单位课时费(auto 带 `元` 单位;manual 显示 `—`)
  - 已授课时(`XX.XX` 保留 2 位)
  - 总课时费(auto 行 `元`;manual 显示 `—`)
  - 其他劳务 / 其他扣除(auto 行固定 0;manual 行真值)
  - **应结算薪资**(spec §5 要求 `<span style={{ color: token.colorError, fontWeight: 600 }}>`,"加粗红字")
  - 已结算薪资(auto 累加;manual 固定 0)
- 分页本地,`pageSize: 50`
- 不分页的 API 响应下,`<Table>` 自动本地分页

颜色 / 红字 / 单位 "元" 统一在自定义 `<MoneyCell value>` 组件实现,保持列展示一致。

#### `SettleDialog.tsx`

```tsx
type Props = {
  open: boolean
  teacherJobNo: string
  teacherName: string
  period: string
  onClose: () => void
}
```

- 挂载时 `GET /payroll/row/:jobNo/:period` → 取 `{ hourlyRate, deliveredHours, payable, alreadyPaid }`
- 显示(只读):`老师:张三` / `应结算总额:1000 元` / `此前已结算:200 元`
- 输入:
  - 若 `hourlyRate == null` → `<InputNumber addonAfter="元/课时" autoFocus>`,字段标题"单位课时费"
  - 否则显示只读 `单位课时费:80 元/课时(该月已确定,不得修改)`
  - `<InputNumber addonAfter="元" min={0.01} max={payable - alreadyPaid} precision={2}>` 本次结算金额
- 底部 `[取消 / 提交]`
- 提交 → `payrollApi.settle({ ... })` → `message.success('结算已记录')` + 关 + invalidate `['payroll']`

#### `AddManualRecordDialog.tsx`

- `<Modal title="手动添加薪酬记录" width={520}>`
- 进入前先弹二次确认 `Modal.confirm`(spec §8 "先弹二次确认"):
  > 手动添加的记录无法联动计算课时费,仅是强制追加一条劳务/扣除记录。是否继续?
- 确认后才打开主弹窗。
- 字段:
  - 员工 `<EmployeePicker>`(Phase 2 组件,默认行为:在职才可选;`historicalEmployee` 展示)
  - 所属年月 `<DatePicker picker="month" format="YYYY-MM">`(界面展示带连字符更易读;提交前在 service 层把 dayjs 值转成 `YYYYMM` 字符串,与后端字段格式一致)
  - 其他劳务 `<InputNumber addonAfter="元" min={0.01}>`;前端校验 > 0
  - 其他扣除 `<InputNumber addonAfter="元" min={0}>`
  - 本地校验:`extraLabor !== extraDeduction`;不相等才启用"提交"
- 底部 `[取消 / 提交]`

#### `DeleteManualRecordConfirm.tsx`

AntD `Modal.confirm`:
- content:`确认删除该手动薪酬记录?删除后不可恢复,日志仍保留。`
- okText `确认删除`,`danger: true`
- 成功 → `message.success('手动记录已删除')` + invalidate `['payroll']`

#### `ViewCoursesDialog.tsx`

- `<Modal title="{teacherName} · {period} 课程" width={900}>`
- 进入时 `GET /payroll/courses?teacherJobNo&period`
- `<Table>` 列:课程编号 / 课程名称 / 计划时间(`YYYY-MM-DD HH:mm`)/ 课时(creditHours)/ 学生数(enrolledCount)/ 授课方式
- 无分页,最多该月数十条

#### hooks

- `hooks/usePayroll.ts`:`useQuery({ queryKey: ['payroll', params], queryFn: payrollApi.list, keepPreviousData: true })`
- `hooks/usePayrollMutations.ts`:聚合 settle / addManual / deleteManual,统一 `onSettled: () => qc.invalidateQueries(['payroll'])`

### 6.4 `router.tsx` 改动

现有占位:

```tsx
{
  path: 'payroll',
  element: (
    <RequireAuth>
      <RequireRole roles={['SUPER_ADMIN', 'ADMIN']}>
        <ModulePage title="薪酬管理" ... />
      </RequireRole>
    </RequireAuth>
  ),
},
```

改为:

```tsx
{
  path: 'payroll',
  element: (
    <RequireAuth>
      <RequireRole roles={['SUPER_ADMIN', 'ADMIN']}>
        <PayrollListPage />
      </RequireRole>
    </RequireAuth>
  ),
},
```

### 6.5 `constants/dictionaries.ts`

无新增字典;复用 Phase 4 的 `TEACHING_TYPE` 在 ViewCoursesDialog 渲染授课方式(已在 Phase 4B 同步)。

---

## 7. 错误处理与边界

| 场景 | 后端行为 | 前端表现 |
| --- | --- | --- |
| 时间区间 > 36 个月 | `periodRangeToList` 抛 | `message.error('时间范围过大,最多选择 36 个月')` |
| 自定义区间 from > to | service 层首行校验 → 400 | `message.error('开始月份不能晚于结束月份')` |
| 首次结算未传 hourlyRate | DTO 缺省 → `@IsNumberString` 失败 400 | Form 红字段 |
| 首次结算 hourlyRate ≤ 0 | service 400 | `message.error` 展示文案 |
| 再结算 hourlyRate ≠ 历史 | service 400 `该月单位课时费已为 X 元` | `message.error` 直出 |
| paidAmount > 剩余应结算 | service 400 | `message.error` |
| 手动记录 extraLabor ≤ 0 | service 400 | Form 红字段 |
| 手动记录 extraLabor == extraDeduction | service 400 | Form 禁用提交 + tip |
| 删除某手动记录但 id 已不存在(并发) | 404 | `message.error('记录已被删除')` |
| 员工 jobNo 在 course 中但不在 Employee 表(并发删员工) | `empMap.get` 返回 undefined → `(工号 X 已不存在)` 占位 | 列表行继续渲染,提示运营 |
| `ViewCoursesDialog` 拿到 0 课程 | 返回 `[]` | `<Empty />` |
| AuditLog service 不可用 | 结算 / 新增 / 删除 `try/catch` 降级 log,不阻断主动作 | 正常成功;运维监控 |
| 一般成员 token 通过前端 RequireRole 但直接调 `/payroll/*` API | 后端 403 | `message.error('无操作权限')`(正常不会到,RequireRole 已在前端拦) |

---

## 8. 验收清单(spec §11 映射)

- [ ] 一般成员访问 `/payroll` → 返回权限页;管理员/超级管理员 → 进入列表
- [ ] 列表默认展示本月数据
- [ ] "上月" 按钮点击 → 切换到上月
- [ ] "自定义" 按钮点击 → `RangePicker` 展开;选区间 `202601` - `202603` → 列表展示 3 个月聚合
- [ ] 搜索框输入老师姓名片段 → 列表过滤到命中的 (jobNo, period) 行
- [ ] "仅查看薪资未结清" 打开 → auto 行只剩未全部结算的;manual 行保留
- [ ] 排序按姓名拼音升序,同姓名下 auto 在前、manual 按 createdAt 先后
- [ ] 所属年月列展示 `202604` 六位数字
- [ ] 应结算薪资列加粗红字 + "元" 单位
- [ ] auto 行点"查看课程" → 弹窗列出当月该老师已完成课程 6 列
- [ ] auto 行点"结算" → 弹窗显示应结算 / 已结算 / 输入本次金额上限等于差额
- [ ] 首次结算弹窗要求输入单位课时费;输入 0 或负 → 拒绝
- [ ] 再次结算(同月)单位课时费被锁定只读,改 → 后端 400 拦截
- [ ] 本次结算金额 > 剩余应结算 → 400 拦截
- [ ] 手动添加记录 → 先二次确认再进主弹窗
- [ ] 手动记录 extraLabor ≤ 0 或 == extraDeduction → 提交禁用/400
- [ ] 成功添加 → 列表出现 manual 行,操作列"删除记录"红字按钮
- [ ] 点"删除记录" → 确认后消失,日志有 delete 记录
- [ ] AuditLog 表对 `settle` / `create payroll_manual_record` / `delete payroll_manual_record` 各有写入
- [ ] Phase 1A 员工删除 Conflict 检查:`payrollSettlement` 或 `payrollManualRecord` 任一存在 → 阻止删除
- [ ] 金额展示小数 2 位,无 "元" 单位缺失的字段

手动测试为准;自动化测试基础设施仍不在本阶段范围内。

---

## 9. 范围边界(明确**不**做)

- 薪酬导出 Excel / PDF(spec 无要求)
- 批量结算 / 批量撤销结算
- 结算事件的编辑或撤销(只支持 create;错录数据运营手动通过手动记录做反向调整)
- 手动记录的编辑(只有添加和删除;错录要删除重建)
- 按老师维度看"历史薪酬累计"(Phase 5 只做单月列表)
- 跨年度年度汇总 / Dashboard / 图表
- 邮件 / 短信 / 飞书通知结算到账
- 时区切换:`plannedAt` 按 UTC 月归属,若运营发现跨月错归再做 `Asia/Shanghai` 本地时间化升级
- 自动化测试基础设施
- 移动端薪酬页专门重设计(沿用响应式;表格列多时横向滚动可接受)

---

## 10. 变更文件一览

**新增(后端)**:

- `apps/api/src/common/payroll/period.ts`
- `apps/api/src/modules/payroll/payroll.module.ts`
- `apps/api/src/modules/payroll/payroll.controller.ts`
- `apps/api/src/modules/payroll/payroll.service.ts`
- `apps/api/src/modules/payroll/payroll-settlements.service.ts`
- `apps/api/src/modules/payroll/payroll-manual-records.service.ts`
- `apps/api/src/modules/payroll/payroll.types.ts`
- `apps/api/src/modules/payroll/dto/query-payroll.dto.ts`
- `apps/api/src/modules/payroll/dto/settle-payroll.dto.ts`
- `apps/api/src/modules/payroll/dto/create-manual-record.dto.ts`

**修改(后端)**:

- `apps/api/prisma/schema.prisma`(+ `PayrollManualRecord`,`PayrollSettlement` 加 `@@index`)
- `apps/api/src/app.module.ts`(+ `PayrollModule`)
- `apps/api/src/modules/employees/employees.service.ts`(`remove` 的引用检查加 `payrollManualRecord.count`)

**新增(前端)**:

- `apps/web/src/services/payroll.ts`
- `apps/web/src/features/payroll/PayrollListPage.tsx`
- `apps/web/src/features/payroll/SettleDialog.tsx`
- `apps/web/src/features/payroll/AddManualRecordDialog.tsx`
- `apps/web/src/features/payroll/DeleteManualRecordConfirm.tsx`
- `apps/web/src/features/payroll/ViewCoursesDialog.tsx`
- `apps/web/src/features/payroll/types.ts`
- `apps/web/src/features/payroll/hooks/usePayroll.ts`
- `apps/web/src/features/payroll/hooks/usePayrollMutations.ts`

**修改(前端)**:

- `apps/web/src/router.tsx`(`/payroll` ModulePage → `PayrollListPage`)
- `apps/web/src/styles.css`(工具条、应结算薪资红字列样式,按需)

**不动**:

- `apps/api/src/modules/{auth,users,students,course-outlines,courses,links,audit-logs,storage}/` 其余逻辑
- `apps/web/src/features/{auth,employees,students,course-outlines,courses,user-settings,users}/`
- `apps/web/src/components/EmployeePicker.tsx`
- `docker-compose.yml` / env

---

## 11. 与 Phase 6 / Phase 7 的接口预留

Phase 5 落完后,Phase 6(关于页日志入口)可直接用:

- `AuditLog.targetType ∈ { payroll_settlement, payroll_manual_record }` 作为"薪酬操作"的日志筛选标签
- `AuditLog.action ∈ { settle, create, delete }` 配合 targetType 过滤出结算历史

Phase 7(移动端)不需要 Phase 5 做任何预留,表格在窄屏会横向滚动,工具条按钮组会折行,属于沿用响应式的自然退化;若 UX 要求更紧凑,Phase 7 里重做该页的移动端版本即可。
