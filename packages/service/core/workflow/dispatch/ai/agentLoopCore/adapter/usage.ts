import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import {
  normalizeAgentLoopUsages,
  type AgentLoopUsage
} from '../../../../../ai/llm/agentLoop/interface';

/** 将 Agent Loop 的内部 usage 显式转换为 workflow 统一账单结构。 */
export const agentLoopUsagesToChatNodeUsages = (usages?: AgentLoopUsage[]): ChatNodeUsageType[] =>
  normalizeAgentLoopUsages(usages).map(
    ({ moduleName, totalPoints, model, inputTokens, outputTokens }) => ({
      moduleName,
      totalPoints,
      model,
      inputTokens,
      outputTokens
    })
  );
