import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { InputTypeEnum } from './constant';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { InputConfigType } from '@fastgpt/global/core/workflow/type/io';

export const variableInputTypeToInputType = (
  inputType: VariableInputEnum,
  valueType?: WorkflowIOValueTypeEnum
) => {
  if (inputType === VariableInputEnum.input) return InputTypeEnum.input;
  if (inputType === VariableInputEnum.textarea) return InputTypeEnum.textarea;
  if (inputType === VariableInputEnum.numberInput) return InputTypeEnum.numberInput;
  if (inputType === VariableInputEnum.select) return InputTypeEnum.select;
  if (inputType === VariableInputEnum.multipleSelect) return InputTypeEnum.multipleSelect;
  if (inputType === VariableInputEnum.switch) return InputTypeEnum.switch;
  if (inputType === VariableInputEnum.password) return InputTypeEnum.password;
  if (inputType === VariableInputEnum.file) return InputTypeEnum.fileSelect;
  if (inputType === VariableInputEnum.timePointSelect) return InputTypeEnum.timePointSelect;
  if (inputType === VariableInputEnum.timeRangeSelect) return InputTypeEnum.timeRangeSelect;
  if (inputType === VariableInputEnum.datasetSelect) return InputTypeEnum.selectDataset;
  if (inputType === VariableInputEnum.llmSelect) return InputTypeEnum.selectLLMModel;
  if (inputType === VariableInputEnum.custom || inputType === VariableInputEnum.internal)
    return valueTypeToInputType(valueType);
  return InputTypeEnum.JSONEditor;
};

// 节点输入类型（通常是一个 reference+一个 form input）
export const nodeInputTypeToInputType = (inputTypes: FlowNodeInputTypeEnum[] = []) => {
  const inputType = inputTypes?.find((item) => item !== FlowNodeInputTypeEnum.reference);

  if (inputType === FlowNodeInputTypeEnum.input) return InputTypeEnum.input;
  if (inputType === FlowNodeInputTypeEnum.textarea) return InputTypeEnum.textarea;
  if (inputType === FlowNodeInputTypeEnum.password) return InputTypeEnum.password;
  if (inputType === FlowNodeInputTypeEnum.numberInput) return InputTypeEnum.numberInput;
  if (inputType === FlowNodeInputTypeEnum.switch) return InputTypeEnum.switch;
  if (inputType === FlowNodeInputTypeEnum.select) return InputTypeEnum.select;
  if (inputType === FlowNodeInputTypeEnum.multipleSelect) return InputTypeEnum.multipleSelect;
  if (inputType === FlowNodeInputTypeEnum.JSONEditor) return InputTypeEnum.JSONEditor;
  if (inputType === FlowNodeInputTypeEnum.selectLLMModel) return InputTypeEnum.selectLLMModel;
  if (inputType === FlowNodeInputTypeEnum.fileSelect) return InputTypeEnum.fileSelect;
  if (inputType === FlowNodeInputTypeEnum.timePointSelect) return InputTypeEnum.timePointSelect;
  if (inputType === FlowNodeInputTypeEnum.timeRangeSelect) return InputTypeEnum.timeRangeSelect;
  return InputTypeEnum.textarea;
};

export const valueTypeToInputType = (valueType?: WorkflowIOValueTypeEnum) => {
  if (valueType === WorkflowIOValueTypeEnum.string) return InputTypeEnum.input;
  if (valueType === WorkflowIOValueTypeEnum.number) return InputTypeEnum.numberInput;
  if (valueType === WorkflowIOValueTypeEnum.boolean) return InputTypeEnum.switch;
  if (valueType === WorkflowIOValueTypeEnum.object) return InputTypeEnum.JSONEditor;
  if (valueType === WorkflowIOValueTypeEnum.arrayString) return InputTypeEnum.JSONEditor;
  if (valueType === WorkflowIOValueTypeEnum.arrayNumber) return InputTypeEnum.JSONEditor;
  if (valueType === WorkflowIOValueTypeEnum.arrayBoolean) return InputTypeEnum.JSONEditor;
  if (valueType === WorkflowIOValueTypeEnum.arrayObject) return InputTypeEnum.JSONEditor;
  if (valueType === WorkflowIOValueTypeEnum.arrayAny) return InputTypeEnum.JSONEditor;
  if (valueType === WorkflowIOValueTypeEnum.chatHistory) return InputTypeEnum.JSONEditor;
  if (valueType === WorkflowIOValueTypeEnum.datasetQuote) return InputTypeEnum.JSONEditor;
  if (valueType === WorkflowIOValueTypeEnum.dynamic) return InputTypeEnum.JSONEditor;
  if (valueType === WorkflowIOValueTypeEnum.selectDataset) return InputTypeEnum.JSONEditor;
  if (valueType === WorkflowIOValueTypeEnum.selectApp) return InputTypeEnum.JSONEditor;
  if (valueType === WorkflowIOValueTypeEnum.any) return InputTypeEnum.textarea;

  return InputTypeEnum.textarea;
};

export const secretInputTypeToInputType = (inputType: InputConfigType['inputType']) => {
  if (inputType === 'input') return InputTypeEnum.input;
  if (inputType === 'numberInput') return InputTypeEnum.numberInput;
  if (inputType === 'switch') return InputTypeEnum.switch;
  if (inputType === 'select') return InputTypeEnum.select;
  return InputTypeEnum.textarea;
};
