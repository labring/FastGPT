import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import { parseJsonArgs } from '../../../../../utils';
import type { AgentLoopUsage } from '../../usage';

export const DATASET_SEARCH_TOOL_NAME = 'dataset_search';

export type AgentLoopDatasetSearchExecuteParams = {
  call: ChatCompletionMessageToolCall;
  messages: ChatCompletionMessageParam[];
};

export type AgentLoopDatasetSearchExecutionResult = {
  response: string;
  usages: AgentLoopUsage[];
  metadata?: unknown;
  error?: unknown;
};

export type AgentLoopDatasetSearchExecutor = (
  params: AgentLoopDatasetSearchExecuteParams
) => Promise<AgentLoopDatasetSearchExecutionResult>;

const normalizeStringList = (value: unknown): string[] => {
  const values = Array.isArray(value) ? value : value ? [value] : [];

  return values
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

/**
 * 创建知识库搜索 system tool。
 * agent-loop 只暴露通用 query；workflow 节点参数兼容由 workflow adapter 负责。
 */
export const createDatasetSearchTool = (): ChatCompletionTool => ({
  type: 'function',
  function: {
    name: DATASET_SEARCH_TOOL_NAME,
    description:
      '搜索知识库获取相关信息。当需要查询知识库中的专业知识、文档内容或历史记录时使用此工具。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: '要搜索的查询文本数组，描述需要查找的信息'
        }
      },
      required: []
    }
  }
});

/**
 * 在 agent-loop 内统一补全知识库搜索参数。
 * - currentInputFiles 只追加 http(s) URL，交由搜索节点的 normalizeDatasetSearchInput 继续判断是否图片。
 *   相对路径无法作为图片检索输入，不能混进 query 被误当成普通文本。
 */
export const patchDatasetSearchParams = ({
  args,
  currentInputFiles = []
}: {
  args: string;
  currentInputFiles?: string[];
}) => {
  const rawParams = parseJsonArgs(args);
  const params: Record<string, unknown> =
    rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)
      ? (rawParams as Record<string, unknown>)
      : {};

  const queryInput = normalizeStringList((params as { query?: unknown }).query);
  const inputFiles = normalizeStringList(currentInputFiles).filter(isHttpUrl);
  const mergedInput = [...queryInput, ...inputFiles];

  return {
    ...params,
    query: mergedInput
  };
};
