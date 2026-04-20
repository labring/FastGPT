import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

export type EditFieldModalProps = {
  defaultValue?: FlowNodeInputItemType;
  nodeId: string;
  onClose: () => void;
};
