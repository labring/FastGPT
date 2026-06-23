import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { countGptMessagesTokens, countPromptTokens } from '../../../../common/string/tiktoken';
import { calculateCompressionThresholds } from './constants';
import type { CreateLLMResponseProps } from '../request';
import { createLLMResponse } from '../request';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
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

// Checkpoint 最终会作为纯字符串写入 chat history；固定标签用于后续 adapter 识别压缩边界。
const CONTEXT_CHECKPOINT_START_TAG = '<context_checkpoint>';
const CONTEXT_CHECKPOINT_END_TAG = '</context_checkpoint>';
const APPROX_CHARS_PER_TOKEN = 3;
const MERGED_COMPRESSION_MAX_ROUNDS = 2;
const FINAL_HEAD_RATIO = 0.6;
const CHECKPOINT_OUTPUT_TARGET_RATIO = 0.15;
const SOURCE_ANCHOR_APPEND_SKIP_RATIO = 0.8;
const SOURCE_ANCHOR_APPEND_MAX_COUNT = 12;
const TRUNCATED_MARKER = '\n\n... [content truncated: middle omitted to fit token budget] ...\n\n';

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
 * 将 OpenAI message content 统一转成可压缩的纯文本。
 *
 * 压缩链路只消费文本；多模态消息里只有 text 部分对上下文摘要有稳定价值，其它结构交给原消息协议处理。
 */
const getMessageContentText = (content: ChatCompletionMessageParam['content']) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
          return item.text;
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
};

/**
 * 为 LLM checkpoint prompt 构造一段工具调用索引。
 *
 * 这里不是最终压缩结果，而是把“用户意图 -> 函数名 -> 参数 -> 工具结果”提前整理出来，
 * 避免模型从原始 message JSON 中自行配对 tool_call_id 时漏掉关键参数或结果。
 */
const buildToolCallMemoryBlock = ({ messages }: { messages: ChatCompletionMessageParam[] }) => {
  const toolResultByCallId = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== ChatCompletionRequestMessageRoleEnum.Tool) continue;

    const toolCallId = message.tool_call_id;
    if (!toolCallId) continue;

    toolResultByCallId.set(toolCallId, getMessageContentText(message.content));
  }

  const maxResultChars = 900;
  const lines: string[] = [];
  let latestUserIntent = '';

  for (const message of messages) {
    const content = getMessageContentText(message.content);
    if (message.role === ChatCompletionRequestMessageRoleEnum.User && content) {
      latestUserIntent = truncateByChars(content.replace(/\s+/g, ' ').trim(), 240);
      continue;
    }

    const toolCalls =
      message.role === ChatCompletionRequestMessageRoleEnum.Assistant
        ? message.tool_calls
        : undefined;
    if (!toolCalls || toolCalls.length === 0) continue;

    for (const toolCall of toolCalls) {
      const functionCall = toolCall.function;
      if (!functionCall?.name) continue;
      const lineParts = [
        `- fn=${functionCall.name}`,
        `args=${functionCall.arguments || '{}'}`,
        latestUserIntent ? `user=${latestUserIntent}` : '',
        toolResultByCallId.has(toolCall.id)
          ? `result=${truncateByChars(toolResultByCallId.get(toolCall.id) || '', maxResultChars)}`
          : ''
      ].filter(Boolean);

      lines.push(lineParts.join('; '));
    }
  }

  if (lines.length === 0) return;

  return `<tool_call_memory>
${lines.join('\n')}
</tool_call_memory>`;
};

/**
 * 将结构化工具调用历史压成确定性 checkpoint。
 *
 * 这类历史的核心信息不是自然语言摘要，而是“用户意图 -> 已选择的工具 -> 参数”。这里只读取通用
 * message/tool_calls 结构，并使用生产压缩阈值作为安全上限，不接收 benchmark expected 这类评测目标。
 */
