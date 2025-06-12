import type { ReferenceItemValueType } from '../../../type/io';
import type { VariableConditionEnum } from './constant';

export type IfElseConditionType = 'AND' | 'OR';
export type ConditionValueType =
  | { type: 'input'; value: string }
  | { type: 'reference'; value: ReferenceItemValueType };
export type ConditionListItemType = {
  variable?: ReferenceItemValueType;
  condition?: VariableConditionEnum;
  value?: ConditionValueType;
};
export type IfElseListItemType = {
  condition: IfElseConditionType;
  list: ConditionListItemType[];
};
