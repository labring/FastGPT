import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type {
  AgentLoopInput,
  AgentLoopProviderName,
  AgentLoopRuntime
} from '../../../../../ai/llm/agentLoop/interface';
import { runAgentLoop } from '../../../../../ai/llm/agentLoop/interface';
import { createAgentLoopCoreAssistantEventCollector } from '../adapter/assistantResponses';
import { summarizeAgentLoopCoreResult, type AgentLoopCoreOutputSummary } from './output/result';
import type { AgentLoopCoreResult } from '../domain/result';
import type { AgentLoopCoreToolDisplayInfo } from '../domain/toolInfo';

export type RunAgentLoopCoreParams<TChildrenResponse = unknown> = {
  provider?: AgentLoopProviderName;
  input: AgentLoopInput<TChildrenResponse>;
  runtime: AgentLoopRuntime<TChildrenResponse>;
  assistantResponses?: {
    extraResponses?: AIChatItemValueItemType[];
    eventTarget?: AIChatItemValueItemType[];
    showReasoning?: boolean;
    getEventToolInfo?: (name: string) => AgentLoopCoreToolDisplayInfo | undefined;
    metaEventNames?: {
      updatePlanToolName?: string;
      askToolName?: string;
    };
  };
};

/**
 * Workflow dispatch 侧统一运行 agent-loop 的核心入口。
 *
 * 底层 `runAgentLoop` 只负责模型循环语义；core 在这一层统一补齐 workflow/chat
 * 需要的稳定字段，并从标准事件维护可持久化的 assistantResponses。
 * eventTarget 可让调用方复用已有数组；不传时由 core 创建本轮独立容器。
 */
export const runAgentLoopCore = async <TChildrenResponse = unknown>({
  provider,
  input,
  runtime,
  assistantResponses
}: RunAgentLoopCoreParams<TChildrenResponse>): Promise<AgentLoopCoreResult<TChildrenResponse>> => {
  const eventAssistantResponses = assistantResponses?.eventTarget ?? [];
  const assistantEventCollector = createAgentLoopCoreAssistantEventCollector({
    assistantResponses: eventAssistantResponses,
    showReasoning: assistantResponses?.showReasoning,
    getToolInfo: assistantResponses?.getEventToolInfo,
    metaEventNames: assistantResponses?.metaEventNames
  });
  const wrappedRuntime: AgentLoopRuntime<TChildrenResponse> = {
    ...runtime,
    emitEvent: (event) => {
      assistantEventCollector.emitEvent(event);
      runtime.emitEvent?.(event);
    }
  };
  const result = await runAgentLoop<TChildrenResponse>({
    provider,
    input,
    runtime: wrappedRuntime
  });
  const assistantResponseValues = [
    ...(assistantResponses?.extraResponses ?? []),
    ...eventAssistantResponses
  ];

  if (result.status === 'paused') {
    return {
      ...result,
      status: 'interactive',
      assistantResponses: assistantResponseValues
    };
  }

  return {
    ...result,
    assistantResponses: assistantResponseValues
  };
};

export type RunAgentLoopCoreWithSummaryParams<TChildrenResponse = unknown> =
  RunAgentLoopCoreParams<TChildrenResponse>;

export type AgentLoopCoreRunWithSummaryResult<TChildrenResponse = unknown> = {
  result: AgentLoopCoreResult<TChildrenResponse>;
  summary: AgentLoopCoreOutputSummary<TChildrenResponse>;
};

/**
 * 运行 agent-loop core 并返回 workflow 节点常用的输出摘要。
 *
 * Workflow Agent 和 ToolCall 都需要同一组 summary 字段：requestIds、token/points、
 * assistantResponses、interactive、error/finalText 等。统一放在 core 中，避免外层重复
 * 了解 AgentLoopCoreResult 的内部结构。
 */
export const runAgentLoopCoreWithSummary = async <TChildrenResponse = unknown>({
  ...params
}: RunAgentLoopCoreWithSummaryParams<TChildrenResponse>): Promise<
  AgentLoopCoreRunWithSummaryResult<TChildrenResponse>
> => {
  const result = await runAgentLoopCore(params);

  return {
    result,
    summary: summarizeAgentLoopCoreResult(result)
  };
};
