import type { ChatNodeUsageType } from '../../../support/wallet/bill/type';
import type {
  ChatItemMiniType,
  ToolRunResponseItemType,
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '../../chat/type';
import type { FlowNodeInputItemType, FlowNodeOutputItemType } from '../type/io';
import type { StoreNodeItemType } from '../type/node';
import type { DispatchNodeResponseKeyEnum } from './constants';
import type { NodeInputKeyEnum } from '../constants';
import { NodeOutputKeyEnum } from '../constants';
import { ClassifyQuestionAgentItemSchema } from '../template/system/classifyQuestion/type';
import type { NextApiResponse } from 'next';
import type { AppSchemaType } from '../../app/type';
import type { RuntimeEdgeItemType } from '../type/edge';
import { ReadFileNodeResponseSchema } from '../template/system/readFiles/type';
import type { WorkflowResponseType } from '../../../../service/core/workflow/dispatch/type';
import type { AiChatQuoteRoleType } from '../template/system/aiChat/type';
import type { OpenaiAccountType } from '../../../support/user/team/type';
import { CompletionFinishReasonSchema } from '../../ai/llm/type';
import type { ReasoningEffort } from '../../ai/llm/type';
import type {
  InteractiveNodeResponseType,
  WorkflowInteractiveResponseType
} from '../template/system/interactive/type';
import { SearchDataResponseItemSchema } from '../../dataset/type';
import type { localeType } from '../../../common/i18n/type';
import { type UserChatItemValueItemType } from '../../chat/type';
import { DatasetSearchModeEnum } from '../../dataset/constants';
import { ChatRoleEnum } from '../../chat/constants';
import z from 'zod';
import type { JSONSchemaInputType } from '../../app/jsonschema';

/*
  1. 输入线分类：普通线(实际上就是从 start 直接过来的分支）和递归线（可以追溯到自身的分支）
  2. 递归线，会根据最近的一个 target 分支进行分类，同一个分支的属于一组
  2. 起始线全部非 waiting 执行，或递归线任意一组全部非 waiting 执行
*/
// 节点边分组结构（简化版：不再区分 common 和 recursive）
export type NodeEdgeGroups = RuntimeEdgeItemType[][]; // 二维数组，每组代表一个独立的逻辑路径

// 预构建的 Map
export type NodeEdgeGroupsMap = Map<string, NodeEdgeGroups>;

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
  histories: ChatItemMiniType[];
  variables: Record<string, any>; // global variable
  query: UserChatItemValueItemType[]; // trigger query
  chatConfig: AppSchemaType['chatConfig'];
  lastInteractive?: WorkflowInteractiveResponseType; // last interactive response
  stream: boolean;
  retainDatasetCite?: boolean;
  showSkillReferences?: boolean;
  maxRunTimes: number;
  isToolCall?: boolean;
  workflowStreamResponse?: WorkflowResponseType;
  apiVersion?: 'v1' | 'v2';

  workflowDispatchDeep: number;

  responseAllData?: boolean;
  responseDetail?: boolean;

  // TODO: 移除
  usageId?: string;
};

export type ModuleDispatchProps<T> = ChatDispatchProps & {
  node: RuntimeNodeItemType;
  runtimeNodes: RuntimeNodeItemType[];
  runtimeNodesMap: Map<string, RuntimeNodeItemType>;
  runtimeEdges: RuntimeEdgeItemType[];
  params: T;

  usagePush: (usages: ChatNodeUsageType[]) => void;
};

export type SystemVariablesType = {
  userId: string;
  appId: string;
  chatId?: string;
  responseChatItemId?: string;
  histories: ChatItemMiniType[];
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
  jsonSchema?: JSONSchemaInputType;

  // catch error
  catchError?: boolean;
};

