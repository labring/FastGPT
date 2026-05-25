import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { countGptMessagesTokens, countPromptTokens } from '../../../../common/string/tiktoken';
import { calculateCompressionThresholds } from './constants';
import type { CreateLLMResponseProps } from '../request';
import { createLLMResponse } from '../request';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import {
  getCompressLargeContentPrompt,
  getCompressLargeContentUserPrompt,
  getCompressRequestMessagesPrompt,
  getCompressRequestMessagesUserPrompt
} from './prompt';
import type { ContextCheckpointValueType } from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';

const logger = getLogger(LogCategories.MODULE.AI.LLM_COMPRESS);

// Checkpoint 最终会作为纯字符串写入 chat history；固定标签用于后续 adapter 识别压缩边界。
const CONTEXT_CHECKPOINT_START_TAG = '<context_checkpoint>';
const CONTEXT_CHECKPOINT_END_TAG = '</context_checkpoint>';

const isSystemLikeMessage = (message: ChatCompletionMessageParam) =>
  message.role === ChatCompletionRequestMessageRoleEnum.System ||
  message.role === ChatCompletionRequestMessageRoleEnum.Developer;

// LLM 可能会输出 markdown 代码块，或忘记补外层标签；入库前统一规整为一个可识别的 tagged string。
const normalizeContextCheckpointContent = (content: string) => {
  const trimmed = content.trim();
  if (!trimmed) return;

  const withoutFence = trimmed
    .replace(/^```(?:markdown|md|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const startIndex = withoutFence.indexOf(CONTEXT_CHECKPOINT_START_TAG);
  const endIndex = withoutFence.indexOf(CONTEXT_CHECKPOINT_END_TAG);
  if (startIndex >= 0 && endIndex > startIndex) {
    // 如果模型已经返回标签，只保留第一段完整 checkpoint，避免前后解释文字进入历史。
    return withoutFence.slice(startIndex, endIndex + CONTEXT_CHECKPOINT_END_TAG.length).trim();
  }

  return `${CONTEXT_CHECKPOINT_START_TAG}\n${withoutFence}\n${CONTEXT_CHECKPOINT_END_TAG}`;
};

/**
 * 压缩 对话历史
 * 当 messages 的 token 长度超过阈值时，调用 LLM 进行压缩
 */
export const compressRequestMessages = async ({
  checkIsStopping,
  messages,
  model,
  reasoningEffort,
  userKey
}: {
  checkIsStopping?: CreateLLMResponseProps['isAborted'];
  messages: ChatCompletionMessageParam[];
  model: LLMModelItemType;
  reasoningEffort?: CreateLLMResponseProps['body']['reasoning_effort'];
  userKey?: OpenaiAccountType;
}): Promise<{
  messages: ChatCompletionMessageParam[];
  usage?: ChatNodeUsageType;
  requestIds?: string[];
  contextCheckpoint?: ContextCheckpointValueType;
}> => {
  if (!messages || messages.length === 0) {
    return {
      messages
    };
  }

  // system/developer 是当前请求的稳定指令，不参与 checkpoint 压缩，只在最终 messages 前置保留。
  const [systemMessages, otherMessages]: [
    ChatCompletionMessageParam[],
    ChatCompletionMessageParam[]
  ] = [[], []];
  messages.forEach((message) => {
    if (isSystemLikeMessage(message)) {
      systemMessages.push(message);
    } else {
      otherMessages.push(message);
    }
  });

  if (otherMessages.length === 0) {
    return {
      messages
    };
  }

  // 触发阈值按完整请求上下文判断；压缩内容仍只包含非 system/developer 历史。
  // system/developer 虽然不参与 checkpoint 压缩，但会真实占用模型上下文。
  const messageTokens = await countGptMessagesTokens({
    messages
  });
  const thresholds = calculateCompressionThresholds(model.maxContext).messages;

  if (messageTokens < thresholds.threshold) {
    return {
      messages
    };
  }

  logger.info('Message compression started');

  try {
    // 触发压缩后，全部非 system/developer 历史都写进 checkpoint，避免继续保留大量原始 history。
    const compressPrompt = await getCompressRequestMessagesPrompt();
    const userPrompt = await getCompressRequestMessagesUserPrompt({
      messages: otherMessages
    });
    const { answerText, usage, requestId, finish_reason } = await createLLMResponse({
      throwError: false,
      isAborted: checkIsStopping,
      userKey,
      body: {
        stream: true,
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
        reasoning_effort: reasoningEffort
      }
    });

    // 只有携带有效 key 的外部账号才视为调用方自带渠道，不在 FastGPT 侧重复计费。
    const totalPoints = usage.usedUserOpenAIKey
      ? 0
      : formatModelChars2Points({
          model: model.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens
        }).totalPoints;
    const compressedUsage = {
      moduleName: i18nT('account_usage:compress_llm_messages'),
      model: model.name,
      totalPoints,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    };

    if (!answerText) {
      logger.warn('Message compression failed: empty response');
      return { messages, usage: compressedUsage, requestIds: [requestId] };
    }

    if (finish_reason === 'close') {
      logger.info('Compression messages aborted: return original messages');
      return { messages, usage: compressedUsage, requestIds: [requestId] };
    }

    const checkpointContent = normalizeContextCheckpointContent(answerText);

    if (!checkpointContent) {
      logger.warn('Message compression failed: invalid checkpoint content');
      return { messages, usage: compressedUsage, requestIds: [requestId] };
    }

    const compressedTokens = usage.outputTokens;
    logger.info('Message compression succeeded', {
      originalTokens: messageTokens,
      compressedTokens
    });

    const checkpointMessage: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: checkpointContent,
      // checkpoint 是给下一轮模型看的历史上下文注入，不作为普通消息展示。
      hideInUI: true
    };

    const finalMessages = [...systemMessages, checkpointMessage];

    return {
      messages: finalMessages,
      usage: compressedUsage,
      requestIds: [requestId],
      contextCheckpoint: checkpointContent
    };
  } catch (error) {
    logger.error('Message compression failed', { error });
    return { messages };
  }
};

function splitIntoChunks(content: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  const totalLength = content.length;
  // 这里不追求精确切 token，只需要把超长文本切到单次 LLM 请求可接受的字符规模。
  const chunkCharSize = chunkSize * 3; // 粗略转换：1 token ≈ 3 chars

  for (let i = 0; i < totalLength; i += chunkCharSize) {
    chunks.push(content.substring(i, i + chunkCharSize));
  }

  return chunks;
}

/**
 * 通用的大内容压缩函数
 * 先使用规则清理压缩；如果清理后仍超过 compressedTokenLimit，再进行 LLM 分块压缩。
 * compressedTokenLimit 表示“压缩结果允许占用的 token 上限”，不是 LLM 请求的 max_tokens。
 */
export const compressLargeContent = async ({
  content,
  model,
  compressedTokenLimit,
  moduleName = i18nT('account_usage:llm_compress_text'),
  reasoningEffort,
  userKey
}: {
  content: string;
  model: LLMModelItemType;
  compressedTokenLimit: number;
  moduleName?: string;
  reasoningEffort?: CreateLLMResponseProps['body']['reasoning_effort'];
  userKey?: OpenaiAccountType;
}): Promise<{
  compressed: string;
  usage?: ChatNodeUsageType;
  requestIds?: string[];
}> => {
  type CompressUsageType = {
    inputTokens: number;
    outputTokens: number;
    totalPoints: number;
    requestIds: string[];
  };

  const chunkAndCompress = async (params: {
    content: string;
    compressedTokenLimit: number;
    model: LLMModelItemType;
  }): Promise<{
    compressed: string;
    usage: CompressUsageType;
  }> => {
    async function compressSingleChunk(params: {
      chunk: string;
      model: LLMModelItemType;
      chunkIndex?: number;
    }): Promise<{
      compressed: string;
      usage: CompressUsageType;
    }> {
      const { chunk, model, chunkIndex } = params;

      const compressPrompt = await getCompressLargeContentPrompt();
      const userPrompt = await getCompressLargeContentUserPrompt({
        content: chunk
      });

      logger.debug(
        `[Chunk compression] ${chunkIndex !== undefined ? `Chunk ${chunkIndex + 1}` : 'Single chunk'}`,
        {
          chunkLength: chunk.length
        }
      );

      const { answerText, usage, requestId } = await createLLMResponse({
        throwError: false,
        userKey,
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
          stream: false,
          reasoning_effort: reasoningEffort
        }
      });

      const totalPoints = usage.usedUserOpenAIKey
        ? 0
        : formatModelChars2Points({
            model: model.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens
          }).totalPoints;
      const chunkUsage = {
        ...usage,
        totalPoints,
        requestIds: [requestId]
      };

      if (!answerText) {
        logger.warn('Chunk compression failed: empty response from LLM', {
          chunkIndex
        });
        return {
          compressed: chunk,
          usage: chunkUsage
        };
      }

      return {
        compressed: answerText.trim(),
        usage: chunkUsage
      };
    }

    const { content, compressedTokenLimit, model } = params;

    const thresholds = calculateCompressionThresholds(model.maxContext);
    const chunkPerThresholds = thresholds.chunkSize;

    const chunks = splitIntoChunks(content, chunkPerThresholds);
    const chunkCount = chunks.length;

    logger.debug('LLM chunk compression Starting', {
      chunkCount,
      chunkPerThresholds,
      originTotalLength: content.length
    });

    const usage: CompressUsageType = {
      inputTokens: 0,
      outputTokens: 0,
      totalPoints: 0,
      requestIds: []
    };

    const compressedChunks = await batchRun(chunks, async (chunk, index) => {
      const result = await compressSingleChunk({
        chunk,
        model,
        chunkIndex: index
      });
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      usage.totalPoints += result.usage.totalPoints;
      usage.requestIds.push(...result.usage.requestIds);

      return result.compressed;
    });

    let merged = compressedChunks.join('\n\n');

    // LLM 输出长度不可控，合并后仍需做一次真实 token 校验。
    const finalTokens = await countGptMessagesTokens({
      messages: [{ role: 'user', content: merged }]
    });

    logger.info('LLM chunk compression Completed', {
      originalTokens: await countGptMessagesTokens({
        messages: [{ role: 'user', content: content }]
      }),
      finalTokens,
      compressedTokenLimit,
      success: finalTokens <= compressedTokenLimit
    });

    if (finalTokens > compressedTokenLimit) {
      logger.warn('LLM chunk compression Exceeded limit, truncating to half', {
        finalTokens,
        compressedTokenLimit,
        exceedRatio: (finalTokens / compressedTokenLimit).toFixed(2)
      });

      // 截断为一半
      const halfLength = Math.floor(merged.length / 2);
      merged = merged.substring(0, halfLength) + '\n\n... [content truncated] ...\n\n';
    }

    return {
      compressed: merged,
      usage
    };
  };

  // 使用准确的 token 统计；已在结果预算内时，不需要压缩。
  let currentTokens = await countPromptTokens(content);

  if (currentTokens <= compressedTokenLimit) {
    return {
      compressed: content
    };
  }

  // 先做无损或低损的规则清理，避免为 URL、Base64、长 ID 这类低语义内容消耗 LLM 压缩成本。
  // 1. 移除 HTTP/HTTPS URLs
  content = content.replace(/https?:\/\/[^\s"'(),}\]]+/gi, '');

  // 2. 移除 Base64 编码内容（通常是很长的字母数字字符串）
  content = content.replace(/\b[a-zA-Z0-9+\/]{100,}={0,2}\b/g, '[BASE64_DATA]');

  currentTokens = await countPromptTokens(content);
  if (currentTokens <= compressedTokenLimit) {
    return {
      compressed: content.trim()
    };
  }

  // 3. 移除 Markdown 图片标记
  content = content.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[$1]');

  // 4. 移除文件路径（保留文件名）
  content = content.replace(/[\/\w\-_]+\/[\w\-_]+\.\w+/g, (match) => {
    const parts = match.split('/');
    return parts[parts.length - 1];
  });

  // 5. 移除 UUID 和长 ID
  content = content.replace(/\b[a-f0-9]{32,}\b/gi, '');
  content = content.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    ''
  );

  // 6. 移除时间戳
  content = content.replace(
    /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\b/g,
    ''
  );

  // 7. 压缩空白字符
  content = content.replace(/[ \t]+/g, ' ');
  content = content.replace(/\n{3,}/g, '\n\n');

  currentTokens = await countPromptTokens(content);
  if (currentTokens <= compressedTokenLimit) {
    return {
      compressed: content.trim()
    };
  }

  logger.debug('Compress large content Starting', {
    currentTokens,
    compressedTokenLimit,
    contentLength: content.length
  });

  // 8. 规则清理仍超限时，再进入成本更高的分块 LLM 压缩。
  try {
    const result = await chunkAndCompress({
      content,
      compressedTokenLimit,
      model
    });

    // 格式化为 ChatNodeUsageType
    return {
      compressed: result.compressed.trim(),
      usage: {
        moduleName,
        model: model.name,
        totalPoints: result.usage.totalPoints,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens
      },
      requestIds: result.usage.requestIds
    };
  } catch (error) {
    logger.error('Chunk compression failed, fallback to binary truncate', { error });
    return {
      compressed: content.trim()
    };
  }
};

export const compressToolResponse = async ({
  response,
  model,
  currentMessagesTokens = 0,
  toolLength = 1,
  reasoningEffort,
  userKey
}: {
  response: string;
  model: LLMModelItemType;
  currentMessagesTokens?: number;
  toolLength?: number;
  reasoningEffort?: CreateLLMResponseProps['body']['reasoning_effort'];
  userKey?: OpenaiAccountType;
}): Promise<{
  compressed: string;
  usage?: ChatNodeUsageType;
  requestIds?: string[];
}> => {
  if (!response) {
    return {
      compressed: response
    };
  }

  // 单个 tool response 既受固定结果上限限制，也受当前请求剩余上下文窗口限制。
  const staticCompressedTokenLimit = calculateCompressionThresholds(model.maxContext).singleTool
    .threshold;

  // 计算每个 tool response 的动态结果预算，预防多个 tool 同时返回的数据打爆上下文。
  const availableCompressedTokenLimit = Math.max(
    0,
    Math.floor((model.maxContext - currentMessagesTokens) / toolLength)
  );

  // 取静态结果上限和动态结果预算的较小值。
  const compressedTokenLimit = Math.min(staticCompressedTokenLimit, availableCompressedTokenLimit);

  // 调用通用压缩函数
  return compressLargeContent({
    content: response,
    model,
    compressedTokenLimit,
    moduleName: i18nT('account_usage:tool_response_compress'),
    reasoningEffort,
    userKey
  });
};
