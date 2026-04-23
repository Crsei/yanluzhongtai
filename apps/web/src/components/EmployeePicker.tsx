// apps/web/src/components/EmployeePicker.tsx
import { Select, type SelectProps } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { employeesApi } from "../services/employees";
import type { EmployeeListItem } from "../features/employees/types";

export interface EmployeePickerProps {
  value?: string | null;
  onChange?: (jobNo: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  excludeResigned?: boolean;
  allowClear?: boolean;
  style?: React.CSSProperties;
}

function formatOption(e: EmployeeListItem) {
  const suffix = e.employmentStatus === "RESIGNED" ? " (已离职)" : "";
  const name = e.name ? `- ${e.name}` : "";
  return { value: e.jobNo, label: `${e.jobNo} ${name}${suffix}`.trim() };
}

export function EmployeePicker({
  value,
  onChange,
  placeholder = "选择员工",
  disabled,
  excludeResigned = true,
  allowClear = true,
  style,
}: EmployeePickerProps) {
  const [options, setOptions] = useState<NonNullable<SelectProps["options"]>>([]);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef<number | undefined>(undefined);

  // Backfill current value on mount / value change
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!value) return;
      if (options.some((o) => o.value === value)) return;
      setLoading(true);
      try {
        const found = await employeesApi.findByJobNo(value);
        if (cancelled) return;
        setOptions((prev) => {
          const next = [...prev];
          if (found) next.unshift(formatOption(found));
          else next.unshift({ value, label: `${value} (未找到)` });
          return next;
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleSearch = (keyword: string) => {
    window.clearTimeout(searchTimer.current);
    searchTimer.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const resp = await employeesApi.list({
          keyword,
          pageSize: 20,
          ...(excludeResigned ? { employmentStatus: "FULL_TIME,PART_TIME" } : {}),
        });
        setOptions(resp.items.map(formatOption));
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const mergedOptions = useMemo(() => options, [options]);

  return (
    <Select
      value={value ?? undefined}
      onChange={(v) => onChange?.(v ?? null)}
      showSearch
      filterOption={false}
      onSearch={handleSearch}
      options={mergedOptions}
      loading={loading}
      placeholder={placeholder}
      disabled={disabled}
      allowClear={allowClear}
      style={{ width: "100%", ...style }}
      notFoundContent={loading ? "搜索中…" : "无匹配员工"}
    />
  );
}
