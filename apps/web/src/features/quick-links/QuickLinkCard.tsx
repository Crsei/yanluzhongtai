import {
  CopyOutlined,
  DownloadOutlined,
  ExportOutlined,
} from "@ant-design/icons";
import { Checkbox, message } from "antd";
import type { CSSProperties } from "react";
import type { QuickLinkRow } from "./types";

type Props = {
  link: QuickLinkRow;
  selected: boolean;
  accent: "blue" | "green";
  onToggleSelect: (id: string) => void;
  showSelector: boolean;
};

const KIND_HINT: Record<QuickLinkRow["kind"], { icon: JSX.Element; label: string }> = {
  NAVIGATE: { icon: <ExportOutlined />, label: "点击跳转" },
  COPY: { icon: <CopyOutlined />, label: "点击复制" },
  DOWNLOAD: { icon: <DownloadOutlined />, label: "点击下载" },
};

function handleClick(link: QuickLinkRow): void {
  if (link.kind === "COPY") {
    if (!navigator.clipboard) {
      message.warning("浏览器不支持自动复制，请手动复制链接");
      return;
    }
    navigator.clipboard
      .writeText(link.url)
      .then(() => message.success("链接已复制"))
      .catch(() => message.error("复制失败，请手动复制"));
    return;
  }
  if (link.kind === "DOWNLOAD") {
    const a = document.createElement("a");
    a.href = link.url;
    a.download = "";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }
  window.open(link.url, "_blank", "noopener");
}

export function QuickLinkCard({
  link,
  selected,
  accent,
  onToggleSelect,
  showSelector,
}: Props) {
  const style: CSSProperties = {
    borderColor: selected ? `var(--quick-link-accent-${accent})` : undefined,
  };
  const hint = KIND_HINT[link.kind];

  return (
    <div
      className={`quick-link-card quick-link-card-${accent}`}
      style={style}
      onClick={() => handleClick(link)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick(link);
        }
      }}
    >
      {showSelector ? (
        <Checkbox
          className="quick-link-card-checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect(link.id)}
        />
      ) : null}
      <div className="quick-link-card-title">{link.title}</div>
      <div className="quick-link-card-meta">
        {hint.icon}
        <span className="quick-link-card-meta-label">{hint.label}</span>
      </div>
    </div>
  );
}
