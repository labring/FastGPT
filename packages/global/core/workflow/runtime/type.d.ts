import { ChatNodeUsageType } from '../../../support/wallet/bill/type';
import {
  ChatItemType,
  UserChatItemValueItemType,
  ChatItemValueItemType,
  ToolRunResponseItemType
} from '../../chat/type';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from '../type/io.d';
import { StoreNodeItemType } from '../type/node';
import { DispatchNodeResponseKeyEnum } from './constants';
import { StoreEdgeItemType } from '../type/edge';
import { NodeInputKeyEnum } from '../constants';
import { ClassifyQuestionAgentItemType } from '../template/system/classifyQuestion/type';
import { NextApiResponse } from 'next';
import { UserModelSchema } from '../../../support/user/type';
import { AppDetailType, AppSchema } from '../../app/type';
import { RuntimeNodeItemType } from '../runtime/type';
import { RuntimeEdgeItemType } from './edge';

/* workflow props */
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

export type SystemVariablesType = {
  appId: string;
  chatId?: string;
  responseChatItemId?: string;
  histories: ChatItemType[];
};

/* node props */
export type RuntimeNodeItemType = {
  nodeId: StoreNodeItemType['nodeId'];
  name: StoreNodeItemType['name'];
  avatar: StoreNodeItemType['avatar'];
  intro?: StoreNodeItemType['intro'];
  flowNodeType: StoreNodeItemType['flowNodeType'];
  showStatus?: StoreNodeItemType['showStatus'];
  isEntry?: StoreNodeItemType['isEntry'];

  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];

  pluginId?: string;
};

export type PluginRuntimeType = {
  id: string;
  teamId?: string;
  name: string;
  avatar: string;
  showStatus?: boolean;
  currentCost?: number;
  nodes: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
};

export type RuntimeEdgeItemType = StoreEdgeItemType & {
  status: 'waiting' | 'active' | 'skipped';
};

export type DispatchNodeResponseType = {
  // common
  moduleLogo?: string;
  runningTime?: number;
  query?: string;
  textOutput?: string;
  error?: Record<string, any>;
  customInputs?: Record<string, any>;
  customOutputs?: Record<string, any>;

  // bill
  tokens?: number;
  model?: string;
  contextTotalLen?: number;
  totalPoints?: number;

  // chat
  temperature?: number;
  maxToken?: number;
  quoteList?: SearchDataResponseItemType[];
  historyPreview?: {
    obj: `${ChatRoleEnum}`;
    value: string;
  }[]; // completion context array. history will slice

  // dataset search
  similarity?: number;
  limit?: number;
  searchMode?: `${DatasetSearchModeEnum}`;
  searchUsingReRank?: boolean;
  extensionModel?: string;
  extensionResult?: string;
  extensionTokens?: number;

  // cq
  cqList?: ClassifyQuestionAgentItemType[];
  cqResult?: string;

  // content extract
  extractDescription?: string;
  extractResult?: Record<string, any>;

  // http
  params?: Record<string, any>;
  body?: Record<string, any>;
  headers?: Record<string, any>;
  httpResult?: Record<string, any>;

  // plugin output
  pluginOutput?: Record<string, any>;
  pluginDetail?: ChatHistoryItemResType[];

  // if-else
  ifElseResult?: string;

  // tool
  toolCallTokens?: number;
  toolDetail?: ChatHistoryItemResType[];
  toolStop?: boolean;

  // code
  codeLog?: string;

  // plugin
  pluginOutput?: Record<string, any>;
};

export type DispatchNodeResultType<T> = {
  [DispatchNodeResponseKeyEnum.skipHandleId]?: string[]; // skip some edge handle id
  [DispatchNodeResponseKeyEnum.nodeResponse]?: DispatchNodeResponseType; // The node response detail
  [DispatchNodeResponseKeyEnum.nodeDispatchUsages]?: ChatNodeUsageType[]; //
  [DispatchNodeResponseKeyEnum.childrenResponses]?: DispatchNodeResultType[];
  [DispatchNodeResponseKeyEnum.toolResponses]?: ToolRunResponseItemType;
  [DispatchNodeResponseKeyEnum.assistantResponses]?: ChatItemValueItemType[];
} & T;

/* Single node props */
export type AIChatNodeProps = {
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]?: string;
  [NodeInputKeyEnum.aiChatTemperature]: number;
  [NodeInputKeyEnum.aiChatMaxToken]: number;
  [NodeInputKeyEnum.aiChatIsResponseText]: boolean;
  [NodeInputKeyEnum.aiChatQuoteTemplate]?: string;
  [NodeInputKeyEnum.aiChatQuotePrompt]?: string;
};
