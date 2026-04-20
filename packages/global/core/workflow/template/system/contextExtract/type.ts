import type { WorkflowIOValueTypeEnum } from '../../../constants';

export type ContextExtractAgentItemType = {
  valueType:
    | WorkflowIOValueTypeEnum.string
    | WorkflowIOValueTypeEnum.number
    | WorkflowIOValueTypeEnum.boolean
    | WorkflowIOValueTypeEnum.arrayString
    | WorkflowIOValueTypeEnum.arrayNumber
    | WorkflowIOValueTypeEnum.arrayBoolean;
  desc: string;
  key: string;
  required: boolean;
  defaultValue?: string;
  enum?: string;
};
