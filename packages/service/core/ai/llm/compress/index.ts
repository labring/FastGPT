import type { LLMModelItemType } from '@fastgpt/global/core/ai/model';
import { countGptMessagesTokens } from '../../../../common/string/tiktoken';
import { addLog } from '../../../../common/system/log';
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
  console.log('messageTokens', messageTokens, 'thresholds', thresholds);
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
      isAborted: checkIsStopping,
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

    const compressResult = parseJsonArgs<{
      compressed_messages: ChatCompletionMessageParam[];
      compression_summary: string;
    }>(answerText);

    if (
      !compressResult ||
      !Array.isArray(compressResult.compressed_messages) ||
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

// Tool response compress
export const compressToolResponse = async ({
  response,
  model,
  currentMessagesTokens = 0,
  reservedTokens = 8000
}: {
  response: string;
  model: LLMModelItemType;
  currentMessagesTokens?: number;
  reservedTokens?: number; // 预留给输出的 token 数
}): Promise<string> => {
  if (!response) {
    return response;
  }

  // 动态计算可用的最大 token 数
  const staticMaxTokens = calculateCompressionThresholds(model.maxContext).singleTool.threshold;

  // 计算可用空间 = maxContext - 当前已使用 - 预留
  const availableSpace = Math.max(0, model.maxContext - currentMessagesTokens - reservedTokens);

  // 取静态阈值和动态可用空间的较小值
  const maxTokens = Math.min(staticMaxTokens, availableSpace);

  addLog.info('[Tool Response Compression]', {
    responseTokens: await countGptMessagesTokens([{ role: 'user', content: response }]),
    currentMessagesTokens,
    maxContext: model.maxContext,
    reservedTokens,
    availableSpace,
    staticMaxTokens,
    finalMaxTokens: maxTokens
  });

  // 使用准确的 token 统计
  const currentTokens = await countGptMessagesTokens([{ role: 'user', content: response }]);

  // 如果已经小于限制，直接返回
  if (currentTokens <= maxTokens) {
    return response;
  }
  addLog.debug(
    `[Start compress tool response], current Tool Tokens: ${currentTokens}, maxTokens:${maxTokens}`
  );
  let compressed = response;

  // 1. 移除 HTTP/HTTPS URLs
  compressed = compressed.replace(/https?:\/\/[^\s"'(),}\]]+/gi, '');

  // 2. 移除 Base64 编码内容（通常是很长的字母数字字符串）
  compressed = compressed.replace(/\b[a-zA-Z0-9+\/]{100,}={0,2}\b/g, '[BASE64_DATA]');

  let tokens = await countGptMessagesTokens([{ role: 'user', content: compressed }]);
  if (tokens <= maxTokens) {
    return compressed.trim();
  }

  // 3. 移除 Markdown 图片标记
  compressed = compressed.replace(/!\[([^\]]*)\]\([^)]+\)/g, '[$1]');

  // 4. 移除文件路径（保留文件名）
  compressed = compressed.replace(/[\/\w\-_]+\/[\w\-_]+\.\w+/g, (match) => {
    const parts = match.split('/');
    return parts[parts.length - 1];
  });

  // 5. 移除 UUID 和长 ID
  compressed = compressed.replace(/\b[a-f0-9]{32,}\b/gi, '');
  compressed = compressed.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    ''
  );

  // 6. 移除时间戳
  compressed = compressed.replace(
    /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\b/g,
    ''
  );

  // 7. 压缩空白字符
  compressed = compressed.replace(/[ \t]+/g, ' ');
  compressed = compressed.replace(/\n{3,}/g, '\n\n');

  tokens = await countGptMessagesTokens([{ role: 'user', content: compressed }]);
  if (tokens <= maxTokens) {
    return compressed.trim();
  }

  // 8. 分块 LLM 压缩
  try {
    compressed = await chunkAndCompress({
      content: compressed,
      maxTokens,
      model
    });
  } catch (error) {
    addLog.error('[Chunk compression] failed, fallback to binary truncate', error);
  }
  return compressed.trim();
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

async function compressSingleChunk(params: {
  chunk: string;
  targetTokens: number;
  model: LLMModelItemType;
}): Promise<string> {
  const { chunk, targetTokens, model } = params;

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

  const { answerText } = await createLLMResponse({
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
  return answerText.trim();
}

async function chunkAndCompress(params: {
  content: string;
  maxTokens: number;
  model: LLMModelItemType;
}): Promise<string> {
  const { content, maxTokens, model } = params;

  const thresholds = calculateCompressionThresholds(model.maxContext);
  const chunkSize = thresholds.chunkSize;

  const chunks = splitIntoChunks(content, chunkSize);
  const chunkCount = chunks.length;
  const targetPerChunk = Math.floor(thresholds.singleTool.target / chunkCount);

  addLog.info('[LLM chunk compression] Starting', {
    chunkCount,
    chunkSize,
    targetPerChunk,
    totalLength: content.length
  });

  const compressionPromises = chunks.map((chunk) =>
    compressSingleChunk({
      chunk,
      targetTokens: targetPerChunk,
      model
    })
  );

  const compressedChunks = await Promise.all(compressionPromises);

  let merged = compressedChunks.join('\n\n');

  const finalTokens = await countGptMessagesTokens([{ role: 'user', content: merged }]);

  addLog.info('[LLM chunk compression] Completed', {
    originalTokens: await countGptMessagesTokens([{ role: 'user', content: content }]),
    finalTokens,
    maxTokens,
    success: finalTokens <= maxTokens
  });

  if (finalTokens > maxTokens) {
    addLog.warn('[LLM chunk compression] Exceeded limit, truncating to half', {
      finalTokens,
      maxTokens,
      exceedRatio: (finalTokens / maxTokens).toFixed(2)
    });

    // 截断为一半
    const halfLength = Math.floor(merged.length / 2);
    merged = merged.substring(0, halfLength) + '\n\n... [content truncated] ...\n\n';
  }

  return merged;
}
