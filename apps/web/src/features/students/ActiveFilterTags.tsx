// apps/web/src/features/students/ActiveFilterTags.tsx
import { Tag } from "antd";
import { useSearchParams } from "react-router-dom";
import { ADVANCED_SEARCH_FIELDS } from "./AdvancedSearchDrawer";

const LABELS: Record<string, string> = {
  studentNo: "学号",
  name: "姓名",
  grade: "年级",
  major: "专业",
  source: "学生来源",
  servicePlatform: "服务平台",
};

export function ActiveFilterTags() {
  const [params, setParams] = useSearchParams();
  const active = ADVANCED_SEARCH_FIELDS.flatMap((k) => {
    const v = params.get(k);
    return v ? [[k, v] as const] : [];
  });
  if (active.length === 0) return null;

  const removeOne = (key: string) => {
    const next = new URLSearchParams(params);
    next.delete(key);
    setParams(next);
  };

  return (
    <div className="active-filter-tag-row" style={{ margin: "8px 0" }}>
      {active.map(([k, v]) => (
        <Tag
          key={k}
          closable
          onClose={() => removeOne(k)}
          color="blue"
          style={{ marginRight: 8 }}
        >
          {LABELS[k] ?? k}: {v}
        </Tag>
      ))}
    </div>
  );
}
