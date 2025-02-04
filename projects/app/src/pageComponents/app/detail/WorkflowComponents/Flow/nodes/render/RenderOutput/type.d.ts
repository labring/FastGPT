import { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io.d';

export type RenderOutputProps = {
  outputs?: FlowNodeOutputItemType[];
  item: FlowNodeOutputItemType;
  nodeId: string;
};
