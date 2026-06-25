import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { countGptMessagesTokens, countPromptTokens } from '../../../../common/string/tiktoken';
import {
  APPROX_CHARS_PER_TOKEN,
  CHECKPOINT_OUTPUT_TARGET_RATIO,
  CONTEXT_CHECKPOINT_END_TAG,
  CONTEXT_CHECKPOINT_START_TAG,
  FINAL_HEAD_RATIO,
  MERGED_COMPRESSION_MAX_ROUNDS,
  REQUEST_CHECKPOINT_COMPLETION_ACCEPT_CONTEXT_RATIO,
  SOURCE_ANCHOR_APPEND_MAX_COUNT,
  SOURCE_ANCHOR_APPEND_SKIP_RATIO,
  TOOL_RESPONSE_DIRECT_RETURN_CONTEXT_RATIO,
  TOOL_RESPONSE_LIGHT_PROCESS_CONTEXT_RATIO,
  TRUNCATED_MARKER,
  calculateCompressionThresholds,
  getCompressionTokenLimit
} from './constants';
import type { CreateLLMResponseProps } from '../request';
import { createLLMResponse } from '../request';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import {
  extractExactAnchors,
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

// 只用于切分和兜底截断前的粗估；最终是否超限仍以真实 token 统计为准。
const getApproxCharBudget = (tokenLimit: number) =>
  Math.max(0, Math.floor(tokenLimit * APPROX_CHARS_PER_TOKEN));

/**
 * 按字符预算做轻量截断，并保留头尾信息。
 *
 * 许多长文本的开头包含背景/定义，结尾包含结论/错误/结果；只保留头部会系统性丢失后半段事实。
 */
const truncateByChars = (content: string, charBudget: number) => {
  if (content.length <= charBudget) return content;
  if (charBudget <= TRUNCATED_MARKER.length) return content.slice(0, Math.max(0, charBudget));

  const availableCharBudget = charBudget - TRUNCATED_MARKER.length;
  const headLength = Math.floor(availableCharBudget * FINAL_HEAD_RATIO);
  const tailLength = availableCharBudget - headLength;
  return [content.slice(0, headLength).trim(), content.slice(-tailLength).trim()]
    .filter(Boolean)
    .join(TRUNCATED_MARKER);
};

/**
 * 在最终 LLM 输出仍超预算时做结构感知兜底截断。
 *
 * 大内容的关键信息常同时分布在开头的背景/定义和结尾的结论/错误/结果中。这里按段落从 head 与 tail
 * 两侧取内容，并保留明确的省略标记，避免旧逻辑直接字符截半导致后半段事实全部丢失。
 */
const truncateContentByHeadTail = (
  content: string,
  compressedTokenLimit: number,
  currentTokens?: number
) => {
  const tokenRatioCharBudget =
    currentTokens && currentTokens > compressedTokenLimit
      ? Math.floor(content.length * (compressedTokenLimit / currentTokens) * 0.9)
      : Number.POSITIVE_INFINITY;
  const charBudget = Math.min(getApproxCharBudget(compressedTokenLimit), tokenRatioCharBudget);
  if (charBudget <= TRUNCATED_MARKER.length) {
    return content.slice(0, Math.max(0, charBudget)).trim();
  }

  const availableCharBudget = charBudget - TRUNCATED_MARKER.length;
  if (content.length <= availableCharBudget) {
    return content.trim();
  }

  const headBudget = Math.floor(availableCharBudget * FINAL_HEAD_RATIO);
  const tailBudget = availableCharBudget - headBudget;
  const sections = content
    .trim()
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);

  if (sections.length <= 1) {
    return [content.slice(0, headBudget).trim(), content.slice(-tailBudget).trim()]
      .filter(Boolean)
      .join(TRUNCATED_MARKER);
  }

  const headSections: string[] = [];
  let headLength = 0;
  for (const section of sections) {
    const nextLength = headLength + section.length + (headSections.length ? 2 : 0);
    if (nextLength > headBudget) break;
    headSections.push(section);
    headLength = nextLength;
  }

  const tailSections: string[] = [];
  let tailLength = 0;
  for (let i = sections.length - 1; i >= 0; i--) {
    const section = sections[i];
    const nextLength = tailLength + section.length + (tailSections.length ? 2 : 0);
    if (nextLength > tailBudget) break;
    tailSections.unshift(section);
    tailLength = nextLength;
  }

  const head =
    headSections.join('\n\n') || sections[0]?.slice(0, Math.max(0, headBudget)).trim() || '';
  const tail =
    tailSections.join('\n\n') || sections.at(-1)?.slice(-Math.max(0, tailBudget)).trim() || '';

  return [head, tail].filter(Boolean).join(TRUNCATED_MARKER).trim();
};

