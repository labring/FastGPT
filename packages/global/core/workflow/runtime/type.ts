import type { ChatNodeUsageType } from '../../../support/wallet/bill/type';
import type {
  ChatItemType,
  ToolRunResponseItemType,
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '../../chat/type';
import type { FlowNodeInputItemType, FlowNodeOutputItemType } from '../type/io';
import type { StoreNodeItemType } from '../type/node';
import type { DispatchNodeResponseKeyEnum } from './constants';
import type { NodeInputKeyEnum } from '../constants';
import { NodeOutputKeyEnum } from '../constants';
import type { ClassifyQuestionAgentItemType } from '../template/system/classifyQuestion/type';
import type { NextApiResponse } from 'next';
import type { AppSchemaType } from '../../app/type';
import type { RuntimeEdgeItemType } from '../type/edge';
import { type ReadFileNodeResponseType } from '../template/system/readFiles/type';
import type { WorkflowResponseType } from '../../../../service/core/workflow/dispatch/type';
import type { AiChatQuoteRoleType } from '../template/system/aiChat/type';
import type { OpenaiAccountType } from '../../../support/user/team/type';
import type { CompletionFinishReason } from '../../ai/type';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '../template/system/interactive/type';
import type { SearchDataResponseItemType } from '../../dataset/type';
import type { localeType } from '../../../common/i18n/type';
import { type UserChatItemValueItemType } from '../../chat/type';
import type { DatasetSearchModeEnum } from '../../dataset/constants';
import type { ChatRoleEnum } from '../../chat/constants';
import type { MCPClient } from '../../../../service/core/app/mcp';
import z from 'zod';

export type ExternalProviderType = {
  openaiAccount?: OpenaiAccountType;
  externalWorkflowVariables?: Record<string, string>;
};

/* workflow props */
export type ChatDispatchProps = {
  res?: NextApiResponse;
  checkIsStopping: () => boolean;
  lang?: localeType;
  requestOrigin?: string;
  mode: 'test' | 'chat' | 'debug';
  timezone: string;
  externalProvider: ExternalProviderType;

  runningAppInfo: {
    id: string; // May be the id of the system plug-in (cannot be used directly to look up the table)
    teamId: string;
    tmbId: string; // App tmbId
    name: string;
    isChildApp?: boolean;
  };
  runningUserInfo: {
    username: string;
    teamName: string;
    memberName: string;
    contact: string;
    teamId: string;
    tmbId: string;
  };
  uid: string; // Who run this workflow

  chatId: string;
  responseChatItemId?: string;
  histories: ChatItemType[];
  variables: Record<string, any>; // global variable
  query: UserChatItemValueItemType[]; // trigger query
  chatConfig: AppSchemaType['chatConfig'];
  lastInteractive?: WorkflowInteractiveResponseType; // last interactive response
  stream: boolean;
  retainDatasetCite?: boolean;
  maxRunTimes: number;
  isToolCall?: boolean;
  workflowStreamResponse?: WorkflowResponseType;
  apiVersion?: 'v1' | 'v2';

  workflowDispatchDeep: number;

  responseAllData?: boolean;
  responseDetail?: boolean;

  // TOOD: 移除
  usageId?: string;
};

export type ModuleDispatchProps<T> = ChatDispatchProps & {
  node: RuntimeNodeItemType;
  runtimeNodes: RuntimeNodeItemType[];
  runtimeEdges: RuntimeEdgeItemType[];
  params: T;

  usagePush: (usages: ChatNodeUsageType[]) => void;
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
  avatar?: StoreNodeItemType['avatar'];
  intro?: StoreNodeItemType['intro'];
  toolDescription?: StoreNodeItemType['toolDescription'];
  flowNodeType: StoreNodeItemType['flowNodeType'];
  showStatus?: StoreNodeItemType['showStatus'];
  isEntry?: boolean;
  version?: string;

  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];

  pluginId?: string; // workflow id / plugin id

  // Tool
  toolConfig?: StoreNodeItemType['toolConfig'];

  // catch error
  catchError?: boolean;
};

// 知识库未 schema 改造，这里用不了
// export const DispatchNodeResponseSchema = z.object({
//   // common
//   moduleLogo: z.string().nullish(),
//   runningTime: z.number().nullish(),
//   query: z.string().nullish(),
//   textOutput: z.string().nullish(),

//   error: z.record(z.string(), z.any()).nullish(), // Client will toast
//   errorText: z.string().nullish(), // Just show

//   customInputs: z.record(z.string(), z.any()).nullish(),
//   customOutputs: z.record(z.string(), z.any()).nullish(),
//   nodeInputs: z.record(z.string(), z.any()).nullish(),
//   nodeOutputs: z.record(z.string(), z.any()).nullish(),
//   mergeSignId: z.string().nullish(),

