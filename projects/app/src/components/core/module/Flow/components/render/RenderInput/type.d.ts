import { FlowNodeInputItemType } from '@fastgpt/global/core/module/node/type';

export type RenderInputProps = {
  inputs?: FlowNodeInputItemType[];
  item: FlowNodeInputItemType;
  moduleId: string;
};
