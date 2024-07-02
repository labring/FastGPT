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
  chatConfigs?: AppChatConfigType;
};
export type WorkflowTemplateType = {
  id: string;
  parentId?: string;
  isFolder?: boolean;

  name: string;
  avatar: string;
  intro?: string;
  author?: string;
  version: string;

  showStatus?: boolean;
  weight?: number;

  workflow: WorkflowTemplateBasicType;
};
// template market
export type TemplateMarketItemType = WorkflowTemplateType & {
  tags?: { id: string; label: string }[];
};
// system plugin
export type SystemPluginTemplateItemType = WorkflowTemplateType & {
  templateType: FlowNodeTemplateTypeEnum;
  isTool?: boolean;

  originCost: number; // n points/one time
  currentCost: number;

  workflow: WorkflowTemplateBasicType;
};
