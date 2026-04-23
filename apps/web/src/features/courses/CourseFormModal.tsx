import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Typography,
} from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { EmployeePicker } from "../../components/EmployeePicker";
import {
  COURSE_STATUS_LABELS,
  TEACHING_TYPE,
  TEACHING_TYPE_OPTIONS,
} from "../../constants/dictionaries";
import { useActiveOutline } from "./hooks/useCoursePickerOptions";
import { useCourseMutations } from "./hooks/useCourseMutations";
import { StudentPickerModal, type PickedStudent } from "./StudentPickerModal";
import type {
  CourseDetail,
  CreateCourseBody,
  UpdateCourseBody,
} from "./types";

type Mode = "create" | "edit" | "view";

type Props = {
  open: boolean;
  mode: Mode;
  course: CourseDetail | null;
  onClose: () => void;
};

function computeStatusLabel(
  plannedAt: Dayjs | null,
  durationMinutes: number | null,
  now = dayjs(),
): string {
  if (!plannedAt) return COURSE_STATUS_LABELS.NOT_SCHEDULED;
  if (durationMinutes && durationMinutes > 0) return COURSE_STATUS_LABELS.COMPLETED;
  return plannedAt.isAfter(now)
    ? COURSE_STATUS_LABELS.SCHEDULED
    : COURSE_STATUS_LABELS.IN_PROGRESS;
}

function roundCredit(mins: number | null): string {
  if (!mins || mins <= 0) return "—";
  return (Math.round((mins / 45) * 100) / 100).toFixed(2);
}