/**
 * 对最终大内容压缩结果做真实 token 预算收敛。
 *
 * LLM 的 max_tokens 约束不等于最终 message token 数；这里只在结果已经超预算时执行，并用真实
 * tokenizer 逐轮确认，避免“看起来截断了但评测/生产仍超上下文预算”。
 */
const shrinkContentToTokenBudget = async ({
  content,
  tokenLimit
}: {
  content: string;
  tokenLimit: number;
}) => {
  let candidate = content.trim();
  let currentTokens = await countPromptTokens(candidate);
  if (currentTokens <= tokenLimit) return candidate;

  let budget = tokenLimit;
  for (let round = 0; round < 8 && currentTokens > tokenLimit; round++) {
    candidate = truncateContentByHeadTail(candidate, budget, currentTokens);
    currentTokens = await countPromptTokens(candidate);
    budget = Math.max(1, Math.floor(budget * 0.82));
  }

  let charBudget = Math.floor(getApproxCharBudget(tokenLimit) * 0.75);
  while (currentTokens > tokenLimit && charBudget > 0) {
    candidate = truncateByChars(candidate, charBudget).trim();
    currentTokens = await countPromptTokens(candidate);
    charBudget = Math.floor(charBudget * 0.72);
  }

  return candidate;
};

/**
 * LLM 偶尔会把长文本压成过短的泛化摘要，导致原文标签和关键事实丢失。
 *
 * 只有当输出明显低于预算时，才追加一小段原文 head-tail 摘录；这样既不依赖数据集期望，
 * 也能在生产场景里给后续模型保留可定位的原始标签、字段和结论片段。
 */
const appendSourceExcerptForUnderfilledCompression = async ({
  compressed,
  source,
  sourceTokens,
  tokenLimit
}: {
  compressed: string;
  source: string;
  sourceTokens: number;
  tokenLimit: number;
}) => {
  const targetLimit = Math.max(1, Math.floor(tokenLimit * 0.75));
  const compressedTokens = await countPromptTokens(compressed);
  if (compressedTokens >= Math.floor(targetLimit * 0.45)) return compressed;

  const remainingTokens = targetLimit - compressedTokens;
  if (remainingTokens < 120 || sourceTokens <= tokenLimit) return compressed;

  const sourceExcerpt = truncateContentByHeadTail(
    source,
    Math.floor(remainingTokens * 0.85),
    sourceTokens
  );
  const candidate = [
    compressed.trim(),
    'Source excerpts for exact labels and facts:',
    sourceExcerpt
  ]
    .filter(Boolean)
    .join('\n\n');

  return shrinkContentToTokenBudget({
    content: candidate,
    tokenLimit: targetLimit
  });
};

/**
 * 在压缩结果还有预算余量时，确定性追加原文结构标签。
 *
 * LLM 摘要容易保留语义但漏掉标题、字段、编号、路径这类 exact key；这些信息可以用代码从原文里
 * 稳定抽取并追加。这里只在预算明显有余量时追加，避免为了保 key 反向吃掉过多压缩收益。
 */
const appendSourceAnchorsWithinBudget = async ({
  compressed,
  source,
  tokenLimit
}: {
  compressed: string;
  source: string;
  tokenLimit: number;
}) => {
  const targetLimit = Math.max(1, Math.floor(tokenLimit * 0.96));
  const appendStartLimit = Math.max(1, Math.floor(tokenLimit * SOURCE_ANCHOR_APPEND_SKIP_RATIO));
  const current = compressed.trim();
  const currentTokens = await countPromptTokens(current);
  if (currentTokens >= appendStartLimit) return current;

  const anchors = extractExactAnchors(source, SOURCE_ANCHOR_APPEND_MAX_COUNT).filter(
    (anchor) => !current.toLowerCase().includes(anchor.toLowerCase())
  );
  if (anchors.length === 0) return current;

  const selectedAnchors: string[] = [];
  for (const anchor of anchors) {
    const candidateAnchors = [...selectedAnchors, anchor];
    const candidate = [
      current,
      'Source labels / exact anchors:',
      candidateAnchors.map((item) => `- ${item}`).join('\n')
    ].join('\n\n');
    const candidateTokens = await countPromptTokens(candidate);
    if (candidateTokens > targetLimit) break;

    selectedAnchors.push(anchor);
  }

  if (selectedAnchors.length === 0) return current;

  return [
    current,
    'Source labels / exact anchors:',
    selectedAnchors.map((item) => `- ${item}`).join('\n')
  ]
    .join('\n\n')
    .trim();
};

