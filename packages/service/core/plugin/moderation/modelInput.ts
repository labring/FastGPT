import {
  getModerationBlockErrorMessage,
  MODERATION_BLOCKED_REPLACE_TEXT,
  ModerationActionEnum,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import type { CheckContentByPolicyParams } from '@fastgpt/global/core/plugin/moderation/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { checkContentByPolicy, isModerationHookEnabled } from './checker';
import { ensureNodeModerationRecord } from './collector';
import { getModerationPolicy } from './service';

export type CheckModelPromptAndInputParams = {
  userChatInput?: string;
  systemPrompt?: string;
  datasetCitePrompt?: string;
  context?: CheckContentByPolicyParams['context'];
};

export type CheckModelPromptAndInputResult = {
  userChatInput: string;
  systemPrompt: string;
  datasetCitePrompt?: string;
  isUserChatInputBlocked: boolean;
  blockErrorMessage?: string;
};

/**
 * 锚点 2：进入模型前（Pre-loop）审查用户输入、系统提示词与知识库引用
 *
 * - 审查项：用户输入 (userChatInput)、系统提示词 (systemPrompt)、知识库切片引用 (datasetCitePrompt)
 * - 免审项：历史上下文 (Chat Histories) 免审
 * - 违规处理：违规项替换为统一提示文案；用户问题被拦截时标记 isUserChatInputBlocked
 */
export const checkModelPromptAndInput = async ({
  userChatInput = '',
  systemPrompt = '',
  datasetCitePrompt,
  context
}: CheckModelPromptAndInputParams): Promise<CheckModelPromptAndInputResult> => {
  // 审查单个可替换字段：命中违规时记录节点审核记录并替换为脱敏提示文案
  const moderateReplaceField = async <T extends string | undefined>({
    text,
    targetField
  }: {
    text: T;
    targetField: string;
  }): Promise<T> => {
    if (!text?.trim()) return text;

    const res = await checkContentByPolicy({
      text,
      stage: ModerationStageEnum.modelInput,
      targetField,
      actionOnBlock: ModerationActionEnum.replace,
      context
    });

    if (res.action !== ModerationActionEnum.pass) {
      ensureNodeModerationRecord(res, {
        stage: ModerationStageEnum.modelInput,
        targetField,
        content: text,
        actionTaken: ModerationActionEnum.replace
      });
      return MODERATION_BLOCKED_REPLACE_TEXT as T;
    }

    return text;
  };

  // 1. 审查用户问题输入
  const userInputModeration = await (async () => {
    if (!userChatInput?.trim()) {
      return {
        effectiveUserInput: userChatInput,
        isUserChatInputBlocked: false,
        blockErrorMessage: undefined
      };
    }

    const res = await checkContentByPolicy({
      text: userChatInput,
      stage: ModerationStageEnum.modelInput,
      targetField: 'userChatInput',
      context
    });

    if (res.action === ModerationActionEnum.block) {
      ensureNodeModerationRecord(res, {
        stage: ModerationStageEnum.modelInput,
        targetField: 'userChatInput',
        content: userChatInput
      });
      return {
        effectiveUserInput: MODERATION_BLOCKED_REPLACE_TEXT,
        isUserChatInputBlocked: true,
        blockErrorMessage: getModerationBlockErrorMessage(res.verdict)
      };
    }

    return {
      effectiveUserInput: userChatInput,
      isUserChatInputBlocked: false,
      blockErrorMessage: undefined
    };
  })();

  // 2. 审查系统提示词
  const effectiveSystemPrompt = await moderateReplaceField({
    text: systemPrompt,
    targetField: 'systemPrompt'
  });

  // 3. 审查知识库切片引用
  const effectiveDatasetCitePrompt = await moderateReplaceField({
    text: datasetCitePrompt,
    targetField: 'datasetCite'
  });

  return {
    userChatInput: userInputModeration.effectiveUserInput,
    systemPrompt: effectiveSystemPrompt,
    datasetCitePrompt: effectiveDatasetCitePrompt,
    isUserChatInputBlocked: userInputModeration.isUserChatInputBlocked,
    blockErrorMessage: userInputModeration.blockErrorMessage
  };
};

/**
 * 审查知识库检索返回的引用切片列表
 *
 * 违规切片替换为统一脱敏文案，保留其余正常切片继续供后续节点使用。
 */
export const checkDatasetQuotesModeration = async ({
  quotes,
  context
}: {
  quotes: SearchDataResponseItemType[];
  context?: CheckContentByPolicyParams['context'];
}): Promise<SearchDataResponseItemType[]> => {
  if (!Array.isArray(quotes) || quotes.length === 0) return quotes;

  const policy = await getModerationPolicy();
  if (!isModerationHookEnabled({ stage: ModerationStageEnum.modelInput, policy })) {
    return quotes;
  }

  return Promise.all(
    quotes.map(async (item) => {
      const combinedText = [item.q, item.a].filter(Boolean).join('\n').trim();
      if (!combinedText) return item;

      const res = await checkContentByPolicy({
        text: combinedText,
        stage: ModerationStageEnum.modelInput,
        targetField: 'datasetCite',
        actionOnBlock: ModerationActionEnum.replace,
        policy,
        context
      });

      if (res.action !== ModerationActionEnum.pass) {
        ensureNodeModerationRecord(res, {
          stage: ModerationStageEnum.modelInput,
          targetField: 'datasetCite',
          content: combinedText,
          actionTaken: ModerationActionEnum.replace
        });
        return {
          ...item,
          q: MODERATION_BLOCKED_REPLACE_TEXT,
          a: ''
        };
      }

      return item;
    })
  );
};

/**
 * 审查文件提取文本内容
 *
 * 违规时替换为统一提示文案
 */
export const checkFileContentModeration = async ({
  content,
  fileName,
  context
}: {
  content?: string;
  fileName?: string;
  context?: CheckContentByPolicyParams['context'];
}): Promise<string> => {
  if (!content?.trim()) return content ?? '';

  const targetField = fileName ? `file.${fileName}` : 'fileContent';
  const res = await checkContentByPolicy({
    text: content,
    stage: ModerationStageEnum.modelInput,
    targetField,
    actionOnBlock: ModerationActionEnum.replace,
    context
  });

  if (res.action !== ModerationActionEnum.pass) {
    ensureNodeModerationRecord(res, {
      stage: ModerationStageEnum.modelInput,
      targetField,
      content,
      actionTaken: ModerationActionEnum.replace
    });
    return MODERATION_BLOCKED_REPLACE_TEXT;
  }

  return content;
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
 */
export const sanitizeModeratedToolNodeResponse = (
  nodeResponse: ChatHistoryItemResType
): ChatHistoryItemResType => {
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
  } = nodeResponse;

  return {
    ...rest,
    toolRes: MODERATION_BLOCKED_REPLACE_TEXT
  };
};