//   llmRequestIds: z.array(z.string()).nullish(), // LLM 请求追踪 ID 列表

//   // bill
//   inputTokens: z.number().nullish(),
//   outputTokens: z.number().nullish(),
//   model: z.string().nullish(),
//   contextTotalLen: z.number().nullish(),
//   totalPoints: z.string().nullish(),
//   childTotalPoints: z.string().nullish(),

//   // chat
//   temperature: z.number().nullish(),
//   maxToken: z.number().nullish(),
//   quoteList: z.array(SearchDataResponseItemTypeSchema).nullish(),
//   reasoningText: z.string().nullish(),
//   historyPreview: z
//     .array(
//       z.object({
//         obj: z.enum(Object.values(ChatRoleEnum)),
//         value: z.string()
//       })
//     )
//     .nullish(), // completion context array. history will slice
//   finishReason: z.enum(Object.values(CompletionFinishReason)).nullish(),

//   // dataset search
//   embeddingModel: z.string().nullish(),
//   embeddingTokens: z.number().nullish(),
//   similarity: z.number().nullish(),
//   limit: z.number().nullish(),
//   searchMode: z.enum(Object.values(DatasetSearchModeEnum)).nullish(),
//   embeddingWeight: z.number().nullish(),
//   rerankModel: z.string().nullish(),
//   rerankWeight: z.number().nullish(),
//   reRankInputTokens: z.number().nullish(),
//   searchUsingReRank: z.boolean().nullish(),
//   queryExtensionResult: z
//     .object({
//       model: z.string(),
//       inputTokens: z.number(),
//       outputTokens: z.number(),
//       query: z.string()
//     })
//     .nullish(),
//   deepSearchResult: z
//     .object({
//       model: z.string(),
//       inputTokens: z.number(),
//       outputTokens: z.number()
//     })
//     .nullish(),

//   // dataset concat
//   concatLength: z.number().nullish(),

//   // cq
//   cqList: z.array(ClassifyQuestionAgentItemTypeSchema).nullish(),
//   cqResult: z.string().nullish(),

//   // content extract
//   extractDescription: z.string().nullish(),
//   extractResult: z.record(z.string(), z.any()).nullish(),

//   // http
//   params: z.record(z.string(), z.any()).nullish(),
//   body: z.record(z.string(), z.any()).nullish(),
//   headers: z.record(z.string(), z.any()).nullish(),
//   httpResult: z.record(z.string(), z.any()).nullish(),

//   // Tool
//   toolInput: z.record(z.string(), z.any()).nullish(),
//   pluginOutput: z.record(z.string(), z.any()).nullish(),
//   pluginDetail: z.array(ChatHistoryItemResTypeSchema).nullish(),

//   // if-else
//   ifElseResult: z.string().nullish(),

//   // tool call
//   toolCallInputTokens: z.number().nullish(),
//   toolCallOutputTokens: z.number().nullish(),
//   toolDetail: z.array(ChatHistoryItemResTypeSchema).nullish(),
//   toolStop: z.boolean().nullish(),

//   // code
//   codeLog: z.string().nullish(),

//   // read files
//   readFilesResult: z.string().nullish(),
//   readFiles: ReadFileNodeResponseSchema.nullish(),

//   // user select
//   userSelectResult: z.string().nullish(),

//   // update var
//   updateVarResult: z.array(z.any()).nullish(),

//   // loop
//   loopResult: z.array(z.any()).nullish(),
//   loopInput: z.array(z.any()).nullish(),
//   loopDetail: z.array(ChatHistoryItemResTypeSchema).nullish(),
//   loopInputValue: z.any().nullish(),
//   loopOutputValue: z.any().nullish(),

//   // form input
//   formInputResult: z.record(z.string(), z.any()).nullish(),

//   // tool params
//   toolParamsResult: z.record(z.string(), z.any()).nullish(),

//   toolRes: z.any().nullish(),