// 知识库未 schema 改造，这里用不了
export const DispatchNodeResponseSchema = z
  .object({
    // common
    moduleLogo: z.string().optional().meta({ description: '模块 logo' }),
    moduleNameArgs: z
      .record(z.string(), z.any())
      .optional()
      .meta({ description: '模块名 i18n 插值参数' }),
    runningTime: z.number().optional().meta({ description: '运行时间: 毫秒' }),
    query: z.string().optional().meta({ description: '查询语句' }),
    textOutput: z.string().optional().meta({ description: '文本输出' }),

    llmRequestIds: z.array(z.string()).optional().meta({ description: 'LLM 请求追踪 ID 列表' }),

    error: z
      .union([z.record(z.string(), z.any()), z.string()])
      .optional()
      .meta({ description: '错误信息' }),
    errorText: z.string().optional().meta({ description: '错误文本' }), // Just show

    customInputs: z.record(z.string(), z.any()).optional().meta({ description: '自定义输入' }),
    customOutputs: z.record(z.string(), z.any()).optional().meta({ description: '自定义输出' }),
    nodeInputs: z.record(z.string(), z.any()).optional().meta({ description: '节点输入' }),
    nodeOutputs: z.record(z.string(), z.any()).optional().meta({ description: '节点输出' }),
    mergeSignId: z.string().optional().meta({ description: '合并签名 ID' }),

    // bill
    tokens: z.number().optional().meta({ description: '总 token' }),
    inputTokens: z.number().optional().meta({ description: '输入 token' }),
    outputTokens: z.number().optional().meta({ description: '输出 token' }),
    model: z.string().optional().meta({ description: '模型' }),
    contextTotalLen: z.number().optional().meta({ description: '上下文总长度' }),
    totalPoints: z.number().optional().meta({ description: '总积分' }),
    childTotalPoints: z.number().optional().meta({ description: '子节点总积分' }),

    // LLM chat
    temperature: z.number().optional().meta({ description: '温度' }),
    maxToken: z.number().optional().meta({ description: '最大 token' }),
    quoteList: z
      .array(SearchDataResponseItemSchema)
      .optional()
      .meta({ description: '知识库引用列表' }),
    reasoningText: z.string().optional().meta({ description: '思考文本' }),
    historyPreview: z
      .array(
        z.object({
          obj: z.enum(ChatRoleEnum),
          value: z.string()
        })
      )
      .optional()
      .meta({ description: '上下文预览' }), // completion context array. history will slice
    finishReason: CompletionFinishReasonSchema.optional(),

    // dataset search
    embeddingModel: z.string().optional().meta({ description: '嵌入模型' }),
    embeddingTokens: z.number().optional().meta({ description: '嵌入 token' }),
    similarity: z.number().optional().meta({ description: '相似度' }),
    limit: z.number().optional().meta({ description: '限制' }),
    searchMode: z.enum(DatasetSearchModeEnum).optional().meta({ description: '搜索模式' }),
    embeddingWeight: z.number().optional().meta({ description: '嵌入权重' }),
    rerankModel: z.string().optional().meta({ description: '重排模型' }),
    rerankWeight: z.number().optional().meta({ description: '重排权重' }),
    reRankInputTokens: z.number().optional().meta({ description: '重排输入 token' }),
    searchUsingReRank: z.boolean().optional().meta({ description: '使用重排' }),
    queryExtensionResult: z
      .object({
        model: z.string().meta({ description: '模型' }),
        inputTokens: z.number().meta({ description: '输入 token' }),
        outputTokens: z.number().meta({ description: '输出 token' }),
        query: z.string().meta({ description: '查询内容' })
      })
      .optional()
      .meta({ description: '查询扩展结果' }),
    deepSearchResult: z
      .object({
        model: z.string().meta({ description: '模型' }),
        inputTokens: z.number().meta({ description: '输入 token' }),
        outputTokens: z.number().meta({ description: '输出 token' })
      })
      .optional(),

    // dataset concat
    concatLength: z.number().optional(),

    // cq
    cqList: z
      .array(ClassifyQuestionAgentItemSchema)
      .optional()
      .meta({ description: '分类问题列表' }),
    cqResult: z.string().optional().meta({ description: '分类结果' }),

    // content extract
    extractDescription: z.string().optional().meta({ description: '提取描述' }),
    extractResult: z.record(z.string(), z.any()).optional().meta({ description: '提取结果' }),

    // http
    params: z.record(z.string(), z.any()).optional().meta({ description: '请求参数' }),
    body: z
      .union([z.record(z.string(), z.any()), z.string()])
      .optional()
      .meta({ description: '请求体' }),
    headers: z.record(z.string(), z.any()).optional().meta({ description: '请求头' }),
    httpResult: z.record(z.string(), z.any()).optional().meta({ description: '请求结果' }),

    // Tool
    toolInput: z.record(z.string(), z.any()).optional().meta({ description: '工具输入' }),
    pluginOutput: z.record(z.string(), z.any()).optional().meta({ description: '插件输出' }),
    pluginDetail: z.array(z.any()).optional(),
    toolParamsResult: z
      .record(z.string(), z.any())
      .optional()
      .meta({ description: '工具参数结果' }),
    toolRes: z.any().optional().meta({ description: '工具响应' }),

    // if-else
    ifElseResult: z.string().optional().meta({ description: '判断器结果' }),

    // tool call
    toolCallInputTokens: z.number().optional().meta({ description: '工具调用输入 token' }),
    toolCallOutputTokens: z.number().optional().meta({ description: '工具调用输出 token' }),
    toolDetail: z.array(z.any()).optional(),
    toolStop: z.boolean().optional(),

    // Agent call
    stepQuery: z.string().optional().meta({ description: '步骤查询' }),

    // Compress chunk
    compressTextAgent: z
      .object({
        inputTokens: z.number().meta({ description: '输入 token' }),
        outputTokens: z.number().meta({ description: '输出 token' }),
        totalPoints: z.number().meta({ description: '总积分' })
      })
      .optional()
      .meta({ description: '压缩文本Agent' }),

    // code
    codeLog: z.string().optional().meta({ description: '代码日志' }),

    // read files
    readFilesResult: z.string().optional().meta({ description: '文件读取结果' }),
    readFiles: ReadFileNodeResponseSchema.optional(),

    // user select
    userSelectResult: z.string().optional().meta({ description: '用户选择结果' }),
    // form input
    formInputResult: z.record(z.string(), z.any()).optional().meta({ description: '表单输入结果' }),

    // update var
    updateVarResult: z.array(z.any()).optional().meta({ description: '更新变量结果' }),

    // loop
    loopResult: z.array(z.any()).optional().meta({ description: '循环结果' }),
    loopInput: z.array(z.any()).optional().meta({ description: '循环输入' }),
    loopDetail: z.array(z.any()).optional().meta({ description: '循环详情' }),
    loopInputValue: z.any().optional().meta({ description: '循环输入值' }),
    loopOutputValue: z.any().optional().meta({ description: '循环输出值' }),

    // parallel run
    parallelInput: z.array(z.any()).optional().meta({ description: '并行输入' }),
    parallelResult: z.array(z.any()).optional().meta({ description: '并行结果' }),
    parallelRunDetail: z
      .array(z.any())
      .optional()
      .meta({ description: '各任务执行摘要（成功/失败状态）' }),
    parallelDetail: z
      .array(z.any())
      .optional()
      .meta({ description: '成功任务子工作流完整响应列表' }),

    // loopRun
    loopRunInput: z
      .any()
      .optional()
      .meta({ description: 'loopRun 循环输入（数组或条件模式标记）' }),
    loopRunIterations: z.number().optional().meta({ description: 'loopRun 实际执行轮数' }),
    loopRunHistory: z.array(z.any()).optional().meta({ description: 'loopRun 每轮快照' }),
    loopRunDetail: z
      .array(z.any())
      .optional()
      .meta({ description: 'loopRun 各轮子工作流节点响应聚合' }),

    childrenResponses: z.array(z.any()).optional().meta({ description: '子节点响应' }),

    // Tools
    toolId: z.string().optional().meta({ description: '工具 ID' }),

    extensionModel: z.string().optional().meta({ description: '扩展模型', deprecated: true }),
    extensionResult: z.string().optional().meta({ description: '扩展结果', deprecated: true }),
    extensionTokens: z.number().optional().meta({ description: '扩展 token', deprecated: true })
  })
  .meta({ description: '节点响应' });

