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
import { StoreEdgeItemType } from './edge';
import { AppChatConfigType } from '../../app/type';
import { ParentIdType } from 'common/parentFolder/type';
import { AppTypeEnum } from 'core/app/constants';
import { FlowNodeTemplateType, StoreNodeItemType } from './node';

export type WorkflowTemplateBasicType = {
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  chatConfig?: AppChatConfigType;
};
export type WorkflowTemplateType = {
  id: string;
  parentId?: ParentIdType;
  isFolder?: boolean;

  name: string;
  avatar: string;
  intro?: string;
  author?: string;
  courseUrl?: string;
  version: string;

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

  templateType: FlowNodeTemplateTypeEnum;
  isTool?: boolean;

  // commercial plugin config
  originCost: number; // n points/one time
  currentCost: number;

  isActive?: boolean;
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
