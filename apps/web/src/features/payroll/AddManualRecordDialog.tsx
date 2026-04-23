import { DatePicker, Form, InputNumber, Modal } from "antd";
import type { Dayjs } from "dayjs";
import { EmployeePicker } from "../../components/EmployeePicker";
import { usePayrollMutations } from "./hooks/usePayrollMutations";

type Props = {
  open: boolean;
  onClose: () => void;
};

type FormValues = {
  employeeJobNo: string;
  period: Dayjs;
  extraLabor: number;
  extraDeduction: number;
};

export function AddManualRecordDialog({ open, onClose }: Props) {
  const [form] = Form.useForm<FormValues>();
  const { addManual } = usePayrollMutations();

  const onSubmit = async () => {
    const values = await form.validateFields();
    await addManual.mutateAsync({
      employeeJobNo: values.employeeJobNo,
      settlementPeriod: values.period.format("YYYYMM"),
      extraLabor: String(values.extraLabor),
      extraDeduction: String(values.extraDeduction),
    });
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      open={open}
      title="手动添加薪酬记录"
      width={520}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      onOk={onSubmit}
      okText="提交"
      cancelText="取消"
      confirmLoading={addManual.isPending}
      destroyOnClose
    >
      <Form<FormValues> form={form} layout="vertical">
        <Form.Item
          name="employeeJobNo"
          label="员工"
          rules={[{ required: true, message: "请选择员工" }]}
        >
          <EmployeePicker
            excludeResigned={false}
            placeholder="选择员工(含已离职)"
          />
        </Form.Item>

        <Form.Item
          name="period"
          label="所属年月"
          rules={[{ required: true, message: "请选择所属年月" }]}
        >
          <DatePicker
            picker="month"
            format="YYYY-MM"
            style={{ width: "100%" }}
          />
        </Form.Item>

        <Form.Item
          name="extraLabor"
          label="其他劳务"
          rules={[
            { required: true, message: "请输入其他劳务金额" },
            {
              validator: (_, value) =>
                value == null || value > 0
                  ? Promise.resolve()
                  : Promise.reject(new Error("其他劳务必须大于 0")),
            },
          ]}
        >
          <InputNumber
            addonAfter="元"
            precision={2}
            min={0.01}
            style={{ width: "100%" }}
          />
        </Form.Item>

        <Form.Item
          name="extraDeduction"
          label="其他扣除"
          rules={[
            { required: true, message: "请输入其他扣除金额" },
            {
              validator: (_, value) => {
                if (value == null || value < 0) {
                  return Promise.reject(new Error("其他扣除不得小于 0"));
                }
                const labor = form.getFieldValue("extraLabor") as
                  | number
                  | undefined;
                if (labor != null && value === labor) {
                  return Promise.reject(
                    new Error("其他扣除不得等于其他劳务"),
                  );
                }
                return Promise.resolve();
              },
            },
          ]}
          dependencies={["extraLabor"]}
        >
          <InputNumber
            addonAfter="元"
            precision={2}
            min={0}
            style={{ width: "100%" }}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
