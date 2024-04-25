import { ReferenceValueProps } from 'core/workflow/type/io';
import { VariableConditionEnum } from './constant';

export type IfElseConditionType = 'AND' | 'OR';
export type IfElseListItemType = {
  variable?: ReferenceValueProps;
  condition?: VariableConditionEnum;
  value?: string;
};
