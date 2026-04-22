import {
  BookOutlined,
  DatabaseOutlined,
  DollarOutlined,
  InfoCircleOutlined,
  ProfileOutlined,
  ReadOutlined,
  TeamOutlined,
} from "@ant-design/icons";

export type NavigationItem = {
  key: string;
  label: string;
  path: string;
  icon: React.ReactNode;
};

export const navigationItems: NavigationItem[] = [
  { key: "employees", label: "员工信息", path: "/employees", icon: <TeamOutlined /> },
  { key: "students", label: "学生管理", path: "/students", icon: <ProfileOutlined /> },
  { key: "courses", label: "课程管理", path: "/courses", icon: <ReadOutlined /> },
  { key: "payroll", label: "薪酬管理", path: "/payroll", icon: <DollarOutlined /> },
  { key: "links", label: "数据表", path: "/links", icon: <DatabaseOutlined /> },
  { key: "sop", label: "SOP", path: "/sop", icon: <BookOutlined /> },
  { key: "about", label: "关于", path: "/about", icon: <InfoCircleOutlined /> },
];

