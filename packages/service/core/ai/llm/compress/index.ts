import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { countGptMessagesTokens, countPromptTokens } from '../../../../common/string/tiktoken';
import { addLog } from '../../../../common/system/log';
import { calculateCompressionThresholds } from './constants';
import { createLLMResponse } from '../request';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { getCompressRequestMessagesPrompt } from './prompt';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';

/**
 * Compress a single oversized tool response
 * Integrates character reduction + chunk compression logic
 */
export const compressToolcallResponse = async (
  response: string,
  model: LLMModelItemType,
  toolName: string,
  currentDescription: string,
  maxTargetTokens: number = 4000
): Promise<string> => {
  const originalTokens = await countPromptTokens(response);

  console.log(
    `Start single tool compression ${toolName}: ${originalTokens} tokens → target ${maxTargetTokens} tokens`
  );
  console.log('Response content preview:\n', response.slice(0, 1000));

  // ============ Phase 1: Smart character reduction ============
  let reduced = response;

  // delete URL
  reduced = reduced.replace(/https?:\/\/[^\s]+/g, '');

  // delete base64 code
  reduced = reduced.replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '');
  reduced = reduced.replace(/base64,[A-Za-z0-9+/=]{50,}/g, '');

  // delete HTML/XML tag
  reduced = reduced.replace(/<[^>]+>/g, '');

  // delete Markdown images
  reduced = reduced.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');

  reduced = reduced.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
    ''
  );

  // Compress whitespace
  reduced = reduced.replace(/\n{3,}/g, '\n\n');
  reduced = reduced.replace(/ {2,}/g, ' ');
  reduced = reduced.replace(/\t+/g, ' ');

  // Remove duplicate separators
  reduced = reduced.replace(/[-=_*#]{5,}/g, '---');

  // Deduplicate consecutive identical lines
  const allLines = reduced.split('\n');
  const deduplicatedLines: string[] = [];
  let lastLine = '';
  for (const line of allLines) {
    const trimmed = line.trim();
    if (trimmed !== lastLine || trimmed === '') {
      deduplicatedLines.push(line);
      lastLine = trimmed;
    }
  }
  reduced = deduplicatedLines.join('\n').trim();

  let currentTokens = await countPromptTokens(reduced);
  addLog.info(`After character reduction`, {
    tool: toolName,
    before: originalTokens,
    after: currentTokens,
    saved: originalTokens - currentTokens
  });
  console.log('After character reduction - content preview:\n', reduced.slice(0, 1000));
  // 2. If reduction meets the requirement, return directly
  if (currentTokens <= maxTargetTokens) {
    return reduced;
  }

  // ============ Phase 2: Small chunk compression ============
  const thresholds = calculateCompressionThresholds(model.maxContext);
  const chunkMaxTokens = thresholds.chunkSize;

  if (currentTokens <= chunkMaxTokens) {
    const systemPrompt = `你是内容压缩专家。将以下内容压缩到约 ${maxTargetTokens} tokens。
        任务: ${currentDescription}
        工具: ${toolName}
        要求：
        - 保留关键数据、结论、错误信息
        - 删除冗余描述、重复内容
        - 格式简洁
        直接输出压缩文本。
        ${reduced}`;

    try {
      const { answerText } = await createLLMResponse({
        body: {
          model,
          messages: [
            { role: ChatCompletionRequestMessageRoleEnum.System, content: systemPrompt },
            {
              role: ChatCompletionRequestMessageRoleEnum.User,
              content: '请按照目标的 token 数量进行压缩'
            }
          ],
          temperature: 0.1,
          stream: false
        }
      });

      if (answerText) {
        reduced = answerText;
        currentTokens = await countPromptTokens(reduced);
      }
    } catch (error) {
      addLog.error(`LLM 压缩失败: ${toolName}`, error);
    }

    addLog.info(`压缩完成`, {
      tool: toolName,
      final: currentTokens,
      ratio: `${((currentTokens / originalTokens) * 100).toFixed(1)}%`
    });
    console.log('LLM 压缩后-内容预览:\n', reduced);
    return reduced;
  }

  // ============ Phase 3: Large Chunk compression ============
  const targetChunkCount = Math.ceil(currentTokens / chunkMaxTokens);
  const chunkSize = Math.ceil(reduced.length / targetChunkCount);
  const chunks: string[] = [];

  for (let i = 0; i < targetChunkCount; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, reduced.length);
    chunks.push(reduced.substring(start, end));
  }

  addLog.info(`分块压缩信息：`, {
    currentTokens: currentTokens,
    tool: toolName,
    chunkslength: chunks.length,
    chunks: chunks
  });

  const targetPerChunk = Math.floor(maxTargetTokens / chunks.length);

  const compressedChunks = await Promise.all(
    chunks.map(async (chunk, idx) => {
      const systemPrompt = `你是内容压缩专家。将以下内容压缩到约 ${targetPerChunk} tokens。
  
        任务: ${currentDescription}
        处理: ${toolName}-块${idx + 1}/${chunks.length}
        
        要求：
        - 保留关键数据、结论、错误
        - 删除冗余、重复内容
        - 格式简洁
        
        直接输出压缩文本。
  
        ${chunk}`;

      try {
        const { answerText } = await createLLMResponse({
          body: {
            model,
            messages: [
              { role: ChatCompletionRequestMessageRoleEnum.System, content: systemPrompt },
              {
                role: ChatCompletionRequestMessageRoleEnum.User,
                content: '请按照目标的 token 数量进行压缩'
              }
            ],
            temperature: 0.1,
            stream: false
          }
        });

        return answerText || chunk;
      } catch (error) {
        addLog.error(`块${idx + 1}压缩失败`, error);
        return chunk;
      }
    })
  );

  reduced = compressedChunks.join('\n\n');

  currentTokens = await countPromptTokens(reduced);
  addLog.info(`分块压缩完成`, {
    tool: toolName,
    step1: originalTokens,
    final: currentTokens,
    ratio: `${((currentTokens / originalTokens) * 100).toFixed(1)}%`,
    reduced: reduced
  });

  return reduced;
};