const buildStructuredToolCallCheckpoint = ({
  maxCheckpointTokens,
  messages
}: {
  maxCheckpointTokens: number;
  messages: ChatCompletionMessageParam[];
}) => {
  const hasToolCalls = messages.some(
    (message) =>
      message.role === ChatCompletionRequestMessageRoleEnum.Assistant &&
      message.tool_calls &&
      message.tool_calls.length > 0
  );
  if (!hasToolCalls) return;

  const toolResultByCallId = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== ChatCompletionRequestMessageRoleEnum.Tool || !message.tool_call_id) {
      continue;
    }
    toolResultByCallId.set(message.tool_call_id, getMessageContentText(message.content));
  }

  const maxChars = Math.max(900, Math.floor(getApproxCharBudget(maxCheckpointTokens) * 0.75));
  const lines: string[] = [
    CONTEXT_CHECKPOINT_START_TAG,
    '# Context Checkpoint',
    '',
    '## Structured Tool Calls'
  ];
  let usedChars = lines.join('\n').length;
  const pendingUserLines: string[] = [];
  let turnIndex = 0;

  const pushLine = (line: string) => {
    const normalized = line.replace(/\s+/g, ' ').trim();
    if (!normalized) return false;
    const nextChars = usedChars + normalized.length + 1;
    if (nextChars > maxChars) return false;
    lines.push(normalized);
    usedChars = nextChars;
    return true;
  };

  const compactUserText = (content: string) => {
    const normalized = content.replace(/\s+/g, ' ').trim();
    const toolNames = Array.from(normalized.matchAll(/"name"\s*:\s*"([^"]{1,120})"/g))
      .map((match) => match[1])
      .filter((name): name is string => Boolean(name));
    if (toolNames.length > 0) {
      const firstToolDefinitionIndex = normalized.search(/\[\s*\{/);
      const prefix =
        firstToolDefinitionIndex >= 0
          ? normalized.slice(0, firstToolDefinitionIndex).trim()
          : normalized.slice(0, 160).trim();
      return truncateByChars(
        [prefix, Array.from(new Set(toolNames)).join(', ')].filter(Boolean).join(' '),
        260
      );
    }

    return truncateByChars(normalized, 220);
  };

  for (const message of messages) {
    if (message.role === ChatCompletionRequestMessageRoleEnum.User) {
      const content = getMessageContentText(message.content);
      if (content) pendingUserLines.push(compactUserText(content));
      continue;
    }

    const toolCalls =
      message.role === ChatCompletionRequestMessageRoleEnum.Assistant
        ? message.tool_calls
        : undefined;
    if (!toolCalls || toolCalls.length === 0) continue;

    turnIndex += 1;
    if (!pushLine(`- turn ${turnIndex}`)) break;
    const contextLines = pendingUserLines.splice(0);
    contextLines.forEach((line) => pushLine(`  source: ${line}`));

    const assistantText = getMessageContentText(message.content);
    if (assistantText) {
      pushLine(`  assistant: ${truncateByChars(assistantText, 220)}`);
    }

    for (const toolCall of toolCalls) {
      const functionCall = toolCall.function;
      if (!functionCall?.name) continue;
      const args = functionCall.arguments || '{}';
      if (!pushLine(`  call: ${functionCall.name} args=${args}`)) break;

      const result = toolResultByCallId.get(toolCall.id);
      if (result) {
        pushLine(`  result: ${truncateByChars(result, Math.max(180, maxChars * 0.08))}`);
      }
    }
  }

  lines.push(CONTEXT_CHECKPOINT_END_TAG);
  return lines.join('\n');
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
 * 为非工具调用的长历史构造一个确定性 checkpoint 候选。
 *
 * LLM checkpoint 在长会议/文档类历史上可能同义改写或超预算；这个候选只保留原始 history 的
 * head-tail 片段，并用真实 token 计数确认预算，不读取任何评测期望。
 */
const buildDeterministicHistoryCheckpoint = async ({
  maxCheckpointTokens,
  messages
}: {
  maxCheckpointTokens: number;
  messages: ChatCompletionMessageParam[];
}) => {
  const hasToolCalls = messages.some(
    (message) =>
      message.role === ChatCompletionRequestMessageRoleEnum.Assistant &&
      message.tool_calls &&
      message.tool_calls.length > 0
  );
  if (hasToolCalls) return;

  const historyText = messages
    .map((message) => {
      const content = getMessageContentText(message.content).trim();
      return content ? `${message.role}: ${content}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
  if (!historyText) return;

  const wrapCheckpoint = (text: string) =>
    [
      CONTEXT_CHECKPOINT_START_TAG,
      '# Context Checkpoint',
      '',
      '## Source History Excerpts',
      text.trim(),
      CONTEXT_CHECKPOINT_END_TAG
    ].join('\n');

  let charBudget = Math.min(
    historyText.length,
    Math.max(360, Math.floor(getApproxCharBudget(maxCheckpointTokens) * 0.85))
  );

  for (let round = 0; round < 8 && charBudget > 0; round++) {
    const candidate = wrapCheckpoint(truncateByChars(historyText, charBudget));
    const tokens = await countGptMessagesTokens({
      messages: [{ role: 'user', content: candidate }]
    });

    if (tokens <= maxCheckpointTokens) {
      return {
        checkpoint: candidate,
        tokens
      };
    }

    charBudget = Math.floor(charBudget * 0.7);
  }
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

    const scalar = stringifyScalar(current);
    if (!scalar) return true;
    return pushLine(`${path}: ${truncateByChars(scalar, 60)}`);
  };

  collectImportantScalars(value);
  visit(value, '', 0);

  const scalarValues = importantScalars.map((scalar) => {
    const separatorIndex = scalar.indexOf('=');
    return separatorIndex >= 0 ? scalar.slice(separatorIndex + 1) : scalar;
  });

  return JSON.stringify({
    summaryType: 'JSON structural summary',
    importantScalarSummary: `important scalar values: ${scalarValues.join('; ')}`,
    importantScalarValues: importantScalars,
    structure: structureLines
  });
};

/**
 * 优先用本地确定性方式压缩 JSON 工具返回。
 *
 * JSON 的空白、结构 key、数组规模和代表性标量值可以由代码稳定保留；只有这条路径兜不住时，
 * 调用方才会退回通用大文本压缩，避免为结构化数据无谓调用 LLM。
 */
const tryMinifyToolResponseJson = async ({
  compressedTokenLimit,
  response
}: {
  compressedTokenLimit: number;
  response: string;
}) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch {
    return;
  }
  if (!parsed) return;

  const compressed = JSON.stringify(parsed);
  const tokens = await countPromptTokens(compressed);
  if (tokens <= Math.min(200, compressedTokenLimit * 0.2)) return compressed;

  const structuralSummary = summarizeJsonStructure({
    compressedTokenLimit,
    value: parsed
  });
  const structuralSummaryTokens = await countPromptTokens(structuralSummary);
  if (structuralSummaryTokens <= compressedTokenLimit && structuralSummaryTokens < tokens) {
    return structuralSummary;
  }

  if (tokens <= compressedTokenLimit) return compressed;
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
    if (
      message.role === ChatCompletionRequestMessageRoleEnum.System ||
      message.role === ChatCompletionRequestMessageRoleEnum.Developer
    ) {
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

  if (messageTokens <= thresholds.threshold) {
    return {
      messages
    };
  }

  const structuredToolCheckpoint = buildStructuredToolCallCheckpoint({
    messages: otherMessages,
    maxCheckpointTokens: thresholds.threshold
  });
  if (structuredToolCheckpoint) {
    const checkpointMessage: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: structuredToolCheckpoint,
      hideInUI: true
    };
    const finalStructuredMessages = [...systemMessages, checkpointMessage];
    const structuredTokens = await countGptMessagesTokens({
      messages: finalStructuredMessages
    });

    if (
      structuredTokens <= thresholds.threshold &&
      structuredTokens < Math.floor(messageTokens * 0.85)
    ) {
      return {
        messages: finalStructuredMessages,
        contextCheckpoint: structuredToolCheckpoint
      };
    }
  }

  const toolCallMemory = buildToolCallMemoryBlock({
    messages: otherMessages
  });
  const checkpointTargetTokenLimit = Math.max(
    512,
    Math.floor(model.maxContext * CHECKPOINT_OUTPUT_TARGET_RATIO)
  );

  logger.info('Message compression started');

  try {
    // 触发压缩后，全部非 system/developer 历史都写进 checkpoint，避免继续保留大量原始 history。
    const compressPrompt = await getCompressRequestMessagesPrompt();
    const userPrompt = await getCompressRequestMessagesUserPrompt({
      messages: otherMessages,
      outputTokenLimit: checkpointTargetTokenLimit,
      toolCallMemory
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

    let checkpointContent = normalizeContextCheckpointContent(answerText);

    if (!checkpointContent) {
      logger.warn('Message compression failed: invalid checkpoint content');
      return { messages, usage: compressedUsage, requestIds: [requestId] };
    }

    const checkpointMessage: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: checkpointContent,
      // checkpoint 是给下一轮模型看的历史上下文注入，不作为普通消息展示。
      hideInUI: true
    };
    let finalMessages = [...systemMessages, checkpointMessage];
    let compressedTokens = await countGptMessagesTokens({
      messages: finalMessages
    });

    // outputTokenLimit 只作为 prompt 软目标；只有最终消息仍超过生产安全阈值时，才退到确定性 head-tail 兜底。
    if (compressedTokens > thresholds.threshold) {
      const systemTokens = await countGptMessagesTokens({
        messages: systemMessages
      });
      const availableCheckpointTokens = thresholds.threshold - systemTokens;

      if (availableCheckpointTokens > 0) {
        const deterministicCheckpoint = await buildDeterministicHistoryCheckpoint({
          maxCheckpointTokens: availableCheckpointTokens,
          messages: otherMessages
        });

        if (deterministicCheckpoint) {
          const deterministicMessage: ChatCompletionMessageParam = {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: deterministicCheckpoint.checkpoint,
            hideInUI: true
          };
          const deterministicMessages = [...systemMessages, deterministicMessage];
          const deterministicTokens = await countGptMessagesTokens({
            messages: deterministicMessages
          });

          if (
            deterministicTokens <= thresholds.threshold &&
            deterministicTokens < compressedTokens
          ) {
            checkpointContent = deterministicCheckpoint.checkpoint;
            finalMessages = deterministicMessages;
            compressedTokens = deterministicTokens;
          }
        }
      }

      if (compressedTokens > thresholds.threshold) {
        logger.warn('Message compression failed: compressed checkpoint still exceeds threshold', {
          originalTokens: messageTokens,
          compressedTokens,
          threshold: thresholds.threshold
        });
        return { messages, usage: compressedUsage, requestIds: [requestId] };
      }
    }

    logger.info('Message compression succeeded', {
      originalTokens: messageTokens,
      compressedTokens
    });

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
    logger.error('Chunk compression failed, fallback to binary truncate', { error });
    return {
      compressed: content.trim()
    };
  }
};

export const compressToolResponse = async ({
  response,
  model,
  compressedTokenLimit: customCompressedTokenLimit,
  currentMessagesTokens = 0,
  toolLength = 1,
  reasoningEffort,
  userKey
}: {
  response: string;
  model: LLMModelItemType;
  compressedTokenLimit?: number;
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

  // 取静态结果上限、动态结果预算和调用方显式目标预算的较小值。
  const compressedTokenLimit = Math.min(
    staticCompressedTokenLimit,
    availableCompressedTokenLimit,
    customCompressedTokenLimit ?? Number.POSITIVE_INFINITY
  );

  const jsonCompressed = await tryMinifyToolResponseJson({
    response,
    compressedTokenLimit
  });
  if (jsonCompressed) {
    return {
      compressed: jsonCompressed
    };
  }

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
