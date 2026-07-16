import type { FlowNodeInputItemType, FlowNodeOutputItemType } from '../type/io';
import type { StoreNodeItemType } from '../type/node';
import { NodeOutputKeyEnum } from '../constants';
import { ClassifyQuestionAgentItemSchema } from '../template/system/classifyQuestion/type';
import { ReadFileNodeResponseSchema } from '../template/system/readFiles/type';
import { CompletionFinishReasonSchema } from '../../ai/llm/type';
import { SearchDataResponseQuoteListItemSchema } from '../../dataset/type';
import { DatasetSearchModeEnum } from '../../dataset/constants';
import { ChatRoleEnum } from '../../chat/constants';
import z from 'zod';
import type { JSONSchemaInputType } from '../../app/jsonschema';

const AgentPlanNodeStatusSchema = z.enum(['set_plan', 'update_plan', 'ask_question']);

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
    runningTime: z.number().optional().meta({ description: '运行时间: 秒' }),
    query: z.string().optional().meta({ description: '查询语句' }),
    textOutput: z.string().optional().meta({ description: '文本输出' }),

    llmRequestIds: z.array(z.string()).optional().meta({ description: 'LLM 请求追踪 ID 列表' }),
    agentPlanStatus: AgentPlanNodeStatusSchema.optional().meta({
      description: 'Agent 计划节点状态'
    }),
    agentPlanResult: z.string().optional().meta({ description: 'Agent 计划操作结果' }),

    error: z
      .union([z.record(z.string(), z.any()), z.string()])
      .optional()
      .meta({ description: '错误信息' }),
    errorText: z.string().optional().meta({ description: '错误文本' }), // Just show
    errorCaptured: z.boolean().optional().meta({ description: '错误已被 catch 分支捕获' }),

    customInputs: z.record(z.string(), z.any()).optional().meta({ description: '自定义输入' }),
    customOutputs: z.record(z.string(), z.any()).optional().meta({ description: '自定义输出' }),
    nodeInputs: z.record(z.string(), z.any()).optional().meta({ description: '节点输入' }),
    nodeOutputs: z.record(z.string(), z.any()).optional().meta({ description: '节点输出' }),
    mergeSignId: z.string().optional().meta({ description: '旧版合并签名 ID', deprecated: true }),
    parentId: z.string().optional().meta({ description: '父节点响应实例 ID' }),

    // bill
    tokens: z.number().optional().meta({ description: '总 token' }),
    inputTokens: z.number().optional().meta({ description: '输入 token' }),
    outputTokens: z.number().optional().meta({ description: '输出 token' }),
    model: z.string().optional().meta({ description: '模型' }),
    contextTotalLen: z.number().optional().meta({ description: '上下文总长度' }),
    totalPoints: z.number().optional().meta({ description: '总积分' }),
    childTotalPoints: z.number().optional().meta({ description: '子节点总积分' }),
    childResponseCount: z.number().optional().meta({ description: '子节点响应数量' }),

    // LLM chat
    temperature: z.number().optional().meta({ description: '温度' }),
    maxToken: z.number().optional().meta({ description: '最大 token' }),
    quoteList: z
      .array(SearchDataResponseQuoteListItemSchema)
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
    datasetQueries: z.array(z.string()).optional().meta({ description: '检索词' }),

    rerankModel: z.string().optional().meta({ description: '重排模型' }),
    rerankWeight: z.number().optional().meta({ description: '重排权重' }),
    reRankInputTokens: z.number().optional().meta({ description: '重排输入 token' }),
    searchUsingReRank: z.boolean().optional().meta({ description: '使用重排' }),
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
    httpErrorResult: z.record(z.string(), z.any()).optional().meta({ description: '请求失败结果' }),

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
      .meta({ description: '成功任务子工作流完整响应列表', deprecated: true }),

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
      .meta({ description: 'loopRun 各轮子工作流节点响应聚合', deprecated: true }),
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
  | 'childrenResponses'
  | 'loopDetail'
  | 'loopRunDetail'
  | 'parallelDetail'
  | 'pluginDetail'
  | 'toolDetail'
> & {
  childrenResponses?: DispatchNodeResponseType[];
  loopDetail?: DispatchNodeResponseType[];
  loopRunDetail?: DispatchNodeResponseType[];
  parallelDetail?: DispatchNodeResponseType[];
  pluginDetail?: DispatchNodeResponseType[];
  toolDetail?: DispatchNodeResponseType[];
};

/* ---------- node outputs ------------ */
export const NodeOutputItemSchema = z.object({
  nodeId: z.string(),
  key: z.enum(Object.values(NodeOutputKeyEnum)),
  value: z.any()
});
export type NodeOutputItemType = z.infer<typeof NodeOutputItemSchema>;
