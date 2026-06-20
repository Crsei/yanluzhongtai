import { Descriptions, Form, InputNumber, Modal } from "antd";
import { useEffect } from "react";
import { usePayrollMutations } from "./hooks/usePayrollMutations";
import type { PayrollManualRow } from "./types";

type Props = {
  open: boolean;
  row: PayrollManualRow | null;
  onClose: () => void;
};

type FormValues = {
  paidAmount?: number;
};

export function SettleManualRecordDialog({ open, row, onClose }: Props) {
  const [form] = Form.useForm<FormValues>();
  const { settleManual } = usePayrollMutations();
  const maxAmount = row
    ? Math.max(0, Number((row.subtotalPayable - row.subtotalPaid).toFixed(2)))
    : 0;

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({ paidAmount: maxAmount });
  }, [open, maxAmount, form]);

  const onSubmit = async () => {
    if (!row) return;
    const values = await form.validateFields();
    await settleManual.mutateAsync({
      id: row.id,
      body: { paidAmount: String(values.paidAmount) },
    });
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      open={open}
      title="手动记录结算"
      width={520}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      onOk={onSubmit}
      okText="提交"
      cancelText="取消"
      confirmLoading={settleManual.isPending}
      destroyOnClose
    >
      {row ? (
        <>
          <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
            <Descriptions.Item label="老师">{row.employeeName}</Descriptions.Item>
            <Descriptions.Item label="所属年月">{row.period}</Descriptions.Item>
            <Descriptions.Item label="应结算">{row.subtotalPayable.toFixed(2)} 元</Descriptions.Item>
            <Descriptions.Item label="此前已结算">{row.subtotalPaid.toFixed(2)} 元</Descriptions.Item>
          </Descriptions>
          <Form<FormValues> form={form} layout="vertical">
            <Form.Item
              name="paidAmount"
              label="本次结算金额"
              rules={[
                { required: true, message: "请输入本次结算金额" },
                {
                  validator: (_, value) => {
                    if (value == null || value <= 0) {
                      return Promise.reject(new Error("本次结算金额必须大于 0"));
                    }
                    if (value > maxAmount) {
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
      ) : null}
    </Modal>
  );
}
