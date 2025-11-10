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
import { RuntimeEdgeItemType, StoreEdgeItemType } from './edge';
import { NextApiResponse } from 'next';
import type { AppDetailType, AppSchema, HttpToolConfigType } from '../../app/type';
import type { McpToolConfigType } from '../../app/tool/mcpTool/type';
import type { ParentIdType } from '../../../common/parentFolder/type';
import { AppTypeEnum } from '../../app/constants';
import type { WorkflowInteractiveResponseType } from '../template/system/interactive/type';
import type { StoreSecretValueType } from '../../../common/secret/type';
import type { PluginStatusType } from '../../plugin/type';

export type NodeToolConfigType = {
  mcpToolSet?: {
    toolId: string; // ObjectId of the MCP App
    url: string;
    headerSecret?: StoreSecretValueType;
    toolList: McpToolConfigType[];
  };
  mcpTool?: {
    toolId: string;
  };
  systemTool?: {
    toolId: string;
  };
  systemToolSet?: {
    toolId: string;
    toolList: {
      toolId: string;
      name: string;
      description: string;
    }[];
  };
  httpToolSet?: {
    toolList: HttpToolConfigType[];
    baseUrl?: string;
    apiSchemaStr?: string;
    customHeaders?: string;
    headerSecret?: StoreSecretValueType;
  };
  httpTool?: {
    toolId: string;
  };
};

export type FlowNodeCommonType = {
  parentNodeId?: string;
  flowNodeType: FlowNodeTypeEnum; // render node card
  abandon?: boolean; // abandon node

  avatar?: string;
  name: string;
  intro?: string; // template list intro
  toolDescription?: string;
  showStatus?: boolean; // chatting response step status

  version?: string;
  versionLabel?: string; // Just ui show
  isLatestVersion?: boolean; // Just ui show

  // data
  catchError?: boolean;
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];

  // plugin data
  pluginId?: string;
  isFolder?: boolean;
  pluginData?: PluginDataType;

  // tool data
  toolConfig?: NodeToolConfigType;

  // Not store, just computed
  currentCost?: number;
  systemKeyCost?: number;
  hasTokenFee?: boolean;
  hasSystemSecret?: boolean;
};

export type PluginDataType = {
  diagram?: string;
  userGuide?: string;
  courseUrl?: string;
  name?: string;
  avatar?: string;
  error?: string;
  status?: PluginStatusType;
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
  status?: PluginStatusType;

  showSourceHandle?: boolean;
  showTargetHandle?: boolean;

  // info
  isTool?: boolean; // can be connected by tool

  // action
  forbidDelete?: boolean; // forbid delete
  unique?: boolean;

  diagram?: string; // diagram url
  courseUrl?: string; // course url
  userGuide?: string; // user guide
  tags?: string[] | null;

  // @deprecated
  sourceHandle?: HandleType;
  targetHandle?: HandleType;
};

export type NodeTemplateListItemType = {
  id: string; // 系统节点-系统节点的 id， 系统插件-插件的 id，团队应用的 id
  flowNodeType: FlowNodeTypeEnum; // render node card
  parentId?: ParentIdType;
  isFolder?: boolean;
  templateType?: string;
  tags?: string[] | null;
  avatar?: string;
  name: string;
  intro?: string; // template list intro
  isTool?: boolean;
  authorAvatar?: string;
  author?: string;
  unique?: boolean; // 唯一的
  currentCost?: number; // 当前积分消耗
  systemKeyCost?: number; // 系统密钥费用，统一为数字
  hasTokenFee?: boolean; // 是否配置积分
  instructions?: string; // 使用说明
  courseUrl?: string; // 教程链接
  sourceMember?: SourceMember;
  toolSource?: 'uploaded' | 'built-in'; // Plugin source type
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
