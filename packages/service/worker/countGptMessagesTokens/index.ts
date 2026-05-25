import {
  type ChatCompletionMessageParam,
  type ChatCompletionCreateParams,
  type ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import { parentPort } from 'worker_threads';
import { getLogger, LogCategories } from '../../common/logger';
import { countGptMessagesTokensInWorker, countPromptTokensInWorker } from './count';

const logger = getLogger(LogCategories.INFRA.WORKER);

type CountGptMessagesTokensWorkerPayload = {
  id: string;
  messages?: ChatCompletionMessageParam[];
  messageGroups?: ChatCompletionMessageParam[][];
  prompts?: (string | null | undefined)[];
  tools?: ChatCompletionTool[];
  functionCall?: ChatCompletionCreateParams.Function[];
};

/**
 * Token 计数 worker 入口。
 *
 * 单条 messages、批量 messageGroups、批量 prompts 共用同一个 worker 文件，减少 worker
 * 类型数量和初始化成本。批量请求在 worker 内同步 map，避免主线程为大量短文本反复
 * postMessage，也保证返回顺序和输入顺序一致。
 */
parentPort?.on(
  'message',
  ({
    id,
    messages,
    messageGroups,
    prompts,
    tools,
    functionCall
  }: CountGptMessagesTokensWorkerPayload) => {
    try {
      const data = (() => {
        // 上下文裁剪会频繁计算多组 messages，批量放进一次 worker 消息能降低 IPC 开销。
        if (messageGroups) {
          return messageGroups.map((messages) => countGptMessagesTokensInWorker({ messages }));
        }

        // embedding/rerank 等路径多为纯文本 prompt，走轻量分支可少做 chat message 拼装。
        if (prompts) {
          return prompts.map((prompt) => countPromptTokensInWorker(prompt));
        }

        return countGptMessagesTokensInWorker({
          messages: messages || [],
          tools,
          functionCall
        });
      })();

      parentPort?.postMessage({
        id,
        type: 'success',
        data
      });
    } catch (error) {
      logger.error('Token count worker failed', { error });
      parentPort?.postMessage({
        id,
        type: 'error',
        data: error instanceof Error ? error.message : String(error)
      });
    }
  }
);
