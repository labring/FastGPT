import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { InputTypeEnum, InputValueTypeEnum } from './index';

export const formatInputType = (type: VariableInputEnum | FlowNodeInputTypeEnum): InputTypeEnum => {
  switch (type) {
    case VariableInputEnum.select:
      return InputTypeEnum.select;
    case VariableInputEnum.custom:
      return InputTypeEnum.customVariable;

    case FlowNodeInputTypeEnum.select:
      return InputTypeEnum.select;
    case FlowNodeInputTypeEnum.customVariable:
      return InputTypeEnum.customVariable;
    case FlowNodeInputTypeEnum.fileSelect:
      return InputTypeEnum.fileSelect;
    case FlowNodeInputTypeEnum.selectLLMModel:
      return InputTypeEnum.selectLLMModel;
    case FlowNodeInputTypeEnum.JSONEditor:
      return InputTypeEnum.JSONEditor;

    default:
      return InputTypeEnum.input;
  }
};

export const formatInputValueType = (
  type?: WorkflowIOValueTypeEnum | string
): InputValueTypeEnum => {
  switch (type) {
    case WorkflowIOValueTypeEnum.string:
      return InputValueTypeEnum.string;
    case WorkflowIOValueTypeEnum.number:
      return InputValueTypeEnum.number;
    case WorkflowIOValueTypeEnum.boolean:
      return InputValueTypeEnum.boolean;
    default:
      return InputValueTypeEnum.object;
  }
};
