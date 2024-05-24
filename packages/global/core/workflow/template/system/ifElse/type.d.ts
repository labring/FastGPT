import { ReferenceValueProps } from 'core/workflow/type/io';
import { VariableConditionEnum } from './constant';

export type IfElseConditionType = 'AND' | 'OR';
export type ConditionListItemType = {
  variable?: ReferenceValueProps;
  condition?: VariableConditionEnum;
  value?: string;
};
export type IfElseListItemType = {
  condition: IfElseConditionType;
  list: ConditionListItemType[];
};
