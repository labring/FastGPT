import { FlowNodeTypeEnum } from '../node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum,
  VariableInputEnum
} from '../constants';
import { DispatchNodeResponseKeyEnum } from '../runtime/constants';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from './io.d';
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
import { AppDetailType, AppSchema } from '../../app/type';
import { ParentIdType } from 'common/parentFolder/type';
import { AppTypeEnum } from 'core/app/constants';

export type FlowNodeCommonType = {
  flowNodeType: FlowNodeTypeEnum; // render node card

  avatar?: string;
  name: string;
  intro?: string; // template list intro
  showStatus?: boolean; // chatting response step status
  version: string;

  // data
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];

  // plugin data
  pluginId?: string;
  pluginType?: AppTypeEnum;
  // parentId: ParentIdType;
};

export type FlowNodeTemplateType = FlowNodeCommonType & {
  id: string; // node id, unique
  templateType: `${FlowNodeTemplateTypeEnum}`;

  // show handle
  sourceHandle?: {
    left: boolean;
    right: boolean;
    top: boolean;
    bottom: boolean;
  };
  targetHandle?: {
    left: boolean;
    right: boolean;
    top: boolean;
    bottom: boolean;
  };

  // info
  isTool?: boolean; // can be connected by tool

  // action
  forbidDelete?: boolean; // forbid delete
  unique?: boolean;
};
export type FlowNodeItemType = FlowNodeTemplateType & {
  nodeId: string;
  isError?: boolean;
  debugResult?: {
    status: 'running' | 'success' | 'skipped' | 'failed';
    message?: string;
    showResult?: boolean; // show and hide result modal
    response?: ChatHistoryItemResType;
    isExpired?: boolean;
  };
};
export type nodeTemplateListType = {
  type: `${FlowNodeTemplateTypeEnum}`;
  label: string;
  list: FlowNodeTemplateType[];
}[];

// store node type
export type StoreNodeItemType = FlowNodeCommonType & {
  nodeId: string;
  position?: {
    x: number;
    y: number;
  };
};

/* connection type */
export type NodeTargetNodeItemType = {
  nodeId: string;
  sourceHandle: string;
  targetHandle: string;
};
export type NodeSourceNodeItemType = {
  nodeId: string;
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
