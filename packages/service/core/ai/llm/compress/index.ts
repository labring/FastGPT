import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { countGptMessagesTokens, countPromptTokens } from '../../../../common/string/tiktoken';
import { calculateCompressionThresholds } from './constants';
import type { CreateLLMResponseProps } from '../request';
import { createLLMResponse } from '../request';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { getCompressRequestMessagesPrompt } from './prompt';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { i18nT } from '../../../../../web/i18n/utils';
import { parseJsonArgs } from '../../utils';
import { batchRun } from '@fastgpt/global/common/system/utils';
import { getLogger, LogCategories } from '../../../../common/logger';

const logger = getLogger(LogCategories.MODULE.AI);

/**
 * 压缩 对话历史
 * 当 messages 的 token 长度超过阈值时，调用 LLM 进行压缩
 */
export const compressRequestMessages = async ({
  checkIsStopping,
  messages,
  model
}: {
  checkIsStopping?: CreateLLMResponseProps['isAborted'];
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

  logger.info('Message compression started', {
    tokens: messageTokens
  });

  try {
    const compressPrompt = await getCompressRequestMessagesPrompt({
      messages: otherMessages,
      rawTokens: messageTokens,
      model
    });

    const userPrompt = '请执行压缩操作，严格按照JSON格式返回结果。';

    const { answerText, usage, requestId, finish_reason } = await createLLMResponse({
      isAborted: checkIsStopping,
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
        temperature: 0.1
      }
    });

    if (!answerText) {
      logger.warn('Message compression failed: empty response');
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
      outputTokens: usage.outputTokens,
      llmRequestIds: [requestId]
    };

    if (finish_reason === 'close') {
      logger.info('Compression messages aborted: return original messages');
      return { messages, usage: compressedUsage };
    }

    const compressResult = parseJsonArgs<{
      compressed_messages: ChatCompletionMessageParam[];
      compression_summary: string;
    }>(answerText);

    if (
      !compressResult ||
      !Array.isArray(compressResult.compressed_messages) ||
      compressResult.compressed_messages.length === 0
    ) {
      logger.warn('Message compression failed: invalid JSON', {
        messages: compressResult?.compressed_messages
      });
      return { messages, usage: compressedUsage };
    }

    const compressedTokens = usage.outputTokens;
    logger.info('Message compression succeeded', {
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
    logger.error('Message compression failed', { error });
    return { messages };
  }
};

function splitIntoChunks(content: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  const totalLength = content.length;
  const chunkCharSize = chunkSize * 3; // 粗略转换：1 token ≈ 3 chars

  for (let i = 0; i < totalLength; i += chunkCharSize) {
    chunks.push(content.substring(i, i + chunkCharSize));
  }

  return chunks;
}

/**
 * 通用的大内容压缩函数
 * 先使用正则表达式压缩，如果还超过限制则进行 LLM 分块压缩
 *
 * @param content - 要压缩的内容
 * @param model - 模型信息
 * @param maxTokens - 最大 token 数
 * @returns 压缩后的内容和 usages
 */
export const compressLargeContent = async ({
  content,
  model,
  maxTokens
}: {
  content: string;
  model: LLMModelItemType;
  maxTokens: number;
}): Promise<{
  compressed: string;
  usage?: ChatNodeUsageType;
}> => {
  async function chunkAndCompress(params: {
    content: string;
    maxTokens: number;
    model: LLMModelItemType;
  }): Promise<{
    compressed: string;
    usage?: { inputTokens: number; outputTokens: number };
  }> {
    async function compressSingleChunk(params: {
      chunk: string;
      targetTokens: number;
      model: LLMModelItemType;
      chunkIndex?: number;
    }): Promise<{
      compressed: string;
      usage?: { inputTokens: number; outputTokens: number };
    }> {
      const { chunk, targetTokens, model, chunkIndex } = params;

      const compressPrompt = `你是一个文本压缩专家。请将以下文本压缩到约 ${targetTokens} tokens，同时保留关键信息。
            ## 压缩原则
            1. **只能删除信息，不能添加**
            2. **保留关键内容**：数据、数字、名称、日期、核心结论、错误信息
            3. **删除冗余**：重复描述、冗长修饰语、空泛过渡句
            4. **精简表达**：用简练语言、列表、概括替代详细说明
            ## 待压缩文本
            \`\`\`
            ${chunk}
            \`\`\`
            请直接输出压缩后的文本内容，不要包含任何解释或代码块标记。`;

      logger.debug(
        `[Chunk compression] ${chunkIndex !== undefined ? `Chunk ${chunkIndex + 1}` : 'Single chunk'}`,
        {
          chunkLength: chunk.length,
          targetTokens
        }
      );

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
              content: '请执行压缩操作。'
            }
          ],
          temperature: 0.1,
          stream: false
        }
      });

      if (!answerText) {
        throw new Error('Empty response from LLM');
      }
      return {
        compressed: answerText.trim(),
        usage
      };
    }

    const { content, maxTokens, model } = params;

    const thresholds = calculateCompressionThresholds(model.maxContext);
    const chunkPerThresholds = thresholds.chunkSize;

    const chunks = splitIntoChunks(content, chunkPerThresholds);
    const chunkCount = chunks.length;
    const targetPerChunk = Math.floor(maxTokens / chunkCount);

    logger.debug('LLM chunk compression Starting', {
      chunkCount,
      chunkPerThresholds,
      targetPerChunk,
      originTotalLength: content.length
    });

    const usage = {
      inputTokens: 0,
      outputTokens: 0
    };

    const compressedChunks = await batchRun(chunks, async (chunk, index) => {
      const result = await compressSingleChunk({
        chunk,
        targetTokens: targetPerChunk,
        model,
        chunkIndex: index
      });
      usage.inputTokens += result.usage?.inputTokens || 0;
      usage.outputTokens += result.usage?.outputTokens || 0;
      return result.compressed;
    });

    let merged = compressedChunks.join('\n\n');

    const finalTokens = await countGptMessagesTokens([{ role: 'user', content: merged }]);

    logger.info('LLM chunk compression Completed', {
      originalTokens: await countGptMessagesTokens([{ role: 'user', content: content }]),
      finalTokens,
      maxTokens,
      success: finalTokens <= maxTokens
    });

    if (finalTokens > maxTokens) {
      logger.warn('LLM chunk compression Exceeded limit, truncating to half', {
        finalTokens,
        maxTokens,
        exceedRatio: (finalTokens / maxTokens).toFixed(2)
      });

      // 截断为一半
      const halfLength = Math.floor(merged.length / 2);
      merged = merged.substring(0, halfLength) + '\n\n... [content truncated] ...\n\n';
    }

    return {
      compressed: merged,
      usage
    };
  }

  // 使用准确的 token 统计
  let currentTokens = await countPromptTokens(content);

  // 如果已经小于限制，直接返回
  if (currentTokens <= maxTokens) {
    return {
      compressed: content
    };
  }

  // 1. 移除 HTTP/HTTPS URLs
  content = content.replace(/https?:\/\/[^\s"'(),}\]]+/gi, '');

  // 2. 移除 Base64 编码内容（通常是很长的字母数字字符串）
  content = content.replace(/\b[a-zA-Z0-9+\/]{100,}={0,2}\b/g, '[BASE64_DATA]');

  currentTokens = await countPromptTokens(content);
  if (currentTokens <= maxTokens) {
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
  if (currentTokens <= maxTokens) {
    return {
      compressed: content.trim()
    };
  }

  logger.debug('Compress large content Starting', {
    currentTokens,
    maxTokens,
    contentLength: content.length
  });

  // 8. 分块 LLM 压缩
  try {
    const result = await chunkAndCompress({
      content,
      maxTokens,
      model
    });

    const { totalPoints, modelName } = formatModelChars2Points({
      model: model.model,
      inputTokens: result.usage?.inputTokens || 0,
      outputTokens: result.usage?.outputTokens || 0
    });

    // 格式化为 ChatNodeUsageType
    return {
      compressed: result.compressed.trim(),
      usage: {
        moduleName: i18nT('account_usage:llm_compress_text'),
        model: modelName,
        totalPoints,
        inputTokens: result.usage?.inputTokens || 0,
        outputTokens: result.usage?.outputTokens || 0
      }
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
  reservedTokens = 8000
}: {
  response: string;
  model: LLMModelItemType;
  currentMessagesTokens?: number;
  toolLength?: number;
  reservedTokens?: number; // 预留给输出的 token 数
}): Promise<{
  compressed: string;
  usage?: ChatNodeUsageType;
}> => {
  if (!response) {
    return {
      compressed: response
    };
  }

  // 动态计算可用的最大 token 数
  const staticMaxTokens = calculateCompressionThresholds(model.maxContext).singleTool.threshold;

  // 计算可用空间 = (maxContext - 当前已使用 - 预留) / toolLength, 预防多个 tool 同时返回的数据打爆上下文
  const availableSpace = Math.max(
    0,
    Math.floor((model.maxContext - currentMessagesTokens - reservedTokens) / toolLength)
  );

  // 取静态阈值和动态可用空间的较小值
  const maxTokens = Math.min(staticMaxTokens, availableSpace);

  logger.info('Tool Response Compression', {
    responseTokens: await countGptMessagesTokens([{ role: 'user', content: response }]),
    currentMessagesTokens,
    maxContext: model.maxContext,
    reservedTokens,
    availableSpace,
    staticMaxTokens,
    finalMaxTokens: maxTokens
  });

  // 调用通用压缩函数
  return compressLargeContent({
    content: response,
    model,
    maxTokens
  });
};
