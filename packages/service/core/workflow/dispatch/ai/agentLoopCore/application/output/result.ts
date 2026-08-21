import { getErrText } from '@fastgpt/global/common/error/utils';
import type { InteractiveNodeResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { AgentUsageModuleName } from '../../../../../../ai/llm/agentLoop/interface';
import type { AgentLoopCoreResult } from '../../domain/result';
import { createAgentLoopCoreAskInteractive } from '../../adapter/interactive';
import { agentLoopUsagesToChatNodeUsages } from '../../adapter/usage';
import {
  getAgentLoopCoreFinalMessageReasoning,
  getAgentLoopCoreFinalMessageText
} from './messages';

export type AgentLoopCoreOutputSummary<TChildrenResponse = unknown> = {
  status: AgentLoopCoreResult<TChildrenResponse>['status'];
  requestIds: string[];
  completeMessages: AgentLoopCoreResult<TChildrenResponse>['completeMessages'];
  assistantResponses: AgentLoopCoreResult<TChildrenResponse>['assistantResponses'];
  finishReason: AgentLoopCoreResult<TChildrenResponse>['finishReason'];
  usages: ChatNodeUsageType[];
  inputTokens: number;
  outputTokens: number;
  llmTotalPoints: number;
  errorText?: string;
  finalText?: string;
  reasoningText?: string;
  providerState?: AgentLoopCoreResult<TChildrenResponse>['providerState'];
  interactive?: InteractiveNodeResponseType;
};

const summarizeAgentCallUsages = (usages: ChatNodeUsageType[] = []) =>
  usages
    .filter((usage) => usage.moduleName === AgentUsageModuleName.agentCall)
    .reduce(
      (summary, usage) => ({
        inputTokens: summary.inputTokens + (usage.inputTokens || 0),
        outputTokens: summary.outputTokens + (usage.outputTokens || 0),
        llmTotalPoints: summary.llmTotalPoints + (usage.totalPoints || 0)
      }),
      {
        inputTokens: 0,
        outputTokens: 0,
        llmTotalPoints: 0
      }
    );

/**
 * 归一化 agent-loop core result 的通用输出字段。
 *
 * 这里只处理 loop 结果语义：token/积分、finishReason、errorText、finalText、
 * ask 和 tool interactive。具体 workflow 节点要返回哪些 key，仍由节点外壳决定。
 */
export const summarizeAgentLoopCoreResult = <TChildrenResponse = unknown>(
  result: AgentLoopCoreResult<TChildrenResponse>
): AgentLoopCoreOutputSummary<TChildrenResponse> => {
  // result.usages 保留本轮所有实际 push 记录；节点的 LLM 字段只统计父 Agent 模型调用，
  // 工具和压缩积分由各自 nodeResponse/tool detail 汇总，避免 ToolCall 父节点重复计分。
  const usages = agentLoopUsagesToChatNodeUsages(result.usages);
  const usageSummary = summarizeAgentCallUsages(usages);
  const askPause = result.pause?.type === 'ask' ? result.pause : undefined;
  const toolChildPause = result.pause?.type === 'tool_child' ? result.pause : undefined;
  const ask = askPause?.ask;
  const askId = askPause?.askId;
  const toolChildInteractive = toolChildPause
    ? {
        type: 'toolChildrenInteractive' as const,
        params: {
          childrenResponse: toolChildPause.childrenResponse,
          toolParams: {
            toolCallId: toolChildPause.toolCallId
          }
        }
      }
    : undefined;
  // abort 既用于用户主动停止，也可能是 provider 结束暂停轮次的控制信号，不应展示为错误。
  const errorText = result.status === 'error' ? getErrText(result.error) : undefined;

  return {
    status: result.status,
    requestIds: result.requestIds,
    completeMessages: result.completeMessages,
    assistantResponses: result.assistantResponses,
    finishReason: result.finishReason,
    usages,
    inputTokens: usageSummary.inputTokens,
    outputTokens: usageSummary.outputTokens,
    llmTotalPoints: usageSummary.llmTotalPoints,
    errorText,
    finalText: getAgentLoopCoreFinalMessageText(result.assistantMessages) || errorText,
    reasoningText: getAgentLoopCoreFinalMessageReasoning(result.assistantMessages),
    providerState: result.providerState,
    interactive:
      ask && askId
        ? createAgentLoopCoreAskInteractive({
            askId,
            ask
          })
        : toolChildInteractive
  };
};
