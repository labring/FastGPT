import { FlowNodeInputTypeEnum } from '../../../node/constant';
import { ReferenceItemValueType, ReferenceValueType } from '../../..//type/io';
import { WorkflowIOValueTypeEnum } from '../../../constants';

export type TUpdateListItem = {
  variable?: ReferenceItemValueType;
  value?: ReferenceValueType; // input: ['',value], reference: [nodeId,outputId]
  valueType?: WorkflowIOValueTypeEnum;
  renderType: FlowNodeInputTypeEnum.input | FlowNodeInputTypeEnum.reference;
};
