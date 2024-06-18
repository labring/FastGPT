import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';

export type RenderInputProps = {
  inputs?: FlowNodeInputItemType[];
  item: FlowNodeInputItemType;
  nodeId: string;
};
