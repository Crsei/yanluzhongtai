# 数据库设计说明

当前数据库模型已经在以下文件落盘：

- `apps/api/prisma/schema.prisma`

当前已预留的核心模型包括：

- `User`
- `Employee`
- `Student`
- `CourseOutlineVersion`
- `CourseOutlineItem`
- `Course`
- `Enrollment`
- `PayrollSettlement`
- `QuickLink`
- `AuditLog`

后续本文件建议补充：

- 主键与唯一索引说明
- 外键策略
- 审计字段约定
- 删除策略（物理/软删除）
- 大字段与附件字段策略

