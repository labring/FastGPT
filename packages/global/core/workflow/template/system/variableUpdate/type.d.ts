import type { FlowNodeInputTypeEnum } from '../../../node/constant';
import type { ReferenceItemValueType } from '../../../type/io';
import type { WorkflowIOValueTypeEnum } from '../../../constants';
import type { VariableUpdateOperatorEnum } from './constants';

export type TOperationValue = {
  operator: VariableUpdateOperatorEnum;
  value?: number | boolean | string;
};

export type TUpdateListItem = {
  variable?: ReferenceItemValueType;
  value?: ReferenceItemValueType | [string, string | TOperationValue];
  valueType?: WorkflowIOValueTypeEnum;
  renderType: FlowNodeInputTypeEnum.input | FlowNodeInputTypeEnum.reference;
};
