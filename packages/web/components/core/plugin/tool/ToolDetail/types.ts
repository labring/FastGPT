import type { I18nStringType } from '@fastgpt/global/sdk/fastgpt-plugin';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';

export type ToolDetailVersionType = {
  version: string;
  versionDescription?: string;
};

export type ToolDetailExtendedType = {
  pluginId: string;
  id?: string;
  toolId?: string;
  parentId?: string;
  version?: string;
  name: I18nStringType | string;
  intro?: I18nStringType | string;
  description?: I18nStringType | string;
  icon?: string;
  avatar?: string;
  author?: string;
  tags?: string[];
  currentCost?: number;
  systemKeyCost?: number;
  hasSystemSecret?: boolean;
  secrets?: unknown[];
  secretInputConfig?: unknown[];
  inputList?: unknown[];
  courseUrl?: string;
  readme?: string;
  readmeUrl?: string;
  userGuide?: string | null;
  versionList: {
    inputs: FlowNodeInputItemType[];
    outputs: FlowNodeOutputItemType[];
  }[];
};

export type ToolDetailResponseType = {
  tools: ToolDetailExtendedType[];
  downloadUrl?: string;
  downloadCount?: number;
};

export type ToolDetailFetchResponse = ToolDetailResponseType | Record<string, any>;
