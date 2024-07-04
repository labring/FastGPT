import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';

export const fnValueTypeSelect = [
  {
    label: WorkflowIOValueTypeEnum.string,
    value: WorkflowIOValueTypeEnum.string
  },
  {
    label: WorkflowIOValueTypeEnum.number,
    value: WorkflowIOValueTypeEnum.number
  },
  {
    label: WorkflowIOValueTypeEnum.boolean,
    value: WorkflowIOValueTypeEnum.boolean
  }
];
