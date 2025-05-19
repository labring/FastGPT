import { ReferenceItemValueType } from '../../../type/io';
import { VariableConditionEnum } from './constant';

export type IfElseConditionType = 'AND' | 'OR';
export type ConditionListItemType = {
  variable?: ReferenceItemValueType;
  condition?: VariableConditionEnum;
  value?: string;
};
export type IfElseListItemType = {
  condition: IfElseConditionType;
  list: ConditionListItemType[];
};