export function CourseFormModal({ open, mode, course, onClose }: Props) {
  const { versionsQ, activeVersionId, detailQ } = useActiveOutline();
  const { create, update } = useCourseMutations();
  const activeOutline = detailQ.data;
  const [sectionCode, setSectionCode] = useState<string | undefined>(undefined);
  const [categoryItemId, setCategoryItemId] = useState<string | undefined>(
    undefined,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [students, setStudents] = useState<PickedStudent[]>([]);
  const [form] = Form.useForm();

  const readOnly = mode === "view";

  const sections = activeOutline?.sections ?? [];
  const itemsBySection = useMemo(() => {
    const map = new Map<string, NonNullable<typeof activeOutline>["items"]>();
    for (const i of activeOutline?.items ?? []) {
      const bucket = map.get(i.sectionCode) ?? [];
      bucket.push(i);
      map.set(i.sectionCode, bucket);
    }
    return map;
  }, [activeOutline]);

  const suggestedType = useMemo(() => {
    if (!categoryItemId) return null;
    return (
      activeOutline?.items.find((i) => i.id === categoryItemId)
        ?.suggestedTeachingType ?? null
    );
  }, [categoryItemId, activeOutline]);

  const plannedAt = Form.useWatch("plannedAt", form) as Dayjs | null | undefined;
  const durationMinutes = Form.useWatch("durationMinutes", form) as
    | number
    | null
    | undefined;
  const statusLabel = computeStatusLabel(
    plannedAt ?? null,
    durationMinutes ?? null,
  );
  const creditLabel = roundCredit(durationMinutes ?? null);

  useEffect(() => {
    if (!open) return;
    if (mode === "create") {
      form.resetFields();
      setSectionCode(undefined);
      setCategoryItemId(undefined);
      setStudents([]);
      return;
    }
    if (!course) return;
    setSectionCode(course.sectionCode);
    setCategoryItemId(course.outlineItemId ?? undefined);
    setStudents(course.students);
    form.setFieldsValue({
      name: course.name,
      plannedAt: course.plannedAt ? dayjs(course.plannedAt) : null,
      actualTeacherJobNo: course.actualTeacherJobNo,
      actualTeachingType: course.actualTeachingType,
      durationMinutes: course.durationMinutes,
      replayUrl: course.replayUrl,
      videoUrl: course.videoUrl,
      resourceUrl: course.resourceUrl,
      note: course.note,
    });
  }, [open, mode, course, form]);

  const onFinish = async (values: {
    name: string;
    plannedAt?: Dayjs | null;
    actualTeacherJobNo?: string | null;
    actualTeachingType?: string | null;
    durationMinutes?: number | null;
    replayUrl?: string | null;
    videoUrl?: string | null;
    resourceUrl?: string | null;
    note?: string | null;
  }) => {
    if (!categoryItemId) return;
    const payload: CreateCourseBody | UpdateCourseBody = {
      outlineItemId: categoryItemId,
      name: values.name,
      plannedAt: values.plannedAt ? values.plannedAt.toISOString() : null,
      actualTeacherJobNo: values.actualTeacherJobNo ?? null,
      actualTeachingType:
        (values.actualTeachingType as CreateCourseBody["actualTeachingType"]) ??
        null,
      durationMinutes: values.durationMinutes ?? null,
      replayUrl: values.replayUrl ?? null,
      videoUrl: values.videoUrl ?? null,
      resourceUrl: values.resourceUrl ?? null,
      note: values.note ?? null,
      studentIds: students.map((s) => s.id),
    };

    if (mode === "create") {
      await create.mutateAsync(payload as CreateCourseBody);
    } else if (mode === "edit" && course) {
      await update.mutateAsync({ id: course.id, body: payload });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      title={mode === "create" ? "添加课程" : mode === "edit" ? "编辑课程" : "查看课程"}
      width={880}
      onCancel={onClose}
      destroyOnClose
      footer={
        readOnly ? (
          <Button onClick={onClose}>关闭</Button>
        ) : (
          <Space>
            <Button onClick={onClose}>取消</Button>
            <Button
              type="primary"
              loading={create.isPending || update.isPending}
              disabled={!categoryItemId}
              onClick={() => form.submit()}
            >
              保存
            </Button>
          </Space>
        )
      }
      styles={{ body: { maxHeight: "70vh", overflow: "auto" } }}
    >
      {!activeVersionId && !versionsQ.isLoading ? (
        <Alert
          type="warning"
          message="当前没有激活的大纲版本,无法添加课程。请先到「课程大纲」创建一个版本。"
        />
      ) : (
        <>
          <Form.Item label="来自课程大纲版本">
            <Input
              disabled
              value={activeOutline?.version.versionName ?? "加载中…"}
            />
          </Form.Item>
          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            disabled={readOnly}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              columnGap: 16,
            }}
          >
            <Form.Item label="课程编号">
              <Input disabled value={course?.courseNo ?? "保存后自动生成"} />
            </Form.Item>

            <Form.Item
              label="课程名称"
              name="name"
              rules={[{ required: true, message: "必填" }]}
            >
              <Input maxLength={120} />
            </Form.Item>

            <Form.Item label="课程所属板块" required>
              <Select
                placeholder="请选择板块"
                value={sectionCode}
                onChange={(v) => {
                  setSectionCode(v);
                  setCategoryItemId(undefined);
                }}
                options={sections.map((s) => ({
                  value: s.code,
                  label: `${s.name} (${s.code})`,
                }))}
              />
            </Form.Item>

            <Form.Item label="二级课程类别" required>
              <Select
                placeholder={sectionCode ? "请选择类别" : "请先选择板块"}
                disabled={!sectionCode}
                value={categoryItemId}
                onChange={(v) => {
                  setCategoryItemId(v);
                  const matched = activeOutline?.items.find((i) => i.id === v);
                  if (matched && !form.getFieldValue("name")) {
                    form.setFieldsValue({ name: matched.secondaryCategoryName });
                  }
                }}
                options={(itemsBySection.get(sectionCode ?? "") ?? []).map(
                  (i) => ({
                    value: i.id,
                    label: `${i.sequenceNo}. ${i.secondaryCategoryName}`,
                  }),
                )}
              />
            </Form.Item>

            <Form.Item label="建议授课方式">
              <Input disabled value={suggestedType ?? "—"} />
            </Form.Item>

            <Form.Item label="实际授课方式" name="actualTeachingType">
              <Select
                allowClear
                placeholder="请选择"
                options={TEACHING_TYPE_OPTIONS}
              />
            </Form.Item>

            <Form.Item label="计划授课时间" name="plannedAt">
              <DatePicker showTime style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item label="授课时长 (分钟)" name="durationMinutes">
              <InputNumber min={0} style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item label="课程状态 (自动测算)">
              <Input disabled value={statusLabel} />
            </Form.Item>

            <Form.Item label="授课课时 (自动计算)">
              <Input disabled value={creditLabel} />
            </Form.Item>

            <Form.Item
              label="实际授课老师"
              name="actualTeacherJobNo"
              style={{ gridColumn: "span 2" }}
            >
              <EmployeePicker placeholder="选择员工" allowClear />
            </Form.Item>

            <Form.Item label="选课学生" style={{ gridColumn: "span 2" }}>
              <Space.Compact style={{ display: "flex", width: "100%" }}>
                <Input
                  readOnly
                  value={students
                    .map((s) => `${s.name}(${s.studentNo})`)
                    .join(", ")}
                  placeholder="尚未选择学生"
                />
                <Button disabled={readOnly} onClick={() => setPickerOpen(true)}>
                  选择学生
                </Button>
              </Space.Compact>
            </Form.Item>

            <Form.Item label="回放链接" name="replayUrl">
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item label="录播链接" name="videoUrl">
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item
              label="资料链接"
              name="resourceUrl"
              style={{ gridColumn: "span 2" }}
            >
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item
              label="备注"
              name="note"
              style={{ gridColumn: "span 2" }}
            >
              <Input.TextArea rows={3} maxLength={5000} />
            </Form.Item>
          </Form>
          <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
            课程编号格式 TTKKYYNNN,保存后自动生成,不可修改;实际授课方式支持 {TEACHING_TYPE.join(" / ")}。
          </Typography.Paragraph>
        </>
      )}
      <StudentPickerModal
        open={pickerOpen}
        value={students}
        onClose={() => setPickerOpen(false)}
        onConfirm={(next) => {
          setStudents(next);
          setPickerOpen(false);
        }}
      />
    </Modal>
  );
}
