export enum VariableUpdateOperatorEnum {
  set = 'set',
  add = 'add',
  sub = 'sub',
  mul = 'mul',
  div = 'div',
  negate = 'negate'
}

export const BooleanSelectValueEnum = {
  setTrue: `${VariableUpdateOperatorEnum.set}:true`,
  setFalse: `${VariableUpdateOperatorEnum.set}:false`,
  negate: VariableUpdateOperatorEnum.negate
};
