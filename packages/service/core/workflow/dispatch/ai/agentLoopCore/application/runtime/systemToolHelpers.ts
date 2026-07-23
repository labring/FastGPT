import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { ReadFilesToolParamsSchema } from '../../../../../../ai/llm/agentLoop/interface';
import { parseJsonArgs } from '../../../../../../ai/utils';
import {
  normalizeAgentLoopUsages,
  type AgentLoopReadFileExecutor
} from '../../../../../../ai/llm/agentLoop/interface';

export type AgentLoopCoreSystemToolNodeResponseInput = Omit<
  ChatHistoryItemResType,
  'id' | 'nodeId' | 'runningTime' | 'totalPoints'
> &
  Partial<Pick<ChatHistoryItemResType, 'id' | 'nodeId' | 'runningTime' | 'totalPoints'>>;

export type AgentLoopCoreParsedReadFileCall =
  | {
      success: true;
      urls: string[];
    }
  | {
      success: false;
      response: string;
      usages: [];
    };

export type AgentLoopCoreReadFileItem = {
  name?: string;
  url: string;
};

export type CreateAgentLoopCoreReadFileExecutorParams = {
  enabled: boolean;
  execute: (params: { callId: string; files: AgentLoopCoreReadFileItem[] }) => Promise<{
    response: string;
    usages?: ChatNodeUsageType[];
    nodeResponse?: AgentLoopCoreSystemToolNodeResponseInput;
    error?: unknown;
  }>;
};

export type NormalizeAgentLoopCoreDatasetSearchResultParams = {
  callId: string;
  startTime: number;
  response: string;
  usages?: ChatNodeUsageType[];
  nodeResponse?: AgentLoopCoreSystemToolNodeResponseInput;
  fallback?: Partial<Pick<ChatHistoryItemResType, 'moduleType' | 'moduleName' | 'moduleLogo'>>;
};

/**
 * 解析 read_files system tool 参数。
 *
 * readFile 的真实文件来源由 Workflow Agent/ToolCall 各自决定，core 只统一处理
 * LLM tool call arguments 的 JSON 解析和 schema 校验，避免两边重复维护错误响应格式。
 */
export const parseAgentLoopCoreReadFileCall = (
  call: Pick<ChatCompletionMessageToolCall, 'function'>
): AgentLoopCoreParsedReadFileCall => {
  const rawArgs = parseJsonArgs(call.function.arguments);
  const toolParams = ReadFilesToolParamsSchema.safeParse(rawArgs);

  if (!toolParams.success) {
    return {
      success: false,
      response: toolParams.error.message,
      usages: []
    };
  }

  return {
    success: true,
    urls: toolParams.data.urls
  };
};

/**
 * 创建 read_files system tool 执行器。
 *
 * core 统一处理 LLM URL 参数校验、文件列表结构转换、usage 默认值和
 * nodeResponse 运行字段补齐；真实文件来源和解析服务仍由 Workflow Agent/ToolCall 外壳注入。
 */
export const createAgentLoopCoreReadFileExecutor = ({
  enabled,
  execute
}: CreateAgentLoopCoreReadFileExecutorParams): AgentLoopReadFileExecutor | undefined => {
  if (!enabled) return undefined;

  return async ({ call }) => {
    const toolParams = parseAgentLoopCoreReadFileCall(call);
    if (!toolParams.success) return toolParams;

    const startTime = Date.now();
    const result = await execute({
      callId: call.id,
      files: toolParams.urls.map((url) => ({ url }))
    });
    const usages = result.usages ?? [];

    return {
      response: result.response,
      usages,
      metadata: mergeAgentLoopCoreSystemToolNodeResponse({
        nodeResponse: result.nodeResponse,
        callId: call.id,
        startTime,
        usages
      }),
      error: result.error
    };
  };
};

/**
 * 归一化 dataset_search system tool 执行结果。
 *
 * Workflow Agent 与 ToolCall 的真实检索来源不同，但进入 agent-loop 后都应表现为普通工具卡片；
 * 这里统一补 usages 默认值和 nodeResponse 的 callId/耗时/积分字段。
 */
export const normalizeAgentLoopCoreDatasetSearchResult = ({
  callId,
  startTime,
  response,
  usages = [],
  nodeResponse,
  fallback
}: NormalizeAgentLoopCoreDatasetSearchResultParams) => ({
  response,
  usages,
  metadata: mergeAgentLoopCoreSystemToolNodeResponse({
    nodeResponse,
    callId,
    startTime,
    usages,
    fallback
  })
});

/**
 * 将 workflow 内部相对文件路径补成可被 agent-loop system tool 消费的 URL。
 *
 * dataset_search 只接受 http(s) 文件输入；是否最终作为图片检索输入由更底层的
 * dataset system tool 继续过滤，这里仅负责把 workflow 当前文件转成稳定 URL。
 */
export const buildAgentLoopCoreSystemToolFileUrl = ({
  url,
  requestOrigin
}: {
  url: string;
  requestOrigin?: string;
}) => {
  if (/^https?:\/\//i.test(url)) return url;
  if (requestOrigin && url.startsWith('/')) return `${requestOrigin}${url}`;
  return url;
};

/**
 * 只读汇总 agent-loop usage 的积分。
 *
 * billing usage 的写入仍由 usagePush 负责；system tool 补 nodeResponse 时只需要
 * 根据当前执行结果展示本工具总消耗，不能修改调用方传入的 usages。
 */
export const sumAgentLoopCoreUsagePoints = (usages?: ChatNodeUsageType[]) =>
  normalizeAgentLoopUsages(usages).reduce((sum, item) => sum + item.totalPoints, 0);

/**
 * 为 system tool 执行结果补齐 workflow 运行详情字段。
 *
 * readFile/datasetSearch/sandbox 都是 agent-loop system tool，但对 workflow 前端来说仍是
 * 普通工具卡片。这里统一补 callId、耗时和积分；业务侧可按工具类型额外传 moduleName/logo。
 */
export const mergeAgentLoopCoreSystemToolNodeResponse = ({
  nodeResponse,
  callId,
  startTime,
  usages,
  fallback
}: {
  nodeResponse?: AgentLoopCoreSystemToolNodeResponseInput;
  callId: string;
  startTime: number;
  usages?: ChatNodeUsageType[];
  fallback?: Partial<Pick<ChatHistoryItemResType, 'moduleType' | 'moduleName' | 'moduleLogo'>>;
}): ChatHistoryItemResType | undefined => {
  if (!nodeResponse) return undefined;

  return {
    ...nodeResponse,
    moduleType: nodeResponse.moduleType || fallback?.moduleType || FlowNodeTypeEnum.tool,
    moduleName: nodeResponse.moduleName || fallback?.moduleName || '',
    moduleLogo: nodeResponse.moduleLogo || fallback?.moduleLogo,
    id: callId,
    nodeId: callId,
    runningTime: +((Date.now() - startTime) / 1000).toFixed(2),
    totalPoints: sumAgentLoopCoreUsagePoints(usages)
  };
};
