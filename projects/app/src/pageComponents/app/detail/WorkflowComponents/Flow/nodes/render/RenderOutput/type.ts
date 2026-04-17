import type { FlowNodeOutputItemType } from '@fastgpt/global/core/workflow/type/io';

export type RenderOutputProps = {
  outputs?: FlowNodeOutputItemType[];
  item: FlowNodeOutputItemType;
  nodeId: string;
};
