import type { StoreWorkflow } from '@fastgpt/global/common/workflow/editor/protocol';

/** 运行与发布共用预检；只有通过预检的序列化文档才能打开测试面板。 */
export const runWorkflowTest = async ({
  serializeWorkflowAndCheck,
  open
}: {
  serializeWorkflowAndCheck: () => Promise<StoreWorkflow | undefined>;
  open: (data: StoreWorkflow) => void;
}) => {
  const data = await serializeWorkflowAndCheck();
  if (!data) return false;
  open(data);
  return true;
};
