import type { PluginTextType } from '@fastgpt/global/core/plugin/type';
import type { GetMarketplaceToolDetailResponseType } from '@fastgpt/global/openapi/core/plugin/marketplace/api';
import type { GetTeamToolDetailResponseType } from '@fastgpt/global/openapi/core/plugin/team/tool/api';
import type {
  JSONSchemaInputType,
  JSONSchemaOutputType
} from '@fastgpt/global/core/app/jsonschema';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type {
  FlowNodeInputItemType,
  FlowNodeOutputItemType
} from '@fastgpt/global/core/workflow/type/io';

export type ToolDetailVersionType = {
  version: string;
  versionDescription?: PluginTextType;
};

export type ToolDetailExtendedType = {
  pluginId: string;
  id?: string;
  toolId?: string;
  parentId?: string;
  version?: string;
  name: PluginTextType;
  intro?: PluginTextType;
  description?: PluginTextType;
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
  inputSchema?: JSONSchemaInputType;
  outputSchema?: JSONSchemaOutputType;
  secretSchema?: JSONSchemaInputType;
  inputs?: FlowNodeInputItemType[];
  outputs?: FlowNodeOutputItemType[];
  courseUrl?: string;
  readme?: string;
  readmeUrl?: string;
  readmeUrls?: Partial<Record<localeType, string>>;
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

export type ToolDetailFetchResponse =
  | GetMarketplaceToolDetailResponseType
  | GetTeamToolDetailResponseType;
