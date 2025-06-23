import { FlowNodeTypeEnum } from '../node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum,
  VariableInputEnum
} from '../constants';
import { DispatchNodeResponseKeyEnum } from '../runtime/constants';
import type { FlowNodeInputItemType } from './io.d';
import { CustomInputItemType, FlowNodeOutputItemType } from './io.d';
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
import type { SecretValueType } from './../../../common/secret/type';
import type { I18nStringType } from '../../../common/i18n/type';

export type WorkflowTemplateBasicType = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig?: AppChatConfigType;
};
export type WorkflowTemplateType = {
  id: string;
  parentId?: ParentIdType;
  isFolder?: boolean;

  name: I18nStringType | string;
  avatar: string;
  intro?: I18nStringType | string;
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
  associatedPluginId?: string;
  userGuide?: string;

  templateType: string;

  // commercial plugin config
  originCost?: number; // n points/one time
  currentCost?: number;
  hasTokenFee?: boolean;
  pluginOrder?: number;

  isActive?: boolean;
  isOfficial?: boolean;

  // Admin config
  inputList?: FlowNodeInputItemType['inputList'];
  hasSystemSecret?: boolean;
};

export type SystemPluginTemplateListItemType = Omit<
  SystemPluginTemplateItemType,
  'name' | 'intro'
> & {
  name: string;
  intro: string;
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
