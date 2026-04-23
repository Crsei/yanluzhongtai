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
import { DataCenterPage } from "./features/quick-links/DataCenterPage";
import { SopCenterPage } from "./features/quick-links/SopCenterPage";
import { AboutPage } from "./features/about/AboutPage";
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
            <DataCenterPage />
          </RequireAuth>
        ),
      },
      {
        path: "sop",
        element: <SopCenterPage />,
      },
      {
        path: "about",
        element: <AboutPage />,
      },
    ],
  },
]);
