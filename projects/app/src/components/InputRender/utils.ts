import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { InputTypeEnum } from './constant';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export const formatInputType = ({
  inputType,
  valueType
}: {
  inputType?: VariableInputEnum | FlowNodeInputTypeEnum;
  valueType?: WorkflowIOValueTypeEnum;
}) => {
  if (inputType === VariableInputEnum.input) return InputTypeEnum.input;
  if (inputType === VariableInputEnum.textarea) return InputTypeEnum.textarea;
  if (inputType === VariableInputEnum.numberInput) return InputTypeEnum.numberInput;
  if (inputType === VariableInputEnum.select) return InputTypeEnum.select;

  if (inputType === FlowNodeInputTypeEnum.input) return InputTypeEnum.input;
  if (inputType === FlowNodeInputTypeEnum.textarea) return InputTypeEnum.textarea;
  if (inputType === FlowNodeInputTypeEnum.numberInput) return InputTypeEnum.numberInput;
  if (inputType === FlowNodeInputTypeEnum.switch) return InputTypeEnum.switch;
  if (inputType === FlowNodeInputTypeEnum.select) return InputTypeEnum.select;
  if (inputType === FlowNodeInputTypeEnum.multipleSelect) return InputTypeEnum.multipleSelect;
  if (inputType === FlowNodeInputTypeEnum.JSONEditor) return InputTypeEnum.JSONEditor;
  if (inputType === FlowNodeInputTypeEnum.selectLLMModel) return InputTypeEnum.selectLLMModel;
  if (inputType === FlowNodeInputTypeEnum.fileSelect) return InputTypeEnum.fileSelect;

  if (valueType === WorkflowIOValueTypeEnum.string) return InputTypeEnum.textarea;
  if (valueType === WorkflowIOValueTypeEnum.number) return InputTypeEnum.numberInput;
  if (valueType === WorkflowIOValueTypeEnum.boolean) return InputTypeEnum.switch;

  return InputTypeEnum.JSONEditor;
};
