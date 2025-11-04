import type { StoreEdgeItemType } from 'core/workflow/type/edge';
import { ModuleTemplateTypeEnum } from '../../workflow/constants';
import type { StoreNodeItemType } from '../../workflow/type/node';
import { MethodType } from './controller';
import type { FlowNodeTemplateType } from '../../workflow/type/node';
import type { WorkflowTemplateType } from '../../workflow/type';
import type { FlowNodeInputItemType, FlowNodeOutputItemType } from '../../workflow/type/io';
import type { ParentIdType } from 'common/parentFolder/type';
import type { I18nStringStrictType } from '../../../common/i18n/type';
import type { I18nStringType } from '../../../common/i18n/type';
import type { ToolSimpleType, ToolDetailType } from '../../../sdk/fastgpt-plugin';
import type { PluginStatusType, SystemPluginToolTagType } from '../../plugin/type';

export type AppToolRuntimeType = {
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

// System tool
export type AppToolTemplateItemType = WorkflowTemplateType & {
  status?: PluginStatusType;
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

  tags?: string[] | null;
  defaultInstalled?: boolean;
  isOfficial?: boolean;

  // Admin config
  inputList?: FlowNodeInputItemType['inputList'];
  inputListVal?: Record<string, any>;
  hasSystemSecret?: boolean;

  // @deprecated use tags instead
  isActive?: boolean;
  templateType?: string;
};

export type AppToolTemplateListItemType = Omit<
  AppToolTemplateItemType,
  'name' | 'intro' | 'workflow'
> & {
  name: string;
  intro: string;
  tags?: SystemPluginToolTagType[];
};
