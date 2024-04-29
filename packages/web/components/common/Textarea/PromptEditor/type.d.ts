import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

export type EditorVariablePickerType = {
  key: string;
  label: string;
  icon?: string;
  valueType?: WorkflowIOValueTypeEnum;
};
