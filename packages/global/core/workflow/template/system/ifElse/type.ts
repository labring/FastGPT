import type { ReferenceItemValueType, WorkflowReferenceSnapshot } from '../../../type/io';
import type { VariableConditionEnum } from './constant';

export type IfElseConditionType = 'AND' | 'OR';
export type ConditionListItemType = {
  variable?: ReferenceItemValueType;
  variableSnapshot?: WorkflowReferenceSnapshot;
  condition?: VariableConditionEnum;
  value?: string | ReferenceItemValueType;
  valueSnapshot?: WorkflowReferenceSnapshot;
  valueType?: 'input' | 'reference';
};
export type IfElseListItemType = {
  branchId?: string;
  condition: IfElseConditionType;
  list: ConditionListItemType[];
};
