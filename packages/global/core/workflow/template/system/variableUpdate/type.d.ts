import { FlowNodeInputTypeEnum } from '../../../node/constant';
import { ReferenceValueProps } from '../../..//type/io';
import { WorkflowIOValueTypeEnum } from '../../../constants';

export type TUpdateListItem = {
  variable?: ReferenceValueProps;
  value: ReferenceValueProps;
  valueType?: WorkflowIOValueTypeEnum;
  renderType: FlowNodeInputTypeEnum.input | FlowNodeInputTypeEnum.reference;
};
