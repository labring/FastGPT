import { UserError } from '@fastgpt/global/common/error/utils';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import {
  getModerationBlockErrorMessage,
  ModerationActionEnum,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import type {
  ModerationRuntimeContext,
  SystemModerationPolicyType
} from '@fastgpt/global/core/plugin/moderation/type';
import { workflowSystemVariables } from '@fastgpt/global/core/workflow/node/constant';
import { checkContentByPolicy, isModerationHookEnabled } from './checker';
import { getModerationPolicy } from './service';

type EntryCheckedRoundState = {
  expiresAt: number;
  variablesChecked: boolean;
};

const SYSTEM_VARIABLE_KEYS = new Set<string>(workflowSystemVariables.map((item) => item.key));
const ENTRY_CHECKED_TTL_MS = 60_000;
const entryCheckedRounds = new Map<string, EntryCheckedRoundState>();

const buildEntryRoundKey = ({
  chatId,
  responseChatItemId
}: {
  chatId?: string;
  responseChatItemId?: string;
}) => (chatId && responseChatItemId ? `${chatId}:${responseChatItemId}` : undefined);

/**
 * 标记当前对话轮次已在 preChatRound 完成入口审核，避免后续紧邻的 dispatchWorkFlow 重复调用插件与落库审计记录。
 */
export const markEntryModerationChecked = (params: {
  chatId?: string;
  responseChatItemId?: string;
  variablesChecked?: boolean;
}) => {
  const key = buildEntryRoundKey(params);
  if (!key) return;
  const now = Date.now();
  if (entryCheckedRounds.size > 500) {
    for (const [k, state] of entryCheckedRounds.entries()) {
      if (state.expiresAt <= now) entryCheckedRounds.delete(k);
    }
  }
  entryCheckedRounds.set(key, {
    expiresAt: now + ENTRY_CHECKED_TTL_MS,
    variablesChecked: Boolean(params.variablesChecked)
  });
};

/**
 * 消费一次性的入口已审标记；若 preChatRound 未传入 variables，允许 dispatchWorkFlow 仅补审 variables。
 */
export const consumeEntryModerationChecked = (params: {
  chatId?: string;
  responseChatItemId?: string;
}): { queryChecked: boolean; variablesChecked: boolean } => {
  const key = buildEntryRoundKey(params);
  if (!key) return { queryChecked: false, variablesChecked: false };
  const state = entryCheckedRounds.get(key);
  if (state === undefined) return { queryChecked: false, variablesChecked: false };
  entryCheckedRounds.delete(key);
  if (state.expiresAt <= Date.now()) {
    return { queryChecked: false, variablesChecked: false };
  }
  return {
    queryChecked: true,
    variablesChecked: state.variablesChecked
  };
};

export type CheckEntryModerationParams = {
  /** 本轮用户问题输入 */
  query?: UserChatItemValueItemType[];
  /** 本次注入的全局变量与表单输入 */
  variables?: Record<string, any>;
  /** 全局审核策略（可选） */
  policy?: SystemModerationPolicyType;
  /** 业务上下文 */
  context?: ModerationRuntimeContext;
};

/**
 * 递归从未知数据结构中提取所有非空字符串列表
 */
export const extractStringsFromUnknown = (val: unknown): string[] => {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(val)) {
    return val.flatMap(extractStringsFromUnknown);
  }
  if (val && typeof val === 'object') {
    return Object.values(val).flatMap(extractStringsFromUnknown);
  }
  return [];
};

/**
 * 锚点 1：信息接入平台（Entry Guard）
 *
 * 审查对象：
 * 1. 本轮用户问题输入（query / userChatInput 中的文本内容）
 * 2. 本次请求注入的全局变量（variables 中的所有字符串值，包括表单输入）
 *
 * 触发效果：
 * - 生效条件：policy.enabled && policy.hooks.userInput
 * - 一旦违规，立即抛出 UserError 阻断，应用完全不开始执行，不消耗 Token，不触发任何工作流节点
 */
export const checkEntryModeration = async ({
  query,
  variables,
  policy: inputPolicy,
  context
}: CheckEntryModerationParams): Promise<void> => {
  const policy = inputPolicy ?? (await getModerationPolicy());

  // 如果总开关未开启或 userInput 环节未勾选，直接放行
  if (!isModerationHookEnabled({ stage: ModerationStageEnum.entry, policy })) {
    return;
  }

  // 1. 审查用户输入 (query)
  if (Array.isArray(query)) {
    for (const item of query) {
      if (item?.text?.content && typeof item.text.content === 'string') {
        const text = item.text.content.trim();
        if (text) {
          const result = await checkContentByPolicy({
            text,
            stage: ModerationStageEnum.entry,
            targetField: 'query',
            policy,
            context
          });

          if (result.action === ModerationActionEnum.block) {
            throw new UserError(getModerationBlockErrorMessage(result.verdict));
          }
        }
      }
    }
  }

  // 2. 审查全局变量与表单输入 (variables，排除运行时系统变量)
  if (variables && typeof variables === 'object') {
    for (const [key, val] of Object.entries(variables)) {
      if (SYSTEM_VARIABLE_KEYS.has(key)) continue;
      const strings = extractStringsFromUnknown(val);
      for (const text of strings) {
        const result = await checkContentByPolicy({
          text,
          stage: ModerationStageEnum.entry,
          targetField: `variable.${key}`,
          policy,
          context
        });

        if (result.action === ModerationActionEnum.block) {
          throw new UserError(getModerationBlockErrorMessage(result.verdict));
        }
      }
    }
  }
};
