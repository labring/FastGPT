import type { FlowNodeInputTypeEnum } from '../../../node/constant';
import type { ReferenceItemValueType, ReferenceValueType } from '../../..//type/io';
import type { WorkflowIOValueTypeEnum } from '../../../constants';

export type TUpdateListItem = {
  variable?: ReferenceItemValueType;
  value?: ReferenceValueType; // input: ['',value], reference: [nodeId,outputId]
  valueType?: WorkflowIOValueTypeEnum;
  renderType: FlowNodeInputTypeEnum.input | FlowNodeInputTypeEnum.reference;
};
