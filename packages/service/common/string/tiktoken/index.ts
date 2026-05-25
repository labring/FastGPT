import {
  type ChatCompletionContentPart,
  type ChatCompletionCreateParams,
  type ChatCompletionMessageParam,
  type ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { type ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { WorkerNameEnum, getWorkerController } from '../../../worker/utils';
import { getTokenWorkerCount } from '../../../worker/tokenWorkerConfig';
import type { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.MODULE.AI.LLM);

export type CountGptMessagesTokensParams = {
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  functionCall?: ChatCompletionCreateParams.Function[];
};

type CountGptMessagesTokensWorkerPayload = {
  messages?: ChatCompletionMessageParam[];
  messageGroups?: ChatCompletionMessageParam[][];
  prompts?: (string | null | undefined)[];
  tools?: ChatCompletionTool[];
  functionCall?: ChatCompletionCreateParams.Function[];
};

/**
 * 获取 token 计数 worker 池。
 *
 * 主进程不直接 import tokenizer，避免把 o200k_base 编码表加载到 API 进程常驻内存；
 * worker 数量由 getTokenWorkerCount 统一限制，和启动预热逻辑保持一致。
 */
const getTokenCountWorkerController = <Response = number>() =>
  getWorkerController<CountGptMessagesTokensWorkerPayload, Response>({
    name: WorkerNameEnum.countGptMessagesTokens,
    maxReservedThreads: getTokenWorkerCount()
  });

/**
 * 统一封装 token worker 调用，保留失败日志的模块上下文。
 *
 * 这里不做主线程本地 fallback：fallback 会重新加载 tokenizer 到主进程，抵消 worker
 * 隔离内存的收益；失败时直接抛出，让上层按正常错误链路处理。
 */
const runTokenCountWorker = async <Response>(payload: CountGptMessagesTokensWorkerPayload) => {
  try {
    const workerController = getTokenCountWorkerController<Response>();
    return await workerController.run(payload);
  } catch (error) {
    logger.error('Token count worker failed', { error });
    throw error;
  }
};

/**
 * 统计 Chat messages token 数。
 *
 * 这是业务侧的统一入口，内部固定走 token worker 和 o200k_base 编码；该值用于上下文预算
 * 和供应商未返回 usage 时的兜底统计，不能替代供应商真实 usage。
 */
export const countGptMessagesTokens = async ({
  messages,
  tools,
  functionCall
}: CountGptMessagesTokensParams) => {
  return runTokenCountWorker<number>({ messages, tools, functionCall });
};

/**
 * 批量统计多组 Chat messages token。
 *
 * 用于上下文裁剪等热路径，避免每一轮对话都单独 postMessage 到 worker。
 */
export const countGptMessagesTokensBatch = async (
  messageGroups: ChatCompletionMessageParam[][]
) => {
  const totals = await runTokenCountWorker<number[]>({ messageGroups });
  if (totals.length !== messageGroups.length) {
    throw new Error('Token count worker returned mismatched message group result length');
  }

  return totals;
};

export const countMessagesTokens = (messages: ChatItemMiniType[]) => {
  const adaptMessages = chats2GPTMessages({ messages, reserveId: true });

  return countGptMessagesTokens({ messages: adaptMessages });
};

/**
 * 统计单段普通 prompt token。
 *
 * 历史调用方会传入空 role，把 prompt 包装成最小 chat message；该兼容行为由 worker 内部
 * 处理，避免纯文本 prompt 被额外加上 chat role 固定开销。
 */
export const countPromptTokens = async (
  prompt: string | ChatCompletionContentPart[] | null | undefined = '',
  role: '' | `${ChatCompletionRequestMessageRoleEnum}` = ''
) => {
  const total = await countGptMessagesTokens({
    messages: [
      {
        //@ts-ignore
        role,
        content: prompt
      }
    ]
  });

  return total;
};

/**
 * 批量统计普通 prompt token，主要用于知识库召回和 embedding/rerank 兜底计量。
 */
export const countPromptTokensBatch = async (prompts: (string | null | undefined)[]) => {
  const totals = await runTokenCountWorker<number[]>({ prompts });
  if (totals.length !== prompts.length) {
    throw new Error('Token count worker returned mismatched prompt result length');
  }

  return totals;
};
