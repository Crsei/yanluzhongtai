// apps/web/src/features/students/DetailNotesEditor.tsx
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Input, Space } from "antd";

type Section = { title: string; content: string };

interface Props {
  value?: Section[] | null;
  onChange?: (sections: Section[]) => void;
  disabled?: boolean;
}

function normalize(raw: unknown): Section[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s) => ({
      title: typeof s.title === "string" ? s.title : "",
      content: typeof s.content === "string" ? s.content : "",
    }));
}

export function DetailNotesEditor({ value, onChange, disabled }: Props) {
  const sections = normalize(value);

  const emit = (next: Section[]) => onChange?.(next);

  return (
    <Space direction="vertical" style={{ width: "100%" }}>
      {sections.map((sec, idx) => (
        <div
          key={idx}
          style={{
            border: "1px solid #eee",
            borderRadius: 8,
            padding: 12,
            background: "#fafafa",
          }}
        >
          <Space style={{ width: "100%", justifyContent: "space-between" }}>
            <Input
              placeholder="段落标题（如：服务清单 / 总规划 / 加分政策）"
              value={sec.title}
              disabled={disabled}
              onChange={(e) => {
                const next = [...sections];
                next[idx] = { ...sec, title: e.target.value };
                emit(next);
              }}
              style={{ flex: 1, marginRight: 12 }}
            />
            <Button
              type="text"
              icon={<DeleteOutlined />}
              disabled={disabled}
              onClick={() => emit(sections.filter((_, i) => i !== idx))}
            />
          </Space>
          <Input.TextArea
            rows={4}
            placeholder="段落正文（可粘贴链接 / 文件路径说明）"
            value={sec.content}
            disabled={disabled}
            onChange={(e) => {
              const next = [...sections];
              next[idx] = { ...sec, content: e.target.value };
              emit(next);
            }}
            style={{ marginTop: 8 }}
          />
        </div>
      ))}
      <Button
        block
        icon={<PlusOutlined />}
        disabled={disabled}
        onClick={() => emit([...sections, { title: "", content: "" }])}
      >
        添加段落
      </Button>
    </Space>
  );
}
