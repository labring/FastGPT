import { WorkflowIOValueTypeEnum } from '../../../constants';

export type ContextExtractAgentItemType = {
  valueType:
    | WorkflowIOValueTypeEnum.string
    | WorkflowIOValueTypeEnum.number
    | WorkflowIOValueTypeEnum.boolean;
  desc: string;
  key: string;
  required: boolean;
  defaultValue?: string;
  enum?: string;
};