/**
 * 压缩 Agent 对话历史
 * 当 messages 的 token 长度超过阈值时，调用 LLM 进行压缩
 */
export const compressRequestMessages = async (
  messages: ChatCompletionMessageParam[],
  model: LLMModelItemType,
  currentDescription: string
): Promise<{
  messages: ChatCompletionMessageParam[];
  usage?: ChatNodeUsageType;
}> => {
  if (!messages || messages.length === 0)
    return {
      messages
    };

  const tokenCount = await countGptMessagesTokens(messages);
  const thresholds = calculateCompressionThresholds(model.maxContext);
  const maxTokenThreshold = thresholds.agentMessages.threshold;

  addLog.debug('Agent messages token check', {
    tokenCount,
    maxTokenThreshold,
    needCompress: tokenCount > maxTokenThreshold
  });

  if (tokenCount <= maxTokenThreshold) {
    console.log('messages 无需压缩，共', messages.length, '条消息');
    return {
      messages
    };
  }

  addLog.info('Start compressing agent messages', {
    originalTokens: tokenCount,
    compressionRatio: thresholds.agentMessages.targetRatio
  });

  const { prompt: systemPrompt } = await getCompressRequestMessagesPrompt({
    currentDescription,
    messages,
    rawTokens: tokenCount,
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
            content: systemPrompt
          },
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: userPrompt
          }
        ],
        temperature: 0.1,
        stream: false
      }
    });

    if (!answerText) {
      addLog.warn('Compression failed: empty response, return original messages');
      return { messages };
    }

    const { totalPoints, modelName } = formatModelChars2Points({
      model: model.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    });
    const compressedUsage = {
      moduleName: 'Agent 对话历史压缩',
      model: modelName,
      totalPoints,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens
    };

    const jsonMatch =
      answerText.match(/```json\s*([\s\S]*?)\s*```/) || answerText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      addLog.warn('Compression failed: cannot parse JSON, return original messages');
      return { messages, usage: compressedUsage };
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonText) as {
      compressed_messages: ChatCompletionMessageParam[];
      compression_summary: string;
    };

    if (!parsed.compressed_messages || !Array.isArray(parsed.compressed_messages)) {
      addLog.warn('Compression failed: invalid format, return original messages');
      return { messages, usage: compressedUsage };
    }

    const compressedTokens = await countGptMessagesTokens(parsed.compressed_messages);
    addLog.info('Agent messages compressed successfully', {
      originalTokens: tokenCount,
      compressedTokens,
      actualRatio: (compressedTokens / tokenCount).toFixed(2),
      summary: parsed.compression_summary
    });

    return {
      messages: parsed.compressed_messages,
      usage: compressedUsage
    };
  } catch (error) {
    addLog.error('Compression failed', error);
    return { messages };
  }
};
