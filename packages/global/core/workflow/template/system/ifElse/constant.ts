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
  { label: '为空', value: VariableConditionEnum.isEmpty },
  { label: '不为空', value: VariableConditionEnum.isNotEmpty },
  { label: '等于', value: VariableConditionEnum.equalTo },
  { label: '不等于', value: VariableConditionEnum.notEqual },
  { label: '正则', value: VariableConditionEnum.reg },
  { label: '包含', value: VariableConditionEnum.include },
  { label: '不包含', value: VariableConditionEnum.notInclude },
  { label: '开始为', value: VariableConditionEnum.startWith },
  { label: '结束为', value: VariableConditionEnum.endWith }
];
export const numberConditionList = [
  { label: '为空', value: VariableConditionEnum.isEmpty },
  { label: '不为空', value: VariableConditionEnum.isNotEmpty },
  { label: '等于', value: VariableConditionEnum.equalTo },
  { label: '不等于', value: VariableConditionEnum.notEqual },
  { label: '大于', value: VariableConditionEnum.greaterThan },
  { label: '大于等于', value: VariableConditionEnum.greaterThanOrEqualTo },
  { label: '小于', value: VariableConditionEnum.lessThan },
  { label: '小于等于', value: VariableConditionEnum.lessThanOrEqualTo }
];
export const booleanConditionList = [
  { label: '为空', value: VariableConditionEnum.isEmpty },
  { label: '不为空', value: VariableConditionEnum.isNotEmpty },
  { label: '等于', value: VariableConditionEnum.equalTo }
];
export const arrayConditionList = [
  { label: '为空', value: VariableConditionEnum.isEmpty },
  { label: '不为空', value: VariableConditionEnum.isNotEmpty },
  { label: '包含', value: VariableConditionEnum.include },
  { label: '不包含', value: VariableConditionEnum.notInclude },
  { label: '长度等于', value: VariableConditionEnum.lengthEqualTo },
  { label: '长度不等于', value: VariableConditionEnum.lengthNotEqualTo },
  { label: '长度大于', value: VariableConditionEnum.lengthGreaterThan },
  { label: '长度大于等于', value: VariableConditionEnum.lengthGreaterThanOrEqualTo },
  { label: '长度小于', value: VariableConditionEnum.lengthLessThan },
  { label: '长度小于等于', value: VariableConditionEnum.lengthLessThanOrEqualTo }
];
export const objectConditionList = [
  { label: '为空', value: VariableConditionEnum.isEmpty },
  { label: '不为空', value: VariableConditionEnum.isNotEmpty }
];
export const allConditionList = [
  { label: '为空', value: VariableConditionEnum.isEmpty },
  { label: '不为空', value: VariableConditionEnum.isNotEmpty },
  { label: '等于', value: VariableConditionEnum.equalTo },
  { label: '不等于', value: VariableConditionEnum.notEqual },
  { label: '包含', value: VariableConditionEnum.include },
  { label: '不包含', value: VariableConditionEnum.notInclude },
  { label: '开始为', value: VariableConditionEnum.startWith },
  { label: '结束为', value: VariableConditionEnum.endWith },
  { label: '大于', value: VariableConditionEnum.greaterThan },
  { label: '大于等于', value: VariableConditionEnum.greaterThanOrEqualTo },
  { label: '小于', value: VariableConditionEnum.lessThan },
  { label: '小于等于', value: VariableConditionEnum.lessThanOrEqualTo },
  { label: '长度等于', value: VariableConditionEnum.lengthEqualTo },
  { label: '长度不等于', value: VariableConditionEnum.lengthNotEqualTo },
  { label: '长度大于', value: VariableConditionEnum.lengthGreaterThan },
  { label: '长度大于等于', value: VariableConditionEnum.lengthGreaterThanOrEqualTo },
  { label: '长度小于', value: VariableConditionEnum.lengthLessThan },
  { label: '长度小于等于', value: VariableConditionEnum.lengthLessThanOrEqualTo }
];
