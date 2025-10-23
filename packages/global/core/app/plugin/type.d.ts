import type { StoreEdgeItemType } from 'core/workflow/type/edge';
import { ModuleTemplateTypeEnum } from '../../workflow/constants';
import type { StoreNodeItemType } from '../../workflow/type/node';
import { MethodType } from './controller';
import type { FlowNodeTemplateType } from '../../workflow/type/node';
import type { WorkflowTemplateType } from '../../workflow/type';
import type { FlowNodeInputItemType, FlowNodeOutputItemType } from '../../workflow/type/io';
import type { ParentIdType } from 'common/parentFolder/type';
import type { I18nStringStrictType } from '@fastgpt/global/sdk/fastgpt-plugin';
import type { I18nStringType } from '../../../common/i18n/type';

export type PluginTagType = {
  tagId: string;
  tagName: I18nStringStrictType | string;
  tagOrder: number;
  isSystem: boolean;
};

export type PluginRuntimeType = {
  id: string;
  teamId?: string;
  tmbId?: string;

  name: string;
  avatar: string;
  showStatus?: boolean;
  isTool?: boolean;
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  currentCost?: number;
  systemKeyCost?: number;
  hasTokenFee?: boolean;
};

// system plugin
export type SystemPluginTemplateItemType = WorkflowTemplateType & {
  pluginTags?: string[];

  // FastGPT-plugin tool
  inputs?: FlowNodeInputItemType[];
  outputs?: FlowNodeOutputItemType[];
  versionList?: {
    value: string;
    description?: string;

    inputs: FlowNodeInputItemType[];
    outputs: FlowNodeOutputItemType[];
  }[];

  // Admin workflow tool
  associatedPluginId?: string;
  userGuide?: string;

  // commercial plugin config
  originCost?: number; // n points/one time
  currentCost?: number;
  systemKeyCost?: number;
  hasTokenFee?: boolean;
  pluginOrder?: number;

  status?: number;
  defaultInstalled?: boolean;
  isOfficial?: boolean;

  // Admin config
  inputList?: FlowNodeInputItemType['inputList'];
  inputListVal?: Record<string, any>;
  hasSystemSecret?: boolean;

  // Plugin source type
  toolSource?: 'uploaded' | 'built-in';

  // @deprecated use pluginTags instead
  isActive?: boolean;
  templateType?: string;
};

export type SystemPluginTemplateListItemType = Omit<
  SystemPluginTemplateItemType,
  'name' | 'intro' | 'workflow'
> & {
  name: string;
  intro: string;
  tags?: PluginTagType[];
};

// Marketplace Tool Types
export type ToolVersionListItemType = {
  value: string;
  description?: string;
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
};

export type SecretInputConfigType = {
  key: string;
  label: I18nStringType;
  description?: I18nStringType;
  required?: boolean;
  type?: 'input' | 'textarea';
};

export type ToolListItem = {
  description: I18nStringType;
  id: string; // toolId
  name: I18nStringType;
  avatar: string; // 头像 url，是某个直接可以访问的地址
  author?: string;
  tags: string[]; // emptyable
  downloadCount: number; // 一期不搞，都返回 0
};

export type ToolDetail = ToolListItem & {
  downloadUrl: string;
  versionList: ToolVersionListItemType[];
  secretInputConfig: SecretInputConfigType[];
  children?: ToolDetail[]; // tool when children is undefined
  courseUrl?: string;
  readme?: string; // markdown source code, need to be rendered
};
