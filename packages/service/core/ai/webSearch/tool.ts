import z from 'zod';
import type {
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { AgentLoopCoreToolRunResult } from '../../workflow/dispatch/ai/agentLoopCore/domain/toolProvider';
import { runYuanbaoSearch, YuanbaoSearchQuerySchema } from './yuanbao';

export const YUANBAO_WEB_SEARCH_TOOL_NAME = 'yuanbao_web_search';
export const YUANBAO_WEB_SEARCH_TOOL_LABEL = '元宝联网搜索';

/** 模型按需调用的搜索工具；实际使用来源须以返回的 URL 为准。 */
export const createYuanbaoWebSearchTool = (): ChatCompletionTool => ({
  type: 'function',
  function: {
    name: YUANBAO_WEB_SEARCH_TOOL_NAME,
    description:
      '需要最新或外部信息时搜索网页。只有实际使用搜索结果时，才在最终回答中附上对应的来源 URL。',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '要搜索的具体关键词或问题，最多 500 个字符'
        }
      },
      required: ['query'],
      additionalProperties: false
    }
  }
});

/**
 * 执行一次模型搜索工具调用。参数或供应商失败转成工具结果反馈模型，保留普通对话能力。
 * checkIsStopping 的取消信号由 workflow 回调驱动，同时传给搜索 HTTP 请求。
 */
export const executeYuanbaoWebSearchTool = async <TChildrenResponse = unknown>({
  call,
  checkIsStopping
}: {
  call: ChatCompletionMessageToolCall;
  checkIsStopping?: () => boolean | undefined | null;
}): Promise<AgentLoopCoreToolRunResult<TChildrenResponse>> => {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = checkIsStopping
    ? setInterval(() => {
        if (checkIsStopping()) controller.abort();
      }, 100)
    : undefined;

  let response: string;
  let errorMessage: string | undefined;
  let toolInput: { query: string } | undefined;
  try {
    if (checkIsStopping?.()) controller.abort();
    const rawArgs: unknown = JSON.parse(call.function.arguments || '{}');
    const { query } = YuanbaoSearchQuerySchema.parse(rawArgs);
    toolInput = { query };
    const search = await runYuanbaoSearch({ query, signal: controller.signal });
    response = JSON.stringify(search);
  } catch (error) {
    // 不转发原始上游响应；适配器只抛固定文案或经过白名单过滤的错误码。
    errorMessage =
      error instanceof z.ZodError || error instanceof SyntaxError
        ? 'Yuanbao search arguments are invalid'
        : error instanceof Error &&
            /^Yuanbao search (is not configured|cancelled|timed out|unavailable|HTTP \d{3}|response is invalid|failed: [A-Za-z0-9_-]+)$/.test(
              error.message
            )
          ? error.message
          : 'Yuanbao search unavailable';
    response = `Tool error: ${errorMessage}`;
  } finally {
    if (timer) clearInterval(timer);
  }

  return {
    response,
    assistantMessages: [],
    usages: [],
    ...(errorMessage ? { errorMessage } : {}),
    nodeResponse: {
      id: call.id,
      nodeId: call.id,
      moduleType: FlowNodeTypeEnum.tool,
      moduleName: YUANBAO_WEB_SEARCH_TOOL_LABEL,
      ...(toolInput ? { toolInput } : {}),
      runningTime: +((Date.now() - startedAt) / 1000).toFixed(2),
      toolRes: response,
      ...(errorMessage ? { errorText: errorMessage } : {})
    }
  };
};
