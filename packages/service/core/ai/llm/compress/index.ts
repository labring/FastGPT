import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { countGptMessagesTokens } from '../../../../common/string/tiktoken';
import { addLog } from '../../../../common/system/log';
import { calculateCompressionThresholds } from './constants';
import { createLLMResponse } from '../request';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { getCompressRequestMessagesPrompt } from './prompt';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { i18nT } from '../../../../../web/i18n/utils';
import { parseToolArgs } from '../../utils';

/**
 * 压缩 对话历史
 * 当 messages 的 token 长度超过阈值时，调用 LLM 进行压缩
 */
export const compressRequestMessages = async ({
  messages,
  model
}: {
  messages: ChatCompletionMessageParam[];
  model: LLMModelItemType;
}): Promise<{
  messages: ChatCompletionMessageParam[];
  usage?: ChatNodeUsageType;
}> => {
  if (!messages || messages.length === 0) {
    return {
      messages
    };
  }

  // Save the system messages
  const [systemMessages, otherMessages]: [
    ChatCompletionMessageParam[],
    ChatCompletionMessageParam[]
  ] = [[], []];
  messages.forEach((message) => {
    if (message.role === ChatCompletionRequestMessageRoleEnum.System) {
      systemMessages.push(message);
    } else {
      otherMessages.push(message);
    }
  });

  const messageTokens = await countGptMessagesTokens(otherMessages);
  const thresholds = calculateCompressionThresholds(model.maxContext).messages;

  if (messageTokens < thresholds.threshold) {
    return {
      messages
    };
  }

  addLog.info('[Compression messages] Start', {
    tokens: messageTokens
  });

  const compressPrompt = await getCompressRequestMessagesPrompt({
    messages: otherMessages,
    rawTokens: messageTokens,
    model
  });

  const userPrompt = '请执行压缩操作，严格按照JSON格式返回结果。';

  try {
    const { answerText, usage } = await createLLMResponse({
      body: {
        model,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.System,
            content: compressPrompt
          },
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: userPrompt
          }
        ],
        temperature: 0.1,
        stream: true
      }
    });

    if (!answerText) {
      addLog.warn('[Compression messages] failed: empty response, return original messages');
      return { messages };
    }

    const { totalPoints, modelName } = formatModelChars2Points({
      model: model.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    });
    const compressedUsage = {
      moduleName: i18nT('account_usage:compress_llm_messages'),
      model: modelName,
      totalPoints,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    };

    const compressResult = parseToolArgs<{
      compressed_messages: ChatCompletionMessageParam[];
      compression_summary: string;
    }>(answerText);

    if (
      !compressResult ||
      !Array.isArray(compressResult) ||
      compressResult.compressed_messages.length === 0
    ) {
      addLog.warn('[Compression messages] failed: cannot parse JSON, return original messages', {
        messages: compressResult?.compressed_messages
      });
      return { messages, usage: compressedUsage };
    }

    const compressedTokens = usage.outputTokens;
    addLog.info('[Compression messages] successfully', {
      originalTokens: messageTokens,
      compressedTokens,
      actualRatio: (compressedTokens / messageTokens).toFixed(2),
      summary: compressResult.compression_summary
    });

    // 如果之前提取了 system 消息，现在插回去
    const finalMessages = [...systemMessages, ...compressResult.compressed_messages];

    return {
      messages: finalMessages,
      usage: compressedUsage
    };
  } catch (error) {
    addLog.error('[Compression messages] failed', error);
    return { messages };
  }
};
