// apps/web/src/features/employees/EmployeeFormModal.tsx
import {
  Button,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import {
  EMPLOYEE_BILLING_TYPES,
  EMPLOYEE_SERVING_FOR_OPTIONS,
  EMPLOYEE_SOURCE_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  GENDER_OPTIONS,
} from "../../constants/dictionaries";
import { EmployeeAttachmentUpload } from "./EmployeeAttachmentUpload";
import { useEmployeeMutations } from "./hooks/useEmployeeMutations";
import type {
  CreateEmployeeBody,
  EmployeeDetail,
  UpdateEmployeeBody,
} from "./types";

export type EmployeeFormMode = "create" | "view" | "edit";

type Props = {
  open: boolean;
  mode: EmployeeFormMode;
  employee?: EmployeeDetail | null;
  onClose: () => void;
  onModeChange?: (next: EmployeeFormMode) => void;
};

type FormValues = Omit<CreateEmployeeBody, "hireDate"> & {
  hireDate?: dayjs.Dayjs | null;
  billingChoice?: string;
  billingTypeCustom?: string;
};

const CUSTOM_BILLING_CHOICE = "__CUSTOM__";

function splitBillingType(value?: string | null) {
  const billingType = value?.trim() || "常规";
  if ((EMPLOYEE_BILLING_TYPES as readonly string[]).includes(billingType)) {
    return { billingChoice: billingType, billingTypeCustom: undefined };
  }
  return { billingChoice: CUSTOM_BILLING_CHOICE, billingTypeCustom: billingType };
}

function toFormValues(emp?: EmployeeDetail | null): FormValues {
  if (!emp) {
    return {
      name: "",
      jobTitle: "",
      hireDate: null,
      servingFor: [],
      attachmentKeys: [],
      ...splitBillingType(),
    } as unknown as FormValues;
  }
  return {
    ...splitBillingType(emp.billingType),
    name: emp.name,
    gender: (emp.gender as "男" | "女" | null) ?? undefined,
    employmentStatus: emp.employmentStatus ?? undefined,
    jobTitle: emp.jobTitle,
    hireDate: emp.hireDate ? dayjs(emp.hireDate) : null,
    phone: emp.phone ?? undefined,
    bankCardNo: emp.bankCardNo ?? undefined,
    bankName: emp.bankName ?? undefined,
    source: (emp.source ?? undefined) as CreateEmployeeBody["source"],
    servingFor: (emp.servingFor ?? []) as CreateEmployeeBody["servingFor"],
    resumeText: emp.resumeText ?? undefined,
    attachmentKeys: emp.attachmentKeys ?? [],
  };
}

export function EmployeeFormModal({ open, mode, employee, onClose, onModeChange }: Props) {
  const [form] = Form.useForm<FormValues>();
  const { createMutation, updateMutation } = useEmployeeMutations();
  const [submitting, setSubmitting] = useState(false);

  const readOnly = mode === "view";
  const billingChoice = Form.useWatch("billingChoice", form);
  const title = useMemo(() => {
    if (mode === "create") return "添加员工";
    if (mode === "view") return "查看员工";
    return "编辑员工";
  }, [mode]);

  useEffect(() => {
    if (open) {
      form.setFieldsValue(toFormValues(employee));
    } else {
      form.resetFields();
    }
  }, [open, employee, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const billingType =
        values.billingChoice === CUSTOM_BILLING_CHOICE
          ? values.billingTypeCustom?.trim()
          : values.billingChoice;
      const payload: CreateEmployeeBody | UpdateEmployeeBody = {
        ...values,
        billingType,
        hireDate: values.hireDate ? values.hireDate.toISOString() : undefined,
      };
      delete (payload as Record<string, unknown>).billingChoice;
      delete (payload as Record<string, unknown>).billingTypeCustom;
      if (mode === "create") {
        await createMutation.mutateAsync(payload as CreateEmployeeBody);
      } else if (mode === "edit" && employee) {
        await updateMutation.mutateAsync({ id: employee.id, body: payload });
      }
      onClose();
    } catch (err) {
      // form validation errors are surfaced inline; mutation errors handled by hook
    } finally {
      setSubmitting(false);
    }
  };

  const footer =
    mode === "view" ? (
      <Space>
        <Button onClick={onClose}>取消</Button>
        <Button type="primary" onClick={() => onModeChange?.("edit")}>
          编辑
        </Button>
      </Space>
    ) : (
      <Space>
        <Button onClick={onClose} disabled={submitting}>
          取消
        </Button>
        <Button type="primary" loading={submitting} onClick={handleSubmit}>
          确定
        </Button>
      </Space>
    );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title}
      width={920}
      destroyOnClose
      maskClosable={!submitting}
      bodyStyle={{ maxHeight: "70vh", overflowY: "auto" }}
      footer={footer}
    >
      <Form<FormValues>
        form={form}
        layout="vertical"
        disabled={readOnly}
        requiredMark={!readOnly}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="工号">
              <Input value={employee?.jobNo ?? "保存后生成"} disabled />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="员工姓名"
              name="name"
              rules={[
                { required: true, message: "请输入员工姓名" },
                { max: 50 },
              ]}
            >
              <Input placeholder="例：张三" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="计费方式"
              name="billingChoice"
              initialValue="常规"
              rules={[{ required: true, message: "请选择计费方式" }]}
            >
              <Select
                options={[
                  ...EMPLOYEE_BILLING_TYPES.map((value) => ({ value, label: value })),
                  { value: CUSTOM_BILLING_CHOICE, label: "自定义" },
                ]}
              />
            </Form.Item>
          </Col>
          {billingChoice === CUSTOM_BILLING_CHOICE ? (
            <Col span={12}>
              <Form.Item
                label="自定义计费方式"
                name="billingTypeCustom"
                rules={[
                  { required: true, message: "请输入自定义计费方式" },
                  { whitespace: true, message: "自定义计费方式不能为空" },
                  { max: 50 },
                ]}
              >
                <Input placeholder="例如：A类" maxLength={50} />
              </Form.Item>
            </Col>
          ) : null}
          <Col span={12}>
            <Form.Item
              label="性别"
              name="gender"
              rules={[{ required: true, message: "请选择性别" }]}
            >
              <Select options={GENDER_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="雇佣状态"
              name="employmentStatus"
              rules={[{ required: true, message: "请选择雇佣状态" }]}
            >
              <Select options={EMPLOYMENT_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="具体工作职责"
              name="jobTitle"
              rules={[
                { required: true, message: "请输入具体工作职责" },
                { max: 100 },
              ]}
            >
              <Input placeholder="例：考研规划师" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="入职日期" name="hireDate">
              <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="电话号码"
              name="phone"
              rules={[
                {
                  pattern: /^1[3-9]\d{9}$/,
                  message: "请输入合法手机号",
                  validateTrigger: "onBlur",
                },
              ]}
            >
              <Input placeholder="例：13800000000" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="员工来源" name="source">
              <Select allowClear options={EMPLOYEE_SOURCE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="正服务于" name="servingFor">
              <Select mode="multiple" allowClear options={EMPLOYEE_SERVING_FOR_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="银行卡号" name="bankCardNo">
              <Input />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="开户行" name="bankName">
              <Input />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="负责的课程">
              <Typography.Text type="secondary">
                （待课程模块上线后自动同步）
              </Typography.Text>
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="简历（文字版）" name="resumeText">
              <Input.TextArea rows={5} maxLength={5000} showCount />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="附件简历" name="attachmentKeys" valuePropName="value" trigger="onChange">
              <EmployeeAttachmentUpload disabled={readOnly} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
}
