import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

export type RenderInputProps = {
  inputs?: FlowNodeInputItemType[];
  item: FlowNodeInputItemType;
  nodeId: string;
};
