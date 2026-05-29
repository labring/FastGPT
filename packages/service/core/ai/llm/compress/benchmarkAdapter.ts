import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import { compressLargeContent, compressRequestMessages, compressToolResponse } from './index';

export type FastGPTContextCompressionBenchmarkBucket =
  | 'checkpoint_history'
  | 'large_content'
  | 'tool_response';

export type FastGPTContextCompressionBenchmarkInput =
  | {
      kind: 'messages';
      messages: ChatCompletionMessageParam[];
    }
  | {
      kind: 'text';
      text: string;
    };

export type FastGPTContextCompressionBenchmarkResult = {
  compressed: string;
  outputKind: 'checkpoint' | 'text';
  usedLlm: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalPoints?: number;
    requestIds?: string[];
  };
};

/**
 * FastGPT 上下文压缩评测适配器。
 *
 * 这个入口是给外部 benchmark 使用的稳定边界：benchmark 只负责提供标准化 case，
 * 这里负责把 case 分发到 FastGPT 真实生产压缩函数。后续修改底层压缩 prompt、阈值或
 * 算法实现时，benchmark 不需要同步复制逻辑，重跑同一个 adapter 即可得到新分数。
 */
export const runFastGPTContextCompressionForBenchmark = async ({
  input,
  bucket,
  model,
  userKey,
  compressedTokenLimit
}: {
  input: FastGPTContextCompressionBenchmarkInput;
  bucket: FastGPTContextCompressionBenchmarkBucket;
  model: LLMModelItemType;
  userKey?: OpenaiAccountType;
  compressedTokenLimit?: number;
}): Promise<FastGPTContextCompressionBenchmarkResult> => {
  if (bucket === 'checkpoint_history') {
    if (input.kind !== 'messages') {
      throw new Error('Benchmark bucket checkpoint_history requires messages input');
    }

    const result = await compressRequestMessages({
      messages: input.messages,
      model,
      userKey
    });

    return {
      compressed:
        result.contextCheckpoint ??
        input.messages
          .map((message, index) => `#${index + 1} role=${message.role}\n${message.content ?? ''}`)
          .join('\n\n'),
      outputKind: result.contextCheckpoint ? 'checkpoint' : 'text',
      usedLlm: Boolean(result.usage),
      usage: {
        inputTokens: result.usage?.inputTokens,
        outputTokens: result.usage?.outputTokens,
        totalPoints: result.usage?.totalPoints,
        requestIds: result.requestIds
      }
    };
  }

  if (input.kind !== 'text') {
    throw new Error(`Benchmark bucket ${bucket} requires text input`);
  }

  const result =
    bucket === 'tool_response'
      ? await compressToolResponse({
          response: input.text,
          model,
          currentMessagesTokens: 0,
          toolLength: 1,
          userKey
        })
      : await compressLargeContent({
          content: input.text,
          model,
          compressedTokenLimit: compressedTokenLimit ?? Math.floor(model.maxContext * 0.5),
          userKey
        });

  return {
    compressed: result.compressed,
    outputKind: 'text',
    usedLlm: Boolean(result.usage),
    usage: formatUsage({
      usage: result.usage,
      requestIds: result.requestIds
    })
  };
};

const formatUsage = ({
  usage,
  requestIds
}: {
  usage?: ChatNodeUsageType;
  requestIds?: string[];
}) => ({
  inputTokens: usage?.inputTokens,
  outputTokens: usage?.outputTokens,
  totalPoints: usage?.totalPoints,
  requestIds
});
