import { FileSearchOutlined, MailOutlined } from "@ant-design/icons";
import { Button, Divider, Space, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { ABOUT_CONFIG } from "../../constants/about";
import { useAuthStore } from "../../stores/authStore";

export function AboutPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const canViewLogs = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";

  return (
    <div className="about-page">
      <div className="about-logo">研录</div>
      <Typography.Title level={2} className="about-platform-name">
        {ABOUT_CONFIG.platformName}
      </Typography.Title>
      <div className="about-version">版本号 v{ABOUT_CONFIG.version}</div>

      <Divider />

      <Space direction="vertical" size={12} className="about-info-block">
        <div>
          <span className="about-info-label">所属企业：</span>
          <span>{ABOUT_CONFIG.companyName}</span>
        </div>
        <div>
          <MailOutlined />{" "}
          <span className="about-info-label">问题反馈：</span>
          <a href={`mailto:${ABOUT_CONFIG.feedbackEmail}`}>
            {ABOUT_CONFIG.feedbackEmail}
          </a>
        </div>
      </Space>

      {canViewLogs ? (
        <div className="about-logs-entry">
          <Button
            type="primary"
            icon={<FileSearchOutlined />}
            onClick={() => navigate("/logs")}
          >
            查看中台日志
          </Button>
        </div>
      ) : null}

      <div className="about-footer">
        <div>{ABOUT_CONFIG.copyrightLine}</div>
        {ABOUT_CONFIG.beianNumber ? (
          <div className="about-beian">备案号：{ABOUT_CONFIG.beianNumber}</div>
        ) : (
          <div className="about-beian about-beian-placeholder">备案号：—</div>
        )}
      </div>
    </div>
  );
}
