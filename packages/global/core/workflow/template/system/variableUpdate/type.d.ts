import { FlowNodeInputTypeEnum } from 'core/workflow/node/constant';

export type TUpdateListItem = {
  variable?: ReferenceValueProps;
  value?: ReferenceValueProps;
  renderType?: FlowNodeInputTypeEnum.input | FlowNodeInputTypeEnum.reference;
};
