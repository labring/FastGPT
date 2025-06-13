import { i18nT } from '../../../../../../web/i18n/utils';

export enum VariableConditionEnum {
  equalTo = 'equalTo',
  notEqual = 'notEqual',
  isEmpty = 'isEmpty',
  isNotEmpty = 'isNotEmpty',
  include = 'include',
  notInclude = 'notInclude',
  startWith = 'startWith',
  endWith = 'endWith',

  reg = 'reg',

  greaterThan = 'greaterThan',
  greaterThanOrEqualTo = 'greaterThanOrEqualTo',
  lessThan = 'lessThan',
  lessThanOrEqualTo = 'lessThanOrEqualTo',

  lengthEqualTo = 'lengthEqualTo',
  lengthNotEqualTo = 'lengthNotEqualTo',
  lengthGreaterThan = 'lengthGreaterThan',
  lengthGreaterThanOrEqualTo = 'lengthGreaterThanOrEqualTo',
  lengthLessThan = 'lengthLessThan',
  lengthLessThanOrEqualTo = 'lengthLessThanOrEqualTo'
}
export enum IfElseResultEnum {
  IF = 'IF',
  ELSE = 'ELSE',
  ELSE_IF = 'ELSE IF'
}

export const stringConditionList = [
  { label: i18nT('workflow:is_empty'), value: VariableConditionEnum.isEmpty },
  { label: i18nT('workflow:is_not_empty'), value: VariableConditionEnum.isNotEmpty },
  { label: i18nT('workflow:is_equal_to'), value: VariableConditionEnum.equalTo },
  { label: i18nT('workflow:is_not_equal'), value: VariableConditionEnum.notEqual },
  { label: i18nT('workflow:regex'), value: VariableConditionEnum.reg },
  { label: i18nT('workflow:contains'), value: VariableConditionEnum.include },
  { label: i18nT('workflow:not_contains'), value: VariableConditionEnum.notInclude },
  { label: i18nT('workflow:start_with'), value: VariableConditionEnum.startWith },
  { label: i18nT('workflow:end_with'), value: VariableConditionEnum.endWith }
];
export const numberConditionList = [
  { label: i18nT('workflow:is_empty'), value: VariableConditionEnum.isEmpty },
  { label: i18nT('workflow:is_not_empty'), value: VariableConditionEnum.isNotEmpty },
  { label: i18nT('workflow:is_equal_to'), value: VariableConditionEnum.equalTo },
  { label: i18nT('workflow:is_not_equal'), value: VariableConditionEnum.notEqual },
  { label: i18nT('workflow:greater_than'), value: VariableConditionEnum.greaterThan },
  {
    label: i18nT('workflow:greater_than_or_equal_to'),
    value: VariableConditionEnum.greaterThanOrEqualTo
  },
  { label: i18nT('workflow:less_than'), value: VariableConditionEnum.lessThan },
  { label: i18nT('workflow:less_than_or_equal_to'), value: VariableConditionEnum.lessThanOrEqualTo }
];
export const booleanConditionList = [
  { label: i18nT('workflow:is_empty'), value: VariableConditionEnum.isEmpty },
  { label: i18nT('workflow:is_not_empty'), value: VariableConditionEnum.isNotEmpty },
  { label: i18nT('workflow:is_equal_to'), value: VariableConditionEnum.equalTo }
];
export const arrayConditionList = [
  { label: i18nT('workflow:is_empty'), value: VariableConditionEnum.isEmpty },
  { label: i18nT('workflow:is_not_empty'), value: VariableConditionEnum.isNotEmpty },
  { label: i18nT('workflow:contains'), value: VariableConditionEnum.include },
  { label: i18nT('workflow:not_contains'), value: VariableConditionEnum.notInclude },
  { label: i18nT('workflow:length_equal_to'), value: VariableConditionEnum.lengthEqualTo },
  { label: i18nT('workflow:length_not_equal_to'), value: VariableConditionEnum.lengthNotEqualTo },
  { label: i18nT('workflow:length_greater_than'), value: VariableConditionEnum.lengthGreaterThan },
  {
    label: i18nT('workflow:length_greater_than_or_equal_to'),
    value: VariableConditionEnum.lengthGreaterThanOrEqualTo
  },
  { label: i18nT('workflow:length_less_than'), value: VariableConditionEnum.lengthLessThan },
  {
    label: i18nT('workflow:length_less_than_or_equal_to'),
    value: VariableConditionEnum.lengthLessThanOrEqualTo
  }
];
export const objectConditionList = [
  { label: i18nT('workflow:is_empty'), value: VariableConditionEnum.isEmpty },
  { label: i18nT('workflow:is_not_empty'), value: VariableConditionEnum.isNotEmpty }
];
export const allConditionList = [
  { label: i18nT('workflow:is_empty'), value: VariableConditionEnum.isEmpty },
  { label: i18nT('workflow:is_not_empty'), value: VariableConditionEnum.isNotEmpty },
  { label: i18nT('workflow:is_equal_to'), value: VariableConditionEnum.equalTo },
  { label: i18nT('workflow:is_not_equal'), value: VariableConditionEnum.notEqual },
  { label: i18nT('workflow:contains'), value: VariableConditionEnum.include },
  { label: i18nT('workflow:not_contains'), value: VariableConditionEnum.notInclude },
  { label: i18nT('workflow:start_with'), value: VariableConditionEnum.startWith },
  { label: i18nT('workflow:end_with'), value: VariableConditionEnum.endWith },
  { label: i18nT('workflow:greater_than'), value: VariableConditionEnum.greaterThan },
  {
    label: i18nT('workflow:greater_than_or_equal_to'),
    value: VariableConditionEnum.greaterThanOrEqualTo
  },
  { label: i18nT('workflow:less_than'), value: VariableConditionEnum.lessThan },
  {
    label: i18nT('workflow:less_than_or_equal_to'),
    value: VariableConditionEnum.lessThanOrEqualTo
  },
  { label: i18nT('workflow:length_equal_to'), value: VariableConditionEnum.lengthEqualTo },
  { label: i18nT('workflow:length_not_equal_to'), value: VariableConditionEnum.lengthNotEqualTo },
  { label: i18nT('workflow:length_greater_than'), value: VariableConditionEnum.lengthGreaterThan },
  {
    label: i18nT('workflow:length_greater_than_or_equal_to'),
    value: VariableConditionEnum.lengthGreaterThanOrEqualTo
  },
  { label: i18nT('workflow:length_less_than'), value: VariableConditionEnum.lengthLessThan },
  {
    label: i18nT('workflow:length_less_than_or_equal_to'),
    value: VariableConditionEnum.lengthLessThanOrEqualTo
  }
];
export const renderNumberConditionList = new Set<VariableConditionEnum>([
  VariableConditionEnum.greaterThan,
  VariableConditionEnum.greaterThanOrEqualTo,
  VariableConditionEnum.lessThan,
  VariableConditionEnum.lessThanOrEqualTo,
  VariableConditionEnum.lengthEqualTo,
  VariableConditionEnum.lengthNotEqualTo,
  VariableConditionEnum.lengthGreaterThan,
  VariableConditionEnum.lengthGreaterThanOrEqualTo,
  VariableConditionEnum.lengthLessThan,
  VariableConditionEnum.lengthLessThanOrEqualTo
]);