//   // @deprecated
//   extensionModel: z.string().nullish(),
//   extensionResult: z.string().nullish(),
//   extensionTokens: z.number().nullish(),
//   tokens: z.number().nullish()
// });
export type DispatchNodeResponseType = {
  // common
  moduleLogo?: string;
  runningTime?: number;
  query?: string;
  textOutput?: string;
  // LLM request tracking
  llmRequestIds?: string[]; // LLM 请求追踪 ID 列表

  // Client will toast
  error?: Record<string, any> | string;
  // Just show
  errorText?: string;

  customInputs?: Record<string, any>;
  customOutputs?: Record<string, any>;
  nodeInputs?: Record<string, any>;
  nodeOutputs?: Record<string, any>;
  mergeSignId?: string;

  // bill
  tokens?: number; // deprecated
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  contextTotalLen?: number;
  totalPoints?: number;
  childTotalPoints?: number;

  // chat
  temperature?: number;
  maxToken?: number;
  quoteList?: SearchDataResponseItemType[];
  reasoningText?: string;
  historyPreview?: {
    obj: `${ChatRoleEnum}`;
    value: string;
  }[]; // completion context array. history will slice
  finishReason?: CompletionFinishReason;

  // dataset search
  embeddingModel?: string;
  embeddingTokens?: number;
  similarity?: number;
  limit?: number;
  searchMode?: `${DatasetSearchModeEnum}`;
  embeddingWeight?: number;
  rerankModel?: string;
  rerankWeight?: number;
  reRankInputTokens?: number;
  searchUsingReRank?: boolean;
  queryExtensionResult?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    query: string;
  };
  deepSearchResult?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
  };

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

  // Tool
  toolInput?: Record<string, any>;
  pluginOutput?: Record<string, any>;
  pluginDetail?: ChatHistoryItemResType[];
  toolParamsResult?: Record<string, any>;
  toolRes?: any;

  // if-else
  ifElseResult?: string;

  // tool call
  toolCallInputTokens?: number;
  toolCallOutputTokens?: number;
  toolDetail?: ChatHistoryItemResType[];
  toolStop?: boolean;
  // Agent call
  stepQuery?: string;
  // Compress chunk
  compressTextAgent?: {
    inputTokens: number;
    outputTokens: number;
    totalPoints: number;
  };

  // code
  codeLog?: string;

  // read files
  readFilesResult?: string;
  readFiles?: ReadFileNodeResponseType;

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
  formInputResult?: Record<string, any>;

  // Children node responses
  childrenResponses?: ChatHistoryItemResType[];

  // abandon
  extensionModel?: string;
  extensionResult?: string;
  extensionTokens?: number;
};

export type DispatchNodeResultType<T = {}, ERR = { [NodeOutputKeyEnum.errorText]?: string }> = {
  [DispatchNodeResponseKeyEnum.answerText]?: string;
  [DispatchNodeResponseKeyEnum.reasoningText]?: string;
  [DispatchNodeResponseKeyEnum.skipHandleId]?: string[]; // skip some edge handle id
  [DispatchNodeResponseKeyEnum.nodeResponse]?: DispatchNodeResponseType; // The node response detail
  [DispatchNodeResponseKeyEnum.nodeResponses]?: ChatHistoryItemResType[]; // Node responses
  [DispatchNodeResponseKeyEnum.nodeDispatchUsages]?: ChatNodeUsageType[]; // Node total usage
  [DispatchNodeResponseKeyEnum.childrenResponses]?: DispatchNodeResultType[]; // Children node response
  [DispatchNodeResponseKeyEnum.toolResponses]?: ToolRunResponseItemType; // Tool response
  [DispatchNodeResponseKeyEnum.assistantResponses]?: AIChatItemValueItemType[]; // Assistant response(Store to db)
  [DispatchNodeResponseKeyEnum.rewriteHistories]?: ChatItemType[];
  [DispatchNodeResponseKeyEnum.runTimes]?: number;
  [DispatchNodeResponseKeyEnum.newVariables]?: Record<string, any>;
  [DispatchNodeResponseKeyEnum.memories]?: Record<string, any>;
  [DispatchNodeResponseKeyEnum.interactive]?: InteractiveNodeResponseType;
  [DispatchNodeResponseKeyEnum.customFeedbacks]?: string[];

  data?: T;
  error?: ERR;
};

/* Single node props */
export type AIChatNodeProps = {
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]?: string;
  [NodeInputKeyEnum.aiChatTemperature]?: number;
  [NodeInputKeyEnum.aiChatMaxToken]?: number;
  [NodeInputKeyEnum.aiChatIsResponseText]: boolean;
  [NodeInputKeyEnum.aiChatVision]?: boolean;
  [NodeInputKeyEnum.aiChatReasoning]?: boolean;
  [NodeInputKeyEnum.aiChatTopP]?: number;
  [NodeInputKeyEnum.aiChatStopSign]?: string;
  [NodeInputKeyEnum.aiChatResponseFormat]?: string;
  [NodeInputKeyEnum.aiChatJsonSchema]?: string;

  [NodeInputKeyEnum.aiChatQuoteRole]?: AiChatQuoteRoleType;
  [NodeInputKeyEnum.aiChatQuoteTemplate]?: string;
  [NodeInputKeyEnum.aiChatQuotePrompt]?: string;

  [NodeInputKeyEnum.stringQuoteText]?: string;
  [NodeInputKeyEnum.fileUrlList]?: string[];
};

/* ---------- node outputs ------------ */
export const NodeOutputItemSchema = z.object({
  nodeId: z.string(),
  key: z.enum(Object.values(NodeOutputKeyEnum)),
  value: z.any()
});
export type NodeOutputItemType = z.infer<typeof NodeOutputItemSchema>;
