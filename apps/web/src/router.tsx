import { createBrowserRouter } from "react-router-dom";
import { RequireAuth } from "./features/auth/RequireAuth";
import { RequireRole } from "./features/auth/RequireRole";
import { RootEntryRedirect } from "./features/auth/RootEntryRedirect";
import { EmployeeListPage } from "./features/employees/EmployeeListPage";
import { AppShell } from "./layouts/AppShell";
import { LoginPage } from "./pages/LoginPage";
import { ModulePage } from "./pages/ModulePage";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
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
            <ModulePage
              title="学生管理"
              summary="对应学生列表、高级搜索、服务字段、学管老师/规划师选择器。"
              milestones={["学生模块路由已预留", "可挂载高级搜索页", "可扩展课时剩余看板字段"]}
              specs={["docs/spec/03-Phase2-学生管理.md"]}
            />
          </RequireAuth>
        ),
      },
      {
        path: "courses",
        element: (
          <RequireAuth>
            <ModulePage
              title="课程管理"
              summary="包含课程大纲、课程详情、学生选课和高级搜索等核心业务链路。"
              milestones={["课程模块路由已预留", "移动端侧边栏形态已预留", "后续可拆 outline / detail 子路由"]}
              specs={[
                "docs/spec/04-Phase3-课程大纲管理.md",
                "docs/spec/05-Phase4-课程信息与学生选课.md",
              ]}
            />
          </RequireAuth>
        ),
      },
      {
        path: "payroll",
        element: (
          <RequireAuth>
            <RequireRole roles={["SUPER_ADMIN", "ADMIN"]}>
              <ModulePage
                title="薪酬管理"
                summary="对应老师课时汇总、结算弹窗、手动记录和按周期筛选。"
                milestones={["薪酬模块路由已预留", "后续直接对接课程与结算接口", "适合追加列表与弹窗容器"]}
                specs={["docs/spec/06-Phase5-薪酬管理.md"]}
              />
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
