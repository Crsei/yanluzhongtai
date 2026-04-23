import { Select, Tag } from "antd";
import type { VersionListItem } from "./types";

type Props = {
  versions: VersionListItem[];
  value: string | null;
  onChange: (id: string) => void;
  loading?: boolean;
};

export function OutlineVersionDropdown({ versions, value, onChange, loading }: Props) {
  const options = versions.map((v) => ({
    value: v.id,
    label: (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {v.versionName}
        {v.isActive ? <Tag color="blue">当前</Tag> : null}
      </span>
    ),
  }));

  return (
    <Select
      style={{ width: 220 }}
      value={value ?? undefined}
      options={options}
      placeholder="选择大纲版本"
      loading={loading}
      onChange={onChange}
      disabled={!loading && versions.length === 0}
    />
  );
}
