// apps/web/src/components/EmployeePicker.tsx
import { Select, type SelectProps } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { employeesApi } from "../services/employees";
import type { EmployeeListItem } from "../features/employees/types";
import { EMPLOYEE_BILLING_TAG_COLORS } from "../constants/dictionaries";

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
  const billingType = e.billingType && e.billingType !== "常规" ? e.billingType : null;
  return {
    value: e.jobNo,
    label: (
      <span>
        {`${e.jobNo} ${name}${suffix}`.trim()}
        {billingType ? (
          <span
            style={{
              display: "inline-block",
              marginLeft: 8,
              padding: "0 6px",
              borderRadius: 4,
              fontSize: 12,
              lineHeight: "18px",
              background: tagBgColor(billingType),
            }}
          >
            {billingType}
          </span>
        ) : null}
      </span>
    ),
  };
}

function tagBgColor(value: string): string {
  const color = EMPLOYEE_BILLING_TAG_COLORS[value] ?? "blue";
  const map: Record<string, string> = {
    gold: "#fff7e6",
    green: "#f6ffed",
    magenta: "#fff0f6",
    blue: "#e6f4ff",
  };
  return map[color] ?? "#e6f4ff";
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
