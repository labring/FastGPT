import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import {
  getModerationBlockErrorMessage,
  MODERATION_BLOCKED_REPLACE_TEXT,
  ModerationActionEnum,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import type { CheckContentByPolicyParams } from '@fastgpt/global/core/plugin/moderation/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { checkContentByPolicy } from './checker';
import { ensureNodeModerationRecord } from './collector';
import { getModerationPolicy } from './service';

export type CheckModelContextModerationParams = {
  /** 组装后的发给模型的消息列表（自动提取 system/developer 消息，及可选的最后一条本轮 user 消息；跳过中间历史消息） */
  messages?: ChatCompletionMessageParam[];
  /** 独立传入的系统提示词（如 Agent 节点独立传入 systemPrompt 的场景） */
  systemPrompt?: string;
  /** 额外传入的本轮用户输入（如 ask_user 恢复时的 userAnswer） */
  extraUserText?: string;
  /** 是否将 messages 的最后一条 user 消息视为本轮新输入纳入审查（默认 true；交互恢复未追加新 user 消息时传 false） */
  includeLastUserMessage?: boolean;
  /** 业务上下文 */
  context?: CheckContentByPolicyParams['context'];
};

export type CheckModelContextModerationResult = {
  isBlocked: boolean;
  blockErrorMessage?: string;
};

/**
 * 锚点 2：对发给 AI 模型的本轮完整上下文执行单次统一审查（Model Input Guard）
 *
 * - 审查范围：系统提示词（system/developer 消息与独立 systemPrompt）+ 本轮新增的用户上下文（包含用户输入、知识库引用、解析合并后的文档内容等）
 * - 免审范围：历史对话消息（histories）及历史轮次文件免审
 * - 触发效果：命中拦截时返回 isBlocked: true，由模型节点直接报错阻断，不发起模型请求、不计费
 */
export const checkModelContextModeration = async ({
  messages = [],
  systemPrompt,
  extraUserText,
  includeLastUserMessage = true,
  context
}: CheckModelContextModerationParams): Promise<CheckModelContextModerationResult> => {
  const extractMessageText = (message?: ChatCompletionMessageParam): string => {
    if (!message) return '';
    if (typeof message.content === 'string') {
      return message.content.trim();
    }
    if (Array.isArray(message.content)) {
      return message.content
        .map((part) =>
          part.type === 'text' && typeof part.text === 'string' ? part.text.trim() : ''
        )
        .filter(Boolean)
        .join('\n');
    }
    return '';
  };

  const systemTexts = [
    systemPrompt?.trim() ?? '',
    ...messages
      .filter(
        (msg) =>
          msg.role === ChatCompletionRequestMessageRoleEnum.System ||
          msg.role === ChatCompletionRequestMessageRoleEnum.Developer
      )
      .map(extractMessageText)
  ].filter(Boolean);

  const lastMessage = includeLastUserMessage ? messages.at(-1) : undefined;
  const lastUserText =
    lastMessage?.role === ChatCompletionRequestMessageRoleEnum.User
      ? extractMessageText(lastMessage)
      : '';
  const userTexts = [lastUserText, extraUserText?.trim() ?? ''].filter(Boolean);

  const contextText = [...systemTexts, ...userTexts].join('\n\n').trim();
  if (!contextText) {
    return { isBlocked: false };
  }

  const res = await checkContentByPolicy({
    text: contextText,
    stage: ModerationStageEnum.modelInput,
    targetField: 'modelContext',
    context
  });

  if (res.action === ModerationActionEnum.block) {
    ensureNodeModerationRecord(res, {
      stage: ModerationStageEnum.modelInput,
      targetField: 'modelContext',
      content: contextText
    });
    return {
      isBlocked: true,
      blockErrorMessage: getModerationBlockErrorMessage(res.verdict)
    };
  }

  return { isBlocked: false };
};

/**
 * Agent Loop 内工具响应结果审查
 *
 * - 审查项：工具执行返回的字符串结果 (toolResponse)
 * - 生效条件：hooks.modelInput（进入模型）或 hooks.finalOutput（工具结果对外响应）任一开启
 * - 违规处理：替换为统一脱敏提示文案，不中断 Agent 运行
 */
export const checkToolResultModeration = async ({
  response,
  context
}: {
  response?: string;
  context?: CheckContentByPolicyParams['context'];
}): Promise<string> => {
  if (!response?.trim()) return response ?? '';

  const policy = await getModerationPolicy();
  const stage =
    policy.enabled && !policy.hooks.modelInput && policy.hooks.finalOutput
      ? ModerationStageEnum.output
      : ModerationStageEnum.modelInput;

  const res = await checkContentByPolicy({
    text: response,
    stage,
    targetField: 'toolResult',
    actionOnBlock: ModerationActionEnum.replace,
    policy,
    context
  });

  if (res.action !== ModerationActionEnum.pass) {
    ensureNodeModerationRecord(res, {
      stage,
      targetField: 'toolResult',
      content: response,
      actionTaken: ModerationActionEnum.replace
    });
    return MODERATION_BLOCKED_REPLACE_TEXT;
  }

  return response;
};

const ModeratedToolResultWeakSet = new WeakSet<object>();

/**
 * 标记工具执行结果对象已完成内容审核检查，避免跨多层运行时包装时重复触发审查插件调用与重复审计记录。
 */
export const markToolResultModerated = <T extends object>(target: T): T => {
  ModeratedToolResultWeakSet.add(target);
  return target;
};

/**
 * 判断工具执行结果对象是否已完成内容审核检查。
 */
export const isToolResultModerated = (target: unknown): boolean => {
  if (!target || typeof target !== 'object') return false;
  return ModeratedToolResultWeakSet.has(target);
};

/**
 * 清洗命中内容审核的工具节点运行详情：隐藏原始敏感输出并移除错误标识，避免向用户展示原始敏感值或错误横幅。
 * 若传入非普通对象（如 undefined），原样返回以便 agentLoop 等上层无需依赖 ChatHistoryItemResType 类型断言。
 */
export function sanitizeModeratedToolNodeResponse(
  nodeResponse: ChatHistoryItemResType
): ChatHistoryItemResType;
export function sanitizeModeratedToolNodeResponse<T>(nodeResponse: T): T;
export function sanitizeModeratedToolNodeResponse(nodeResponse: unknown): unknown {
  if (!nodeResponse || typeof nodeResponse !== 'object' || Array.isArray(nodeResponse)) {
    return nodeResponse;
  }

  const {
    error: _error,
    errorText: _errorText,
    httpResult: _httpResult,
    httpErrorResult: _httpErrorResult,
    pluginOutput: _pluginOutput,
    textOutput: _textOutput,
    reasoningText: _reasoningText,
    historyPreview: _historyPreview,
    customOutputs: _customOutputs,
    codeLog: _codeLog,
    readFilesResult: _readFilesResult,
    quoteList: _quoteList,
    retrievalResults: _retrievalResults,
    extractResult: _extractResult,
    cqResult: _cqResult,
    ...rest
  } = nodeResponse as Record<string, unknown>;

  return {
    ...rest,
    toolRes: MODERATION_BLOCKED_REPLACE_TEXT
  };
}