type Tmp_DispatchNodeResponseType = z.infer<typeof DispatchNodeResponseSchema>;
export type DispatchNodeResponseType = Omit<
  Tmp_DispatchNodeResponseType,
  'childrenResponses' | 'loopDetail' | 'pluginDetail' | 'toolDetail'
> & {
  childrenResponses?: DispatchNodeResponseType[];
  loopDetail?: DispatchNodeResponseType[];
  pluginDetail?: DispatchNodeResponseType[];
  toolDetail?: DispatchNodeResponseType[];
};

export type DispatchNodeResultType<T = {}, ERR = { [NodeOutputKeyEnum.errorText]?: string }> = {
  [DispatchNodeResponseKeyEnum.answerText]?: string;
  [DispatchNodeResponseKeyEnum.reasoningText]?: string;
  [DispatchNodeResponseKeyEnum.skipHandleId]?: string[]; // skip some edge handle id
  [DispatchNodeResponseKeyEnum.nodeResponse]?: DispatchNodeResponseType; // The node response detail
  [DispatchNodeResponseKeyEnum.nodeResponses]?: ChatHistoryItemResType[]; // Node responses
  [DispatchNodeResponseKeyEnum.childrenResponses]?: DispatchNodeResultType[]; // Children node response
  [DispatchNodeResponseKeyEnum.toolResponses]?: ToolRunResponseItemType; // Tool response
  [DispatchNodeResponseKeyEnum.assistantResponses]?: AIChatItemValueItemType[]; // Assistant response(Store to db)
  [DispatchNodeResponseKeyEnum.rewriteHistories]?: ChatItemMiniType[];
  [DispatchNodeResponseKeyEnum.runTimes]?: number;
  [DispatchNodeResponseKeyEnum.newVariables]?: Record<string, any>;
  [DispatchNodeResponseKeyEnum.memories]?: Record<string, any>;
  [DispatchNodeResponseKeyEnum.interactive]?: InteractiveNodeResponseType;
  [DispatchNodeResponseKeyEnum.customFeedbacks]?: string[];

  data?: T;
  error?: ERR;

  /** @deprecated */
  [DispatchNodeResponseKeyEnum.nodeDispatchUsages]?: ChatNodeUsageType[]; // Node total usage
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
  [NodeInputKeyEnum.aiChatReasoningEffort]?: ReasoningEffort;
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
