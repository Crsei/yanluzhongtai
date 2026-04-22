# 前端组件约定

## 1. 目标

本文件用于把 `docs/spec` 中的 UI 规则收敛成前端实现约定，避免在 Phase 0 就过早发明一层自定义组件包装。

约束原则：

- 优先使用 `Ant Design` 原生组件
- 先统一主题、交互约定和样式规则
- 不在当前阶段引入 `<YButton>` 这类包装抽象

## 2. 按钮约定

### 2.1 类型映射

- 普通按钮：`Button` 默认样式
- 主按钮：`Button type="primary"`
- 危险按钮：`Button danger`

### 2.2 使用规则

- 同一工具栏中的按钮高度保持一致
- 重要主动作优先使用蓝色主按钮
- 删除、注销、危险确认优先使用危险按钮

## 3. 表格约定

- 优先使用 `Table`
- 业务列表默认首列为复选框
- 表头加粗
- 默认支持分页
- 搜索框与按钮组保持明显间距

例外：

- 薪酬管理页的首列是操作列，不使用复选框

## 4. 弹窗约定

- 优先使用 `Modal`
- 弹窗内容较多时，内部允许滚动
- 底部操作按钮统一右对齐
- 添加/编辑类弹窗优先采用双列表单布局

## 5. 日期与时间约定

- 日期使用 `DatePicker`
- 日期时间使用 `DatePicker` 的时间模式或等效组件
- 年月选择使用 `DatePicker` 的月份模式
- 不允许自由文本替代日期控件

## 6. 未授权与认证态约定

- 未登录访问受限页面时，不强制硬跳 `/login`
- 保持 `AppShell` 壳层存在
- 页面内容区域显示统一的 `UnauthorizedPage`
- 只有用户主动点击“前往登录”时才跳转登录页

## 7. 访客与用户面板约定

- 已登录用户：
  - 左下角显示绿点
  - 显示用户名
  - 悬停显示身份、用户设置、退出登录
- 未登录访客：
  - 左下角显示红点
  - 显示”访客（点击登录）”
  - 不显示 Popover

## 员工模块（Phase 1A）

- 列表页：`features/employees/EmployeeListPage.tsx`，工具按钮顺序固定为 查看 / 编辑 / 添加员工 / 删除员工 / 从 Excel 导入；搜索框右侧分离。
- 弹窗：`EmployeeFormModal.tsx` 双列布局，view / edit / create 三模式共用一个 form；底部按钮按 spec §5.2 切换。
- 删除：`confirmDeleteEmployee()` 弹强提醒；后端 409 时 `useEmployeeMutations` 的 `removeMutation.onError` 直接 `message.error` 后端文案。
- 上传：`EmployeeAttachmentUpload.tsx` 与 `EmployeeImportDrawer.tsx` 共用 `services/storage.ts` 的 `uploadToStorage()`，全部 presign 直传 MinIO，不走后端中转。
- 字典：`constants/dictionaries.ts` 是后端 `common/dictionaries.ts` 的镜像；任何枚举改动两边都要改。

## 用户与账号管理（Phase 1B）

- `layouts/UserSettingsLayout.tsx` — 独立标签页 layout，header 显示标题 + `/users` 时附 "返回设置" 按钮。
- `features/user-settings/`：
  - `UserSettingsPage.tsx` — 手机号 / 员工姓名 / 修改密码 / 注销账号 + 角色权限区。`SUPER_ADMIN` 看到 3 个权限按钮，`ADMIN` 仅 1 个，`MEMBER` 隐藏权限区。
  - `ChangePhoneModal.tsx`（要求当前密码）/ `ChangeUsernameModal.tsx`（无密码）/ `ChangePasswordModal.tsx`（旧密 + 新密 + 确认）/ `DeactivateSelfModal.tsx`（两步确认，第 2 步要求重输手机号）。
- `features/users/`：
  - `UsersListPage.tsx` — 列表 + `[显示已注销]` 切换 + `[注册账号]`（SUPER_ADMIN 可点）。操作列按钮对自己 / 已注销 / ADMIN 自动 disabled。
  - `RoleDropdown.tsx` — 行内角色下拉。`ADMIN` 仅能把 `MEMBER → ADMIN`；`SUPER_ADMIN` 任意切换且对自己 disabled。
  - `RegisterUserModal.tsx` / `ResetPasswordDialog.tsx` / `DeactivateUserModal.tsx` — admin 危险操作，全部带二次确认；register 与 reset 成功后展示一次性 `initialPassword` / `tempPassword`。
  - `hooks/useUsers.ts` 与 `hooks/useUserMutations.ts` — TanStack Query 5 包装，`updateRole` / `deactivate` / `register` 成功后 invalidate `['users']`。
