import { FlowNodeTypeEnum } from '../node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum,
  VariableInputEnum
} from '../constants';
import { DispatchNodeResponseKeyEnum } from '../runtime/constants';
import { CustomInputItemType, FlowNodeInputItemType, FlowNodeOutputItemType } from './io.d';
import {
  ChatHistoryItemResType,
  ChatItemType,
  ChatItemValueItemType,
  ToolRunResponseItemType
} from '../../chat/type';
import { ChatNodeUsageType } from '../../../support/wallet/bill/type';
import { PluginTypeEnum } from '../../plugin/constants';
import type { StoreEdgeItemType } from './edge';
import type { AppChatConfigType } from '../../app/type';
import type { ParentIdType } from 'common/parentFolder/type';
import type { AppTypeEnum } from 'core/app/constants';
import type { StoreNodeItemType } from './node';
import { FlowNodeTemplateType } from './node';

export type localeType = 'en' | 'zh-CN' | 'zh-Hant';
export type I18nStringType =
  | {
      'zh-CN': string;
      'zh-Hant'?: string;
      en?: string;
    }
  | string;

export type WorkflowTemplateBasicType = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig?: AppChatConfigType;
};
export type WorkflowTemplateType = {
  id: string;
  parentId?: ParentIdType;
  isFolder?: boolean;

  name: I18nStringType;
  avatar: string;
  intro?: I18nStringType;
  author?: string;
  courseUrl?: string;

  version?: string;
  versionLabel?: string;
  isLatestVersion?: boolean;

  showStatus?: boolean;
  weight?: number;

  workflow: WorkflowTemplateBasicType;
};

// template market
export type TemplateMarketItemType = WorkflowTemplateType & {
  tags: string[];
  type: AppTypeEnum.simple | AppTypeEnum.workflow | AppTypeEnum.plugin;
};
// template market list
export type TemplateMarketListItemType = {
  id: string;
  name: string;
  intro?: string;
  author?: string;
  tags: string[];
  type: AppTypeEnum.simple | AppTypeEnum.workflow | AppTypeEnum.plugin;
  avatar: string;
};

// system plugin
export type SystemPluginTemplateItemType = WorkflowTemplateType & {
  customWorkflow?: string;
  associatedPluginId?: string;
  userGuide?: string;

  templateType: string;
  isTool?: boolean;

  // commercial plugin config
  originCost: number; // n points/one time
  currentCost: number;
  hasTokenFee: boolean;
  pluginOrder: number;

  isActive?: boolean;
  isOfficial?: boolean;
  inputConfig?: {
    // Render config input form. Find the corresponding node and replace the variable directly
    key: string;
    label: string;
    description: string;
    value?: any;
  }[];
};

export type THelperLine = {
  position: number;
  nodes: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  }[];
};
