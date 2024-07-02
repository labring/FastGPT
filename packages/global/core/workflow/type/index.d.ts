import { FlowNodeTypeEnum } from '../node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum,
  VariableInputEnum
} from '../constants';
import { DispatchNodeResponseKeyEnum } from '../runtime/constants';
import { CustomInputItemType, FlowNodeInputItemType, FlowNodeOutputItemType } from './io.d';
import { UserModelSchema } from '../../../support/user/type';
import {
  ChatHistoryItemResType,
  ChatItemType,
  ChatItemValueItemType,
  ToolRunResponseItemType,
  UserChatItemValueItemType
} from '../../chat/type';
import { ChatNodeUsageType } from '../../../support/wallet/bill/type';
import { RuntimeNodeItemType } from '../runtime/type';
import { PluginTypeEnum } from '../../plugin/constants';
import { RuntimeEdgeItemType, StoreEdgeItemType } from './edge';
import { NextApiResponse } from 'next';
import { AppChatConfigType, AppDetailType, AppSchema } from '../../app/type';
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

/* --------------- function type -------------------- */
export type SelectAppItemType = {
  id: string;
  // name: string;
  // logo?: string;
};

/* agent */
export type ClassifyQuestionAgentItemType = {
  value: string;
  key: string;
};
export type ContextExtractAgentItemType = {
  valueType: 'string' | 'number' | 'boolean';
  desc: string;
  key: string;
  required: boolean;
  defaultValue?: string;
  enum?: string;
};

/* -------------- running module -------------- */

export type ChatDispatchProps = {
  res?: NextApiResponse;
  mode: 'test' | 'chat' | 'debug';
  teamId: string;
  tmbId: string;
  user: UserModelSchema;
  app: AppDetailType | AppSchema;
  chatId?: string;
  responseChatItemId?: string;
  histories: ChatItemType[];
  variables: Record<string, any>; // global variable
  query: UserChatItemValueItemType[]; // trigger query
  stream: boolean;
  detail: boolean; // response detail
  maxRunTimes: number;
  isToolCall?: boolean;
};

export type ModuleDispatchProps<T> = ChatDispatchProps & {
  node: RuntimeNodeItemType;
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  params: T;
};
