import { FlowNodeOutputItemType } from '@fastgpt/global/core/module/node/type';

export type RenderOutputProps = {
  outputs?: FlowNodeOutputItemType[];
  item: FlowNodeOutputItemType;
  moduleId: string;
};
