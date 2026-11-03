import {
  getModerationBlockErrorMessage,
  MODERATION_BLOCKED_REPLACE_TEXT,
  ModerationActionEnum,
  ModerationStageEnum,
  type CheckContentByPolicyParams
} from '@fastgpt/global/core/plugin/moderation/type';
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
  let isUserChatInputBlocked = false;
  let blockErrorMessage: string | undefined;
  let effectiveUserInput = userChatInput;
  let effectiveSystemPrompt = systemPrompt;
  let effectiveDatasetCitePrompt = datasetCitePrompt;

  // 1. 审查用户问题输入
  if (userChatInput && userChatInput.trim()) {
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
      isUserChatInputBlocked = true;
      blockErrorMessage = getModerationBlockErrorMessage(res.verdict);
      effectiveUserInput = MODERATION_BLOCKED_REPLACE_TEXT;
    }
  }

  // 2. 审查系统提示词
  if (systemPrompt && systemPrompt.trim()) {
    const res = await checkContentByPolicy({
      text: systemPrompt,
      stage: ModerationStageEnum.modelInput,
      targetField: 'systemPrompt',
      context
    });

    if (res.action === ModerationActionEnum.block) {
      ensureNodeModerationRecord(res, {
        stage: ModerationStageEnum.modelInput,
        targetField: 'systemPrompt',
        content: systemPrompt
      });
      effectiveSystemPrompt = MODERATION_BLOCKED_REPLACE_TEXT;
    }
  }

  // 3. 审查知识库切片引用
  if (datasetCitePrompt && datasetCitePrompt.trim()) {
    const res = await checkContentByPolicy({
      text: datasetCitePrompt,
      stage: ModerationStageEnum.modelInput,
      targetField: 'datasetCite',
      context
    });

    if (res.action === ModerationActionEnum.block) {
      ensureNodeModerationRecord(res, {
        stage: ModerationStageEnum.modelInput,
        targetField: 'datasetCite',
        content: datasetCitePrompt
      });
      effectiveDatasetCitePrompt = MODERATION_BLOCKED_REPLACE_TEXT;
    }
  }

  return {
    userChatInput: effectiveUserInput,
    systemPrompt: effectiveSystemPrompt,
    datasetCitePrompt: effectiveDatasetCitePrompt,
    isUserChatInputBlocked,
    blockErrorMessage
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
        policy,
        context
      });

      if (res.action === ModerationActionEnum.block) {
        ensureNodeModerationRecord(res, {
          stage: ModerationStageEnum.modelInput,
          targetField: 'datasetCite',
          content: combinedText
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
  if (!content || !content.trim()) return content || '';

  const targetField = fileName ? `file.${fileName}` : 'fileContent';
  const res = await checkContentByPolicy({
    text: content,
    stage: ModerationStageEnum.modelInput,
    targetField,
    context
  });

  if (res.action === ModerationActionEnum.block) {
    ensureNodeModerationRecord(res, {
      stage: ModerationStageEnum.modelInput,
      targetField,
      content
    });
    return MODERATION_BLOCKED_REPLACE_TEXT;
  }

  return content;
};

/**
 * Agent Loop 内工具响应结果审查
 *
 * - 审查项：工具执行返回的字符串结果 (toolResponse)
 * - 违规处理：替换为统一脱敏提示文案，不中断 Agent 运行
 */
export const checkToolResultModeration = async ({
  response,
  context
}: {
  response?: string;
  context?: CheckContentByPolicyParams['context'];
}): Promise<string> => {
  if (!response || !response.trim()) return response || '';

  const res = await checkContentByPolicy({
    text: response,
    stage: ModerationStageEnum.modelInput,
    targetField: 'toolResult',
    context
  });

  if (res.action === ModerationActionEnum.block) {
    ensureNodeModerationRecord(res, {
      stage: ModerationStageEnum.modelInput,
      targetField: 'toolResult',
      content: response
    });
    return MODERATION_BLOCKED_REPLACE_TEXT;
  }

  return response;
};
