import { i18nT } from '@fastgpt/global/common/i18n/utils';

/**
 * Agent Loop 内部统一的用量记录。
 *
 * 这里只描述模型循环产生的计费数据，不依赖 workflow/chat node 的账单类型；
 * 调用方在 adapter 边界将其转换成自身使用的账单结构。
 */
export type AgentLoopUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalPoints: number;
  moduleName: string;
  model?: string;
};

/** 过滤 provider 或工具返回的空 usage，统一 Agent Loop 内部的数组处理。 */
export const normalizeAgentLoopUsages = (usages?: Array<AgentLoopUsage | undefined>) =>
  usages?.filter((usage): usage is AgentLoopUsage => !!usage) ?? [];

/** Agent Loop 内部计费项的稳定展示名称。 */
export const AgentUsageModuleName = {
  agentCall: i18nT('account_usage:agent_call'),
  contextCompress: i18nT('account_usage:compress_llm_messages'),
  toolResponseCompress: i18nT('account_usage:tool_response_compress')
} as const;
