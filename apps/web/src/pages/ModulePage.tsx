import { Button, Card, Col, List, Row, Space, Tag, Typography } from "antd";
import { useNavigate } from "react-router-dom";

type EntryLink = {
  label: string;
  to: string;
};

type ModulePageProps = {
  title: string;
  summary: string;
  milestones: string[];
  specs: string[];
  entryLinks?: EntryLink[];
};

export function ModulePage(props: ModulePageProps) {
  const { title, summary, milestones, specs, entryLinks } = props;
  const navigate = useNavigate();

  return (
    <div>
      <Typography.Title level={2} style={{ marginTop: 0 }}>
        {title}
      </Typography.Title>
      <Typography.Paragraph type="secondary">{summary}</Typography.Paragraph>
      {entryLinks && entryLinks.length > 0 ? (
        <Space wrap style={{ marginBottom: 16 }}>
          {entryLinks.map((l) => (
            <Button key={l.to} type="primary" onClick={() => navigate(l.to)}>
              {l.label}
            </Button>
          ))}
        </Space>
      ) : null}
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card title="当前脚手架已预留内容" className="content-card">
            <List
              dataSource={milestones}
              renderItem={(item) => (
                <List.Item>
                  <Tag color="blue">Ready</Tag>
                  <span>{item}</span>
                </List.Item>
              )}
            />
          </Card>
        </Col>
        <Col xs={24} xl={10}>
          <Card title="关联 SPEC" className="content-card">
            <List
              dataSource={specs}
              renderItem={(item) => (
                <List.Item>
                  <Typography.Text code>{item}</Typography.Text>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