- `features/auth/ForcePasswordChangePage.tsx` — 强制改密拦截页，`POST /users/me/initial-password-change`，成功后清前端 `mustChangePassword` 标记并跳 `/`。
- `services/http.ts` 拦截器：响应 `403 { code: "MUST_CHANGE_PASSWORD" }` 时 `window.location.assign("/force-password-change")`。
- `App.tsx::MustChangePasswordGate` — store 标记就绪时同步 redirect，覆盖刚 hydrate 的场景。
- AppShell 右上 Popover "用户设置" 改为 `window.open('/user-settings', '_blank', 'noopener')`，与 `/user-settings` 内的"中台全部用户管理"按钮一致：所有账号管理页都在独立标签页打开。


## 学生模块（Phase 2）

- 入口：`features/students/StudentListPage.tsx`，路由 `/students`（在 `AppShell` 内，`RequireAuth`）。
- 列表：
  - 工具按钮顺序固定为 查看 / 编辑 / 添加学生 / 删除学生 / 从 Excel 导入；搜索框右侧，最右是 高级搜索 按钮。
  - 选中 0 行：所有编辑按钮禁用；选中 1 行：全部启用；选中 ≥2 行：查看 / 编辑 禁用，删除仍启用。
  - 写按钮仅 `SUPER_ADMIN` / `ADMIN` 可见（`useAuthStore` 角色判断）。
  - 默认排序按 spec §4.3：服务状态优先级 → 年级（大五→大一）→ 姓名升序。
- 表单：`StudentFormModal.tsx`，1040 宽的双列 Modal；`view` / `edit` / `create` 三模式共用 form；底部按钮按模式切换（`view` 显示取消 / 编辑）。
  - `enrollmentYear` 创建后锁死（`edit` 态 `disabled` + tooltip）。
  - `当前年级` 永远由后端计算 `detail.grade`，Input disabled 显示。
  - `学管老师` / `规划师` 走共享组件 `components/EmployeePicker.tsx`：远程搜索（`showSearch` + 300ms 防抖 + 20 条分页）+ 回填（`employeesApi.findByJobNo`）+ 默认排除 `RESIGNED`（可关）。
  - 服务字段分组显示：基础档案 / 服务归属 / 课时 / 服务字段（含 `DetailNotesEditor` 多段式、`StudentAttachmentUpload` 六处挂载）/ 二级课程类别占位。
- 高级搜索：`AdvancedSearchDrawer.tsx`，条件写回 URL (`?studentNo=&name=&grade=&major=&source=&servicePlatform=`)；`ActiveFilterTags.tsx` 在列表上方显示可删除的 Tag 行；URL 可分享。
- Excel 导入：`StudentImportDrawer.tsx` 同 Phase 1A 三段式（下载模板 → 上传 → dry-run 报告 → commit）。模板以中文表头（包含 `服务状态` 的中文显示值，如"正常服务中"），后端 `students-import.service.ts::validateRow` 反向映射为 enum code。
- 删除：`StudentDeleteConfirm.tsx` 封装 `Modal.confirm`；后端 409 (有 `Enrollment`) 时 `useStudentMutations.removeMutation.onError` 直接展示后端文案。
- 附件：`StudentAttachmentUpload.tsx` 同 Phase 1A 模式，`folder="students/attachments"` presign 直传 MinIO；支持多附件、拖拽、点击下载。
- 字典：`constants/dictionaries.ts` 新增 `SERVICE_STATUS*`、`SERVICE_PLATFORM*`、`STUDENT_SOURCE*`、`GRADE_VALUES`/`GRADE_OPTIONS` 与后端 `common/dictionaries.ts` 一一镜像。
- 审计：`student.create` / `student.update`（字段级）/ `student.delete`；`AuditLogsService` 已泛化为 `*.update` 触发字段级拆条（对 Phase 1A `employee.update` 仍兼容）。

## 共享组件：EmployeePicker

`components/EmployeePicker.tsx`：远程搜索员工 jobNo 的 Select，用于学生模块的老师挑选；Phase 3 课程模块将直接复用于"计划 / 实际授课老师"字段。Props：`value` / `onChange` / `placeholder` / `disabled` / `excludeResigned`（默认 true）/ `allowClear` / `style`。依赖 `services/employees.ts::findByJobNo`（精确回填）与扩展后的 `employees` 列表接口（支持 `employmentStatus=FULL_TIME,PART_TIME` 多值 + `jobNo=xxx` 精确过滤）。