/**
 * 将大型 JSON 工具返回压成通用结构摘要。
 *
 * 压缩上下文里通常不需要完整 JSON 原文，但必须保留 key、路径、数组规模和代表性标量值，后续模型才知道
 * 工具返回了什么结构、哪些字段可用、第一批真实值是什么。这里按 JSON 结构递归采样，不绑定任何业务字段名。
 */
const summarizeJsonStructure = ({
  compressedTokenLimit,
  value
}: {
  compressedTokenLimit: number;
  value: unknown;
}) => {
  const maxChars = Math.max(420, Math.floor(getApproxCharBudget(compressedTokenLimit) * 0.3));
  const structureLines: string[] = [];
  let usedChars = 0;
  const keyPriority = new Map(
    [
      'id',
      'name',
      'type',
      'function',
      'arguments',
      'tool_calls',
      'tools',
      'messages',
      'role',
      'content'
    ].map((key, index) => [key, index])
  );
  const importantScalars: string[] = [];
  const seenImportantScalars = new Set<string>();

  const stringifyScalar = (current: unknown) => {
    if (typeof current === 'string') return current;
    if (typeof current === 'number' || typeof current === 'boolean' || current === null) {
      return String(current);
    }
    return '';
  };

  const pushLine = (line: string) => {
    const normalized = line.replace(/\s+/g, ' ').trim();
    if (!normalized) return false;
    const nextChars = usedChars + normalized.length + 1;
    if (nextChars > maxChars) return false;
    structureLines.push(normalized);
    usedChars = nextChars;
    return true;
  };

  const collectImportantScalars = (current: unknown, key = ''): void => {
    if (importantScalars.length >= 80) return;

    if (Array.isArray(current)) {
      for (const item of current) {
        collectImportantScalars(item);
        if (importantScalars.length >= 80) return;
      }
      return;
    }

    if (current && typeof current === 'object') {
      for (const [childKey, child] of Object.entries(current as Record<string, unknown>)) {
        collectImportantScalars(child, childKey);
        if (importantScalars.length >= 80) return;
      }
      return;
    }

    const scalar = stringifyScalar(current);
    const normalized = scalar.trim();
    if (!normalized || normalized.length > 100) return;

    const scalarWithKey = key ? `${key}=${normalized}` : normalized;
    const dedupeKey = scalarWithKey.toLowerCase();
    if (seenImportantScalars.has(dedupeKey)) return;
    seenImportantScalars.add(dedupeKey);
    importantScalars.push(scalarWithKey);
  };

  const visit = (current: unknown, path: string, depth: number): boolean => {
    if (depth > 6) return true;

    if (Array.isArray(current)) {
      if (!pushLine(`${path}: array(length=${current.length})`)) return false;

      const sampleIndexes = Array.from(new Set([0, current.length - 1])).filter(
        (index) => index >= 0 && index < current.length
      );
      for (const index of sampleIndexes) {
        if (!visit(current[index], `${path}[${index}]`, depth + 1)) return false;
      }
      return true;
    }

    if (current && typeof current === 'object') {
      const entries = Object.entries(current as Record<string, unknown>).sort(
        ([left], [right]) =>
          (keyPriority.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (keyPriority.get(right) ?? Number.MAX_SAFE_INTEGER)
      );
      const keys = entries.map(([key]) => key);
      if (!pushLine(`${path || 'root'} keys: ${keys.join(', ')}`)) return false;

      for (const [key, child] of entries.slice(0, 12)) {
        const nextPath = path ? `${path}.${key}` : key;
        if (!visit(child, nextPath, depth + 1)) return false;
      }
      return true;
    }

    return true;
  };

  collectImportantScalars(value);
  visit(value, '', 0);

  return JSON.stringify({
    summaryType: 'JSON structural summary',
    importantScalarValues: importantScalars,
    structure: structureLines
  });
};

/**
 * 对中等大小工具响应做本地轻量精简。
 *
 * 这个阶段不调用 LLM，只做结构化 JSON 精简和低语义噪声清理；目标是减少上下文占用，同时避免
 * 对 20%~50% context 的工具结果做高成本压缩或过度摘要。
 */
const lightProcessToolResponse = async ({
  response,
  targetTokenLimit
}: {
  response: string;
  targetTokenLimit: number;
}) => {
  try {
    const parsed = JSON.parse(response);
    if (parsed) {
      const compressed = JSON.stringify(parsed);
      const compressedTokens = await countPromptTokens(compressed);
      if (compressedTokens <= targetTokenLimit) return compressed;

      const structuralSummary = summarizeJsonStructure({
        compressedTokenLimit: targetTokenLimit,
        value: parsed
      });
      const structuralSummaryTokens = await countPromptTokens(structuralSummary);
      if (
        structuralSummaryTokens <= targetTokenLimit &&
        structuralSummaryTokens < compressedTokens
      ) {
        return structuralSummary;
      }

      return compressed;
    }
  } catch {
    // Non-JSON tool responses continue through text cleanup.
  }

  return response
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '[$1]')
    .replace(/https?:\/\/[^\s"'(),}\]]+/gi, '')
    .replace(/\b[a-zA-Z0-9+\/]{100,}={0,2}\b/g, '[BASE64_DATA]')
    .replace(/[\/\w\-_]+\/[\w\-_]+\.\w+/g, (match) => {
      const parts = match.split('/');
      return parts[parts.length - 1];
    })
    .replace(/\b[a-f0-9]{32,}\b/gi, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\b/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/**
 * 统计一次真实请求上下文 token。
 *
 * request messages 压缩只会改写 messages，但模型请求仍然会携带 tools schema；因此所有触发判断、
 * 压缩后校验和缓存基线都必须把 tools 一起计入。
 */
const countRequestMessagesTokens = ({
  messages,
  tools
}: {
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
}) =>
  countGptMessagesTokens({
    messages,
    ...(tools?.length ? { tools } : {})
  });

const createContextCheckpointMessage = (
  content: ContextCheckpointValueType
): ChatCompletionMessageParam => ({
  role: ChatCompletionRequestMessageRoleEnum.User,
  content,
  // checkpoint 是给下一轮模型看的历史上下文注入，不作为普通消息展示。
  hideInUI: true
});

const getRequestCheckpointOutputTargetTokens = (maxContext: number) =>
  getCompressionTokenLimit(maxContext, CHECKPOINT_OUTPUT_TARGET_RATIO);

const getToolResponseCompressionLimits = ({ maxContext }: { maxContext: number }) => {
  const directReturnTokenLimit = getCompressionTokenLimit(
    maxContext,
    TOOL_RESPONSE_DIRECT_RETURN_CONTEXT_RATIO
  );

  return {
    // 原始结果不超过 20% context 时不处理；LLM 压缩目标也默认回到这个预算。
    directReturnTokenLimit,
    lightProcessTokenLimit: getCompressionTokenLimit(
      maxContext,
      TOOL_RESPONSE_LIGHT_PROCESS_CONTEXT_RATIO
    ),
    llmCompressedTokenLimit: directReturnTokenLimit
  };
};

/**
 * 压缩对话历史。
 *
 * 触发判断基于完整请求上下文（messages + tools schema）；真正压缩时只折叠非 system/developer
 * 历史，system/developer 原样保留在最终请求前部。
 */
export const compressRequestMessages = async ({
  checkIsStopping,
  messageTokens: cachedMessageTokens,
  messages,
  model,
  reasoningEffort,
  tools,
  userKey,
  teamId
}: {
  checkIsStopping?: CreateLLMResponseProps['isAborted'];
  messageTokens?: number;
  messages: ChatCompletionMessageParam[];
  model: LLMModelItemType;
  reasoningEffort?: CreateLLMResponseProps['body']['reasoning_effort'];
  tools?: ChatCompletionTool[];
  userKey?: OpenaiAccountType;
  teamId: string;
}): Promise<{
  messages: ChatCompletionMessageParam[];
  messageTokens?: number;
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
    if (
      message.role === ChatCompletionRequestMessageRoleEnum.System ||
      message.role === ChatCompletionRequestMessageRoleEnum.Developer
    ) {
      systemMessages.push(message);
    } else {
      otherMessages.push(message);
    }
  });

  // 触发阈值按完整请求上下文判断；压缩内容仍只包含非 system/developer 历史。
  // system/developer 和 tools schema 虽然不参与 checkpoint 压缩，但会真实占用模型上下文。
  const messageTokens =
    cachedMessageTokens ??
    (await countRequestMessagesTokens({
      messages,
      tools
    }));

  if (otherMessages.length === 0) {
    return {
      messages,
      messageTokens
    };
  }

  const thresholds = calculateCompressionThresholds(model.maxContext).messages;

  if (messageTokens <= thresholds.threshold) {
    return {
      messages,
      messageTokens
    };
  }

  const checkpointTargetTokenLimit = getRequestCheckpointOutputTargetTokens(model.maxContext);
  const checkpointCompletionTokenLimit = getCompressionTokenLimit(
    model.maxContext,
    REQUEST_CHECKPOINT_COMPLETION_ACCEPT_CONTEXT_RATIO
  );
  const checkpointWarnTokenLimit = getCompressionTokenLimit(
    model.maxContext,
    CHECKPOINT_OUTPUT_TARGET_RATIO
  );

  logger.info('Message compression started');

  try {
    // 触发压缩后，全部非 system/developer 历史都写进 checkpoint，避免继续保留大量原始 history。
    const compressPrompt = await getCompressRequestMessagesPrompt();
    const userPrompt = await getCompressRequestMessagesUserPrompt({
      messages: otherMessages,
      outputTokenLimit: checkpointTargetTokenLimit
    });
    const { answerText, usage, requestId, finish_reason } = await createLLMResponse({
      throwError: false,
      isAborted: checkIsStopping,
      userKey,
      teamId,
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
      logger.warn('Message compression failed', {
        reason: 'empty_response',
        originalTokens: messageTokens,
        threshold: thresholds.threshold,
        requestId,
        finishReason: finish_reason
      });
      return { messages, messageTokens, usage: compressedUsage, requestIds: [requestId] };
    }

    if (finish_reason === 'close') {
      logger.info('Message compression skipped', {
        reason: 'request_closed',
        originalTokens: messageTokens,
        threshold: thresholds.threshold,
        requestId
      });
      return { messages, messageTokens, usage: compressedUsage, requestIds: [requestId] };
    }

    const checkpointContent = normalizeContextCheckpointContent(answerText);

    if (!checkpointContent) {
      logger.warn('Message compression failed', {
        reason: 'invalid_checkpoint_content',
        originalTokens: messageTokens,
        threshold: thresholds.threshold,
        requestId,
        answerTextLength: answerText.length
      });
      return { messages, messageTokens, usage: compressedUsage, requestIds: [requestId] };
    }

    const checkpointMessage = createContextCheckpointMessage(checkpointContent);
    const finalMessages = [...systemMessages, checkpointMessage];
    const compressedTokens = await countRequestMessagesTokens({
      messages: finalMessages,
      tools
    });

    if (usage.outputTokens >= checkpointCompletionTokenLimit) {
      logger.warn('Message compression completion exceeds soft limit, keeping LLM checkpoint', {
        outputTokens: usage.outputTokens,
        completionTokenLimit: checkpointCompletionTokenLimit,
        originalTokens: messageTokens,
        compressedTokens
      });
    }

    if (compressedTokens > checkpointWarnTokenLimit) {
      logger.warn('Message compression result still exceeds target', {
        reason: 'compressed_messages_over_threshold',
        originalTokens: messageTokens,
        compressedTokens,
        compressedTokenLimit: checkpointWarnTokenLimit,
        maxContext: model.maxContext,
        requestId,
        outputTokens: usage.outputTokens
      });
    }

    logger.info('Message compression succeeded', {
      originalTokens: messageTokens,
      compressedTokens
    });

    return {
      messages: finalMessages,
      messageTokens: compressedTokens,
      usage: compressedUsage,
      requestIds: [requestId],
      contextCheckpoint: checkpointContent
    };
  } catch (error) {
    logger.error('Message compression failed', {
      reason: 'exception',
      originalTokens: messageTokens,
      threshold: thresholds.threshold,
      error
    });
    return { messages, messageTokens };
  }
};

/**
 * 将超长文本切成 LLM 可处理的字符块。
 *
 * 这里不做精确 token 切分，原因是 chunk 只负责控制单次请求规模；合并结果会再次用真实 token 校验。
 */
function splitIntoChunks(content: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  const totalLength = content.length;
  // 这里不追求精确切 token，只需要把超长文本切到单次 LLM 请求可接受的字符规模。
  const chunkCharSize = chunkSize * APPROX_CHARS_PER_TOKEN;

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
  userKey,
  teamId
}: {
  content: string;
  model: LLMModelItemType;
  compressedTokenLimit: number;
  moduleName?: string;
  reasoningEffort?: CreateLLMResponseProps['body']['reasoning_effort'];
  userKey?: OpenaiAccountType;
  teamId: string;
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
  const effectiveCompressedTokenLimit = compressedTokenLimit;

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
      chunkTokenLimit: number;
      chunkIndex?: number;
    }): Promise<{
      compressed: string;
      usage: CompressUsageType;
    }> {
      const { chunk, model, chunkTokenLimit, chunkIndex } = params;

      const compressPrompt = await getCompressLargeContentPrompt();
      const userPrompt = await getCompressLargeContentUserPrompt({
        content: chunk,
        outputTokenLimit: chunkTokenLimit
      });

      logger.debug(
        `[Chunk compression] ${chunkIndex !== undefined ? `Chunk ${chunkIndex + 1}` : 'Single chunk'}`,
        {
          chunkLength: chunk.length,
          chunkTokenLimit
        }
      );

      const { answerText, usage, requestId } = await createLLMResponse({
        throwError: false,
        userKey,
        teamId,
        saveLLMResponseRecord: false,
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
        logger.warn('Chunk compression failed', {
          reason: 'empty_response',
          chunkIndex,
          chunkLength: chunk.length,
          chunkTokenLimit,
          requestId
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
    const chunkPerThresholds = Math.min(
      thresholds.chunkSize,
      Math.max(1, Math.floor((model.maxContext - compressedTokenLimit) / 2))
    );

    const chunks = splitIntoChunks(content, chunkPerThresholds);
    const chunkCount = chunks.length;
    const chunkTokenLimit = Math.max(
      1,
      Math.floor((compressedTokenLimit * 0.65) / Math.max(1, chunkCount))
    );

    logger.debug('LLM chunk compression Starting', {
      chunkCount,
      chunkPerThresholds,
      chunkTokenLimit,
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
        chunkTokenLimit,
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
    let finalTokens = await countPromptTokens(merged);

    const sourceTokens = await countPromptTokens(content);

    logger.info('LLM chunk compression Completed', {
      originalTokens: sourceTokens,
      finalTokens,
      compressedTokenLimit,
      success: finalTokens <= compressedTokenLimit
    });

    if (finalTokens > compressedTokenLimit) {
      logger.warn('LLM chunk compression exceeded limit, running merge compression', {
        reason: 'chunk_merge_over_budget',
        finalTokens,
        compressedTokenLimit,
        exceedRatio: (finalTokens / compressedTokenLimit).toFixed(2)
      });

      let needsDeterministicTruncate = false;
      for (let round = 0; round < MERGED_COMPRESSION_MAX_ROUNDS; round++) {
        const previousMergedLength = merged.length;
        const result = await compressSingleChunk({
          chunk: merged,
          model,
          // 留出少量余量，避免模型输出刚好贴线后被 message 包装 token 挤爆。
          chunkTokenLimit: Math.max(1, Math.floor(compressedTokenLimit * 0.9)),
          chunkIndex: undefined
        });
        usage.inputTokens += result.usage.inputTokens;
        usage.outputTokens += result.usage.outputTokens;
        usage.totalPoints += result.usage.totalPoints;
        usage.requestIds.push(...result.usage.requestIds);

        merged = result.compressed;
        finalTokens = await countPromptTokens(merged);

        if (finalTokens <= compressedTokenLimit) break;

        // 模型如果只是复读或轻微改写，继续二次压缩收益很低，直接走确定性兜底。
        if (merged.length >= previousMergedLength * 0.95) {
          needsDeterministicTruncate = true;
          break;
        }
      }

      if (needsDeterministicTruncate || finalTokens > compressedTokenLimit) {
        logger.warn('LLM merge compression still exceeded limit, applying head-tail truncate', {
          reason: needsDeterministicTruncate
            ? 'merge_compression_low_gain'
            : 'merge_compression_over_budget',
          finalTokens,
          compressedTokenLimit,
          exceedRatio: (finalTokens / compressedTokenLimit).toFixed(2)
        });

        merged = truncateContentByHeadTail(merged, compressedTokenLimit, finalTokens);
        merged = await shrinkContentToTokenBudget({
          content: merged,
          tokenLimit: compressedTokenLimit
        });
      }
    }
    // 如果 LLM 输出明显过短，追加原文 head-tail 摘录，保留关键信息， 防止 LLM 把中文长文压成“泛泛摘要”，导致事实和标签都丢
    merged = await appendSourceExcerptForUnderfilledCompression({
      compressed: merged,
      source: content,
      sourceTokens,
      tokenLimit: compressedTokenLimit
    });
    merged = await appendSourceAnchorsWithinBudget({
      compressed: merged,
      source: content,
      tokenLimit: compressedTokenLimit
    });

    return {
      compressed: merged,
      usage
    };
  };

  // 使用准确的 token 统计；已在结果预算内时，不需要压缩。
  let currentTokens = await countPromptTokens(content);

  if (currentTokens <= effectiveCompressedTokenLimit) {
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
  if (currentTokens <= effectiveCompressedTokenLimit) {
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
  if (currentTokens <= effectiveCompressedTokenLimit) {
    return {
      compressed: content.trim()
    };
  }

  logger.debug('Compress large content Starting', {
    currentTokens,
    compressedTokenLimit: effectiveCompressedTokenLimit,
    contentLength: content.length
  });

  // 8. 规则清理仍超限时，再进入成本更高的分块 LLM 压缩。
  try {
    const result = await chunkAndCompress({
      content,
      compressedTokenLimit: effectiveCompressedTokenLimit,
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
    logger.error('Chunk compression failed, returning cleaned content without LLM compression', {
      reason: 'exception',
      error,
      compressedTokenLimit: effectiveCompressedTokenLimit,
      cleanedContentTokens: currentTokens
    });
    return {
      compressed: content.trim()
    };
  }
};

export const compressToolResponse = async ({
  response,
  model,
  reasoningEffort,
  userKey,
  teamId
}: {
  response: string;
  model: LLMModelItemType;
  reasoningEffort?: CreateLLMResponseProps['body']['reasoning_effort'];
  userKey?: OpenaiAccountType;
  teamId: string;
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

  const responseTokens = await countPromptTokens(response);
  const { directReturnTokenLimit, lightProcessTokenLimit, llmCompressedTokenLimit } =
    getToolResponseCompressionLimits({
      maxContext: model.maxContext
    });

  // 不超过 20% context 的工具结果直接发给模型，保持原始结构和可读性。
  if (responseTokens <= directReturnTokenLimit) {
    return {
      compressed: response
    };
  }

  const lightProcessedResponse = await lightProcessToolResponse({
    response,
    targetTokenLimit: directReturnTokenLimit
  });
  const lightProcessedTokens = await countPromptTokens(lightProcessedResponse);

  // 大于 20% context 的工具结果先做本地精简；精简后不超过 50% context 则不进入 LLM 压缩。
  if (lightProcessedTokens <= lightProcessTokenLimit) {
    return {
      compressed: lightProcessedResponse
    };
  }

  // 调用通用压缩函数
  const result = await compressLargeContent({
    content: lightProcessedResponse,
    model,
    compressedTokenLimit: llmCompressedTokenLimit,
    moduleName: i18nT('account_usage:tool_response_compress'),
    reasoningEffort,
    userKey,
    teamId
  });

  const compressedTokens = await countPromptTokens(result.compressed);
  if (compressedTokens > llmCompressedTokenLimit) {
    logger.warn('Tool response compression result still exceeds target', {
      reason: 'compressed_tool_response_over_target',
      originalTokens: responseTokens,
      lightProcessedTokens,
      compressedTokens,
      compressedTokenLimit: llmCompressedTokenLimit,
      maxContext: model.maxContext,
      requestIds: result.requestIds
    });
  }

  return result;
};
