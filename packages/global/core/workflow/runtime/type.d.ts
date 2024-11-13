import { ChatNodeUsageType } from '../../../support/wallet/bill/type';
import {
  ChatItemType,
  UserChatItemValueItemType,
  ToolRunResponseItemType,
  NodeOutputItemType,
  AIChatItemValueItemType
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
import { ReadFileNodeResponse } from '../template/system/readFiles/type';
import { UserSelectOptionType } from '../template/system/userSelect/type';
import { WorkflowResponseType } from '../../../../service/core/workflow/dispatch/type';
import { AiChatQuoteRoleType } from '../template/system/aiChat/type';

/* workflow props */
export type ChatDispatchProps = {
  res?: NextApiResponse;
  requestOrigin?: string;
  mode: 'test' | 'chat' | 'debug';
  user: UserModelSchema;

  runningAppInfo: {
    id: string; // May be the id of the system plug-in (cannot be used directly to look up the table)
    teamId: string;
    tmbId: string; // App tmbId
  };
  uid: string; // Who run this workflow

  chatId?: string;
  responseChatItemId?: string;
  histories: ChatItemType[];
  variables: Record<string, any>; // global variable
  query: UserChatItemValueItemType[]; // trigger query
  chatConfig: AppSchema['chatConfig'];
  stream: boolean;
  maxRunTimes: number;
  isToolCall?: boolean;
  workflowStreamResponse?: WorkflowResponseType;
  workflowDispatchDeep?: number;
};

export type ModuleDispatchProps<T> = ChatDispatchProps & {
  node: RuntimeNodeItemType;
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  params: T;
};

export type SystemVariablesType = {
  userId: string;
  appId: string;
  chatId?: string;
  responseChatItemId?: string;
  histories: ChatItemType[];
  cTime: string;
};

/* node props */
export type RuntimeNodeItemType = {
  nodeId: StoreNodeItemType['nodeId'];
  name: StoreNodeItemType['name'];
  avatar: StoreNodeItemType['avatar'];
  intro?: StoreNodeItemType['intro'];
  flowNodeType: StoreNodeItemType['flowNodeType'];
  showStatus?: StoreNodeItemType['showStatus'];
  isEntry?: boolean;

  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];

  pluginId?: string; // workflow id / plugin id
  version: string;
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
  nodeInputs?: Record<string, any>;
  nodeOutputs?: Record<string, any>;
  mergeSignId?: string;

  // bill
  tokens?: number;
  model?: string;
  contextTotalLen?: number;
  totalPoints?: number;
  childTotalPoints?: number;

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

  // dataset concat
  concatLength?: number;

  // cq
  cqList?: ClassifyQuestionAgentItemType[];
  cqResult?: string;

  // content extract
  extractDescription?: string;
  extractResult?: Record<string, any>;

  // http
  params?: Record<string, any>;
  body?: Record<string, any> | string;
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

  // read files
  readFilesResult?: string;
  readFiles?: ReadFileNodeResponse;

  // user select
  userSelectResult?: string;

  // update var
  updateVarResult?: any[];

  // loop
  loopResult?: any[];
  loopInput?: any[];
  loopDetail?: ChatHistoryItemResType[];
  // loop start
  loopInputValue?: any;
  // loop end
  loopOutputValue?: any;

  // form input
  formInputResult?: string;

  // tool params
  toolParamsResult?: Record<string, any>;
};

export type DispatchNodeResultType<T = {}> = {
  [DispatchNodeResponseKeyEnum.skipHandleId]?: string[]; // skip some edge handle id
  [DispatchNodeResponseKeyEnum.nodeResponse]?: DispatchNodeResponseType; // The node response detail
  [DispatchNodeResponseKeyEnum.nodeDispatchUsages]?: ChatNodeUsageType[]; // Node total usage
  [DispatchNodeResponseKeyEnum.childrenResponses]?: DispatchNodeResultType[]; // Children node response
  [DispatchNodeResponseKeyEnum.toolResponses]?: ToolRunResponseItemType; // Tool response
  [DispatchNodeResponseKeyEnum.assistantResponses]?: AIChatItemValueItemType[]; // Assistant response(Store to db)
  [DispatchNodeResponseKeyEnum.rewriteHistories]?: ChatItemType[];
  [DispatchNodeResponseKeyEnum.runTimes]?: number;
  [DispatchNodeResponseKeyEnum.newVariables]?: Record<string, any>;
} & T;

/* Single node props */
export type AIChatNodeProps = {
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]?: string;
  [NodeInputKeyEnum.aiChatTemperature]: number;
  [NodeInputKeyEnum.aiChatMaxToken]: number;
  [NodeInputKeyEnum.aiChatIsResponseText]: boolean;
  [NodeInputKeyEnum.aiChatQuoteRole]?: AiChatQuoteRoleType;
  [NodeInputKeyEnum.aiChatQuoteTemplate]?: string;
  [NodeInputKeyEnum.aiChatQuotePrompt]?: string;
  [NodeInputKeyEnum.aiChatVision]?: boolean;

  [NodeInputKeyEnum.stringQuoteText]?: string;
  [NodeInputKeyEnum.fileUrlList]?: string[];
};
