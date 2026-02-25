import type { ToolDetailType } from '@fastgpt/global/sdk/fastgpt-plugin';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';

export type ToolDetailExtendedType = ToolDetailType & {
  versionList?: Array<{
    value: string;
    description?: string;
    inputs?: Array<FlowNodeInputItemType>;
    outputs?: Array<FlowNodeOutputItemType>;
  }>;
  courseUrl?: string;
  readme?: string;
  userGuide?: string;
  currentCost?: number;
  hasSystemSecret?: boolean;
  secretInputConfig?: Array<{}>;
  inputList?: Array<FlowNodeInputItemType>;
  intro?: string;
};

export type ToolDetailResponseType = {
  tools: Array<ToolDetailExtendedType & { readme: string }>;
  downloadUrl: string;
};
