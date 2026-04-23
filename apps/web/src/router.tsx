import { createBrowserRouter, Navigate } from "react-router-dom";
import { RequireAuth } from "./features/auth/RequireAuth";
import { RequireRole } from "./features/auth/RequireRole";
import { RootEntryRedirect } from "./features/auth/RootEntryRedirect";
import { EmployeeListPage } from "./features/employees/EmployeeListPage";
import { StudentListPage } from "./features/students/StudentListPage";
import { CourseOutlinePage } from "./features/course-outlines/CourseOutlinePage";
import { CourseListPage } from "./features/courses/CourseListPage";
import { AdvancedSearchPage } from "./features/courses/AdvancedSearchPage";
import { PayrollListPage } from "./features/payroll/PayrollListPage";
import { AppShell } from "./layouts/AppShell";
import { UserSettingsLayout } from "./layouts/UserSettingsLayout";
import { LoginPage } from "./pages/LoginPage";
import { ModulePage } from "./pages/ModulePage";
import { UserSettingsPage } from "./features/user-settings/UserSettingsPage";
import { UsersListPage } from "./features/users/UsersListPage";
import { ForcePasswordChangePage } from "./features/auth/ForcePasswordChangePage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/force-password-change",
    element: (
      <RequireAuth>
        <ForcePasswordChangePage />
      </RequireAuth>
    ),
  },
  {
    element: (
      <RequireAuth>
        <UserSettingsLayout />
      </RequireAuth>
    ),
    children: [
      { path: "/user-settings", element: <UserSettingsPage /> },
      {
        path: "/users",
        element: (
          <RequireRole roles={["SUPER_ADMIN", "ADMIN"]}>
            <UsersListPage />
          </RequireRole>
        ),
      },
    ],
  },
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <RootEntryRedirect /> },
      {
        path: "employees",
        element: (
          <RequireAuth>
            <EmployeeListPage />
          </RequireAuth>
        ),
      },
      {
        path: "students",
        element: (
          <RequireAuth>
            <StudentListPage />
          </RequireAuth>
        ),
      },
      {
        path: "courses",
        element: (
          <RequireAuth>
            <Navigate to="/courses/list" replace />
          </RequireAuth>
        ),
      },
      {
        path: "courses/list",
        element: (
          <RequireAuth>
            <CourseListPage />
          </RequireAuth>
        ),
      },
      {
        path: "courses/advanced-search",
        element: (
          <RequireAuth>
            <AdvancedSearchPage />
          </RequireAuth>
        ),
      },
      {
        path: "courses/outline",
        element: (
          <RequireAuth>
            <CourseOutlinePage />
          </RequireAuth>
        ),
      },
      {
        path: "payroll",
        element: (
          <RequireAuth>
            <RequireRole roles={["SUPER_ADMIN", "ADMIN"]}>
              <PayrollListPage />
            </RequireRole>
          </RequireAuth>
        ),
      },
      {
        path: "links",
        element: (
          <RequireAuth>
            <ModulePage
              title="数据表"
              summary="对应内部数据表和快捷跳转卡片中心。"
              milestones={["入口页路由已预留", "后续可直接挂卡片网格组件", "适合对接 QuickLink 接口"]}
              specs={["docs/spec/07-Phase6-数据表-SOP-关于.md"]}
            />
          </RequireAuth>
        ),
      },
      {
        path: "sop",
        element: (
          <ModulePage
            title="SOP"
            summary="对应 SOP 跳转中心与 hover 视觉差异化设计。"
            milestones={["SOP 路由已预留", "后续可复用数据表卡片组件", "访客开放能力可在此页优先接入"]}
            specs={["docs/spec/07-Phase6-数据表-SOP-关于.md"]}
          />
        ),
      },
      {
        path: "about",
        element: (
          <ModulePage
            title="关于"
            summary="对应版本信息、企业信息、日志入口和版权备案区域。"
            milestones={["关于页路由已预留", "日志入口可在接入 RBAC 后落盘", "适合挂健康检查与版本信息"]}
            specs={["docs/spec/07-Phase6-数据表-SOP-关于.md"]}
          />
        ),
      },
    ],
  },
]);
