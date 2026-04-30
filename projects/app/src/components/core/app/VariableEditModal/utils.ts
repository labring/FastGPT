import {
  WorkflowIOValueTypeEnum,
  textInputVariableValueTypes
} from '@fastgpt/global/core/workflow/constants';

// 对 text input 变量的 valueType 做 legacy 兜底：
// - undefined: 视为隐式 string，不清 defaultValue
// - 非法值: snap 回 string 并要求清空 defaultValue
// - 合法值: 原样保留
export const snapTextInputValueType = (
  valueType: WorkflowIOValueTypeEnum | undefined
): { valueType: WorkflowIOValueTypeEnum; resetDefault: boolean } => {
  if (valueType === undefined) {
    return { valueType: WorkflowIOValueTypeEnum.string, resetDefault: false };
  }
  if (!textInputVariableValueTypes.includes(valueType)) {
    return { valueType: WorkflowIOValueTypeEnum.string, resetDefault: true };
  }
  return { valueType, resetDefault: false };
};
