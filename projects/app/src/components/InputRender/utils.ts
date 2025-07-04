import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import { InputTypeEnum } from './constant';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { InputRenderProps } from './type';
import type {
  EditorVariableLabelPickerType,
  EditorVariablePickerType
} from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import type { UseFormReturn } from 'react-hook-form';

export const formatInputType = ({
  inputType,
  valueType
}: {
  inputType?: VariableInputEnum | FlowNodeInputTypeEnum;
  valueType?: WorkflowIOValueTypeEnum;
}) => {
  if (inputType === VariableInputEnum.input) {
    return InputTypeEnum.input;
  }
  if (inputType === VariableInputEnum.textarea) {
    return InputTypeEnum.textarea;
  }
  if (inputType === VariableInputEnum.numberInput) {
    return InputTypeEnum.numberInput;
  }
  if (inputType === VariableInputEnum.select) {
    return InputTypeEnum.select;
  }
  if (inputType === VariableInputEnum.custom) {
    return valueType2InputType(valueType);
  }

  if (inputType === FlowNodeInputTypeEnum.input) {
    return InputTypeEnum.input;
  }
  if (inputType === FlowNodeInputTypeEnum.textarea) {
    return InputTypeEnum.textarea;
  }
  if (inputType === FlowNodeInputTypeEnum.numberInput) {
    return InputTypeEnum.numberInput;
  }
  if (inputType === FlowNodeInputTypeEnum.switch) {
    return InputTypeEnum.switch;
  }
  if (inputType === FlowNodeInputTypeEnum.select) {
    return InputTypeEnum.select;
  }
  if (inputType === FlowNodeInputTypeEnum.multipleSelect) {
    return InputTypeEnum.multipleSelect;
  }
  if (inputType === FlowNodeInputTypeEnum.JSONEditor) {
    return InputTypeEnum.JSONEditor;
  }
  if (inputType === FlowNodeInputTypeEnum.selectLLMModel) {
    return InputTypeEnum.selectLLMModel;
  }
  if (inputType === FlowNodeInputTypeEnum.fileSelect) {
    return InputTypeEnum.fileSelect;
  }
  if (inputType === FlowNodeInputTypeEnum.custom) {
    return valueType2InputType(valueType);
  }

  return InputTypeEnum.JSONEditor;
};

export const valueType2InputType = (valueType?: WorkflowIOValueTypeEnum) => {
  if (valueType === WorkflowIOValueTypeEnum.string) {
    return InputTypeEnum.textarea;
  }
  if (valueType === WorkflowIOValueTypeEnum.number) {
    return InputTypeEnum.numberInput;
  }
  if (valueType === WorkflowIOValueTypeEnum.boolean) {
    return InputTypeEnum.switch;
  }

  return InputTypeEnum.JSONEditor;
};

export const formatRenderProps = ({
  inputType,
  value,
  onChange,

  placeholder,
  isInvalid,
  isDisabled,

  maxLength,
  variables,
  variableLabels,

  min,
  max,
  list,
  canSelectFile,
  canSelectImg,
  maxFiles,
  form,
  fieldName
}: {
  inputType: InputTypeEnum;
  value: any;
  onChange: (value: any) => void;

  placeholder?: string;
  isInvalid?: boolean;
  isDisabled?: boolean;

  maxLength?: number;
  min?: number;
  max?: number;
  list?: { label: string; value: string }[];

  canSelectFile?: boolean;
  canSelectImg?: boolean;
  maxFiles?: number;
  form?: UseFormReturn<any>;
  fieldName?: string;

  variables?: EditorVariablePickerType[];
  variableLabels?: EditorVariableLabelPickerType[];
}): InputRenderProps => {
  const baseProps = {
    inputType,
    value,
    onChange,
    placeholder,
    isInvalid,
    isDisabled
  };

  if (inputType === InputTypeEnum.input || inputType === InputTypeEnum.textarea) {
    return {
      ...baseProps,
      inputType,
      maxLength,
      variables,
      variableLabels
    };
  }

  if (inputType === InputTypeEnum.numberInput) {
    return {
      ...baseProps,
      inputType,
      min,
      max
    };
  }

  if (inputType === InputTypeEnum.select || inputType === InputTypeEnum.multipleSelect) {
    return {
      ...baseProps,
      inputType,
      list
    };
  }

  if (inputType === InputTypeEnum.selectLLMModel) {
    return {
      ...baseProps,
      inputType
    };
  }

  if (inputType === InputTypeEnum.fileSelect) {
    return {
      ...baseProps,
      inputType,
      canSelectFile,
      canSelectImg,
      maxFiles,
      form,
      fieldName
    };
  }

  return baseProps as InputRenderProps;
};
