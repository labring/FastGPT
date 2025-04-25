import type { FlowNodeTypeEnum } from '../node/constant';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum,
  VariableInputEnum
} from '../constants';
import { DispatchNodeResponseKeyEnum } from '../runtime/constants';
import type { FlowNodeInputItemType, FlowNodeOutputItemType } from './io.d';
import { UserModelSchema } from '../../../support/user/type';
import type { ChatHistoryItemResType } from '../../chat/type';
import {
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
import type { AppDetailType, AppSchema, McpToolConfigType } from '../../app/type';
import type { ParentIdType } from 'common/parentFolder/type';
import { AppTypeEnum } from '../../app/constants';
import type { WorkflowInteractiveResponseType } from '../template/system/interactive/type';

export type NodeToolConfigType = {
  mcpTool?: McpToolConfigType & {
    url: string;
  };
  systemTool?: {};
};

export type FlowNodeCommonType = {
  parentNodeId?: string;
  flowNodeType: FlowNodeTypeEnum; // render node card
  abandon?: boolean; // abandon node

  avatar?: string;
  name: string;
  intro?: string; // template list intro
  showStatus?: boolean; // chatting response step status

  version?: string;
  versionLabel?: string; // Just ui show
  isLatestVersion?: boolean; // Just ui show

  // data
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];

  // plugin data
  pluginId?: string;
  isFolder?: boolean;
  pluginData?: PluginDataType;

  // tool data
  toolData?: NodeToolConfigType;
};

export type PluginDataType = {
  diagram?: string;
  userGuide?: string;
  courseUrl?: string;
  name?: string;
  avatar?: string;
  error?: string;
};

type HandleType = {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
};
// system template
export type FlowNodeTemplateType = FlowNodeCommonType & {
  id: string; // node id, unique
  templateType: string;

  // show handle
  sourceHandle?: HandleType;
  targetHandle?: HandleType;

  // info
  isTool?: boolean; // can be connected by tool

  // action
  forbidDelete?: boolean; // forbid delete
  unique?: boolean;

  diagram?: string; // diagram url
  courseUrl?: string; // course url
  userGuide?: string; // user guide
};

export type NodeTemplateListItemType = {
  id: string; // 系统节点-系统节点的 id， 系统插件-插件的 id，团队应用的 id
  flowNodeType: FlowNodeTypeEnum; // render node card
  parentId?: ParentIdType;
  isFolder?: boolean;
  templateType: string;
  avatar?: string;
  name: string;
  intro?: string; // template list intro
  isTool?: boolean;
  authorAvatar?: string;
  author?: string;
  unique?: boolean; // 唯一的
  currentCost?: number; // 当前积分消耗
  hasTokenFee?: boolean; // 是否配置积分
  instructions?: string; // 使用说明
  courseUrl?: string; // 教程链接
  sourceMember?: SourceMember;
};

export type NodeTemplateListType = {
  type: string;
  label: string;
  list: NodeTemplateListItemType[];
}[];

// react flow node type
export type FlowNodeItemType = FlowNodeTemplateType & {
  nodeId: string;
  parentNodeId?: string;
  isError?: boolean;
  searchedText?: string;
  debugResult?: {
    status: 'running' | 'success' | 'skipped' | 'failed';
    message?: string;
    showResult?: boolean; // show and hide result modal
    response?: ChatHistoryItemResType;
    isExpired?: boolean;
    workflowInteractiveResponse?: WorkflowInteractiveResponseType;
  };
  isFolded?: boolean;
};

// store node type
export type StoreNodeItemType = FlowNodeCommonType & {
  nodeId: string;
  // isEntry: boolean;
  position?: {
    x: number;
    y: number;
  };
};
