import { Checkbox, Input, Modal, Spin, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { studentsApi } from "../../services/students";
import type { CoursePickedStudent } from "./types";

export type PickedStudent = CoursePickedStudent;

type Props = {
  open: boolean;
  value: PickedStudent[];
  onClose: () => void;
  onConfirm: (next: PickedStudent[]) => void;
};

export function StudentPickerModal({ open, value, onClose, onConfirm }: Props) {
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<PickedStudent[]>(value);

  useEffect(() => {
    if (open) setSelected(value);
  }, [open, value]);

  const listQ = useQuery({
    queryKey: ["students", "picker", keyword],
    queryFn: () => studentsApi.list({ keyword, pageSize: 200 }),
    enabled: open,
  });

  const selectedIds = useMemo(
    () => new Set(selected.map((s) => s.id)),
    [selected],
  );

  const toggle = (item: PickedStudent, checked: boolean) => {
    setSelected((prev) =>
      checked ? [...prev, item] : prev.filter((s) => s.id !== item.id),
    );
  };

  return (
    <Modal
      open={open}
      title="选择学生"
      onCancel={onClose}
      onOk={() => onConfirm(selected)}
      okText="确认选择"
      cancelText="取消"
      destroyOnClose
      width={560}
    >
      <Input.Search
        placeholder="按学号 / 姓名搜索"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        allowClear
        style={{ marginBottom: 12 }}
      />
      <div
        style={{
          maxHeight: 360,
          overflow: "auto",
          border: "1px solid #f0f0f0",
          borderRadius: 8,
          padding: 8,
        }}
      >
        {listQ.isLoading ? (
          <Spin />
        ) : (
          (listQ.data?.items ?? []).map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "6px 4px",
                gap: 8,
              }}
            >
              <Checkbox
                checked={selectedIds.has(s.id)}
                onChange={(e) =>
                  toggle(
                    {
                      id: s.id,
                      studentNo: s.studentNo,
                      name: s.name,
                      servicePlatform: s.servicePlatform,
                      grade: s.grade,
                    },
                    e.target.checked,
                  )
                }
              />
              <Typography.Text strong>{s.name}</Typography.Text>
              <Typography.Text type="secondary">
                {s.studentNo} · {s.grade ?? "-"}
              </Typography.Text>
            </div>
          ))
        )}
      </div>
      <Typography.Text type="secondary" style={{ marginTop: 8, display: "block" }}>
        已选 {selected.length} 人
      </Typography.Text>
    </Modal>
  );
}
