import { LockOutlined } from "@ant-design/icons";
import { Button, Typography } from "antd";
import { useNavigate } from "react-router-dom";

type UnauthorizedKind = "guest" | "forbidden";

type Props = {
  kind?: UnauthorizedKind;
};

const MESSAGES: Record<UnauthorizedKind, { title: string; description: string }> = {
  guest: { title: "无访问权限", description: "请登录后再访问该页面。" },
  forbidden: { title: "无访问权限", description: "当前账号无权访问该页面。" },
};

export function UnauthorizedPage({ kind = "guest" }: Props) {
  const navigate = useNavigate();
  const { title, description } = MESSAGES[kind];

  return (
    <div className="unauthorized-page">
      <div className="unauthorized-icon">
        <LockOutlined />
      </div>
      <Typography.Title level={2} className="unauthorized-title">
        {title}
      </Typography.Title>
      <Typography.Paragraph type="secondary" className="unauthorized-description">
        {description}
      </Typography.Paragraph>
      {kind === "guest" ? (
        <Button type="primary" size="large" onClick={() => navigate("/login")}>
          前往登录
        </Button>
      ) : null}
    </div>
  );
}
