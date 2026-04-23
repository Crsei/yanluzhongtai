import {
  Alert,
  Descriptions,
  Form,
  InputNumber,
  Modal,
  Skeleton,
} from "antd";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { payrollApi } from "../../services/payroll";
import { usePayrollMutations } from "./hooks/usePayrollMutations";

type Props = {
  open: boolean;
  teacherJobNo: string;
  teacherName: string;
  period: string;
  onClose: () => void;
};

type FormValues = {
  hourlyRate?: number;
  paidAmount?: number;
};

export function SettleDialog({
  open,
  teacherJobNo,
  teacherName,
  period,
  onClose,
}: Props) {
  const [form] = Form.useForm<FormValues>();
  const { settle } = usePayrollMutations();

  const stateQ = useQuery({
    queryKey: ["payroll", "row", teacherJobNo, period],
    queryFn: () => payrollApi.rowState(teacherJobNo, period),
    enabled: open && Boolean(teacherJobNo) && Boolean(period),
  });

  const state = stateQ.data;
  const rateLocked = state?.hourlyRate != null;
  const maxAmount =
    state?.payable != null
      ? Math.max(0, Number((state.payable - state.alreadyPaid).toFixed(2)))
      : undefined;

  // Keep form in sync with the row state the dialog just loaded. Otherwise
  // a locked rate never gets written to the form value on first open.
  useEffect(() => {
    if (!open) return;
    if (rateLocked && state?.hourlyRate != null) {
      form.setFieldsValue({ hourlyRate: state.hourlyRate });
    }
  }, [open, rateLocked, state?.hourlyRate, form]);

  const onSubmit = async () => {
    const values = await form.validateFields();
    const rate = rateLocked
      ? state!.hourlyRate!
      : (values.hourlyRate as number);

    await settle.mutateAsync({
      employeeJobNo: teacherJobNo,
      settlementPeriod: period,
      hourlyRate: String(rate),
      paidAmount: String(values.paidAmount),
      extraLabor: "0",
      extraDeduction: "0",
    });
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      open={open}
      title="课时费结算"
      width={520}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      onOk={onSubmit}
      okText="提交"
      cancelText="取消"
      confirmLoading={settle.isPending}
      destroyOnClose
    >
      {stateQ.isLoading || !state ? (
        <Skeleton active />
      ) : (
        <>
          <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="老师">{teacherName}</Descriptions.Item>
            <Descriptions.Item label="所属年月">{period}</Descriptions.Item>
            <Descriptions.Item label="已授课时">
              {state.deliveredHours.toFixed(2)}
            </Descriptions.Item>
            <Descriptions.Item label="应结算总额">
              {state.payable != null
                ? `${state.payable.toFixed(2)} 元`
                : "— 元"}
            </Descriptions.Item>
            <Descriptions.Item label="此前已结算">
              {state.alreadyPaid.toFixed(2)} 元
            </Descriptions.Item>
          </Descriptions>

          {rateLocked ? (
            <Alert
              style={{ marginBottom: 12 }}
              type="info"
              showIcon
              message={`该月单位课时费已确定为 ${state.hourlyRate} 元/课时,不得修改`}
            />
          ) : (
            <Alert
              style={{ marginBottom: 12 }}
              type="warning"
              showIcon
              message="该月首次结算,请先输入单位课时费(确定后同月内不可再改)"
            />
          )}

          <Form<FormValues> form={form} layout="vertical">
            {!rateLocked ? (
              <Form.Item
                name="hourlyRate"
                label="单位课时费"
                rules={[
                  { required: true, message: "请输入单位课时费" },
                  {
                    validator: (_, value) =>
                      value == null || value > 0
                        ? Promise.resolve()
                        : Promise.reject(new Error("单位课时费必须大于 0")),
                  },
                ]}
              >
                <InputNumber
                  addonAfter="元/课时"
                  precision={2}
                  min={0.01}
                  style={{ width: "100%" }}
                  autoFocus
                />
              </Form.Item>
            ) : null}

            <Form.Item
              name="paidAmount"
              label="本次结算金额"
              rules={[
                { required: true, message: "请输入本次结算金额" },
                {
                  validator: (_, value) => {
                    if (value == null || value <= 0) {
                      return Promise.reject(
                        new Error("本次结算金额必须大于 0"),
                      );
                    }
                    if (maxAmount != null && value > maxAmount) {
                      return Promise.reject(
                        new Error(`最多可结算 ${maxAmount.toFixed(2)} 元`),
                      );
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <InputNumber
                addonAfter="元"
                precision={2}
                min={0.01}
                max={maxAmount}
                style={{ width: "100%" }}
              />
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}
