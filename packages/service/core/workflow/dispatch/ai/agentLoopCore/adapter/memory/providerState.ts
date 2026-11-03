import type { AIChatItemValueItemType, ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import {
  getWorkflowNodeMemoryKey,
  readWorkflowNodeMemory,
  type WorkflowMemoryState
} from '../../../../../memory/state';
import type { WorkflowMemorySource } from '../../../../../memory/utils';

export type AgentLoopCoreProviderStateMemory = {
  providerState?: unknown;
  assistantResponses?: AIChatItemValueItemType[];
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * 从当前工作流记忆状态（或上一条 AI history）中恢复 agent-loop providerState 与暂停前已累积的节点输出。
 * 同时通过 WorkflowMemoryState 自动兼容旧版 `agentLoopMemory-${nodeId}` 键格式。
 */
export const readAgentLoopCoreProviderStateMemory = ({
  memoryState,
  histories,
  runningAppInfo,
  nodeId
}: {
  memoryState?: WorkflowMemoryState;
  histories?: ChatItemMiniType[];
  runningAppInfo?: WorkflowMemorySource;
  nodeId: string;
}): AgentLoopCoreProviderStateMemory => {
  const storedMemory = readWorkflowNodeMemory({
    memoryState,
    histories,
    runningAppInfo,
    nodeId
  });
  if (!isObjectRecord(storedMemory)) return {};

  return {
    providerState: storedMemory.providerState,
    ...(Array.isArray(storedMemory.assistantResponses)
      ? { assistantResponses: storedMemory.assistantResponses as AIChatItemValueItemType[] }
      : {})
  };
};

/**
 * 计算本轮传入 agent-loop 的 providerState。
 */
export const prepareAgentLoopCoreProviderRunState = ({
  restoredProviderState,
  hasLastInteractive
}: {
  restoredProviderState: unknown;
  hasLastInteractive: boolean;
}) => {
  return {
    providerState: restoredProviderState,
    isAskResume:
      hasLastInteractive &&
      isObjectRecord(restoredProviderState) &&
      isObjectRecord(restoredProviderState.pendingMainContext)
  };
};

/**
 * 暂停态 memory 统一保存完整 providerState 及当前节点已累积的 assistantResponses。
 */
export const buildAgentLoopCorePausedMemories = ({
  memoryState,
  runningAppInfo,
  nodeId,
  providerState,
  assistantResponses
}: {
  memoryState?: WorkflowMemoryState;
  runningAppInfo?: WorkflowMemorySource;
  nodeId: string;
  providerState: unknown;
  assistantResponses?: AIChatItemValueItemType[];
}) => ({
  [getWorkflowNodeMemoryKey({ memoryState, runningAppInfo, nodeId })]:
    providerState === undefined
      ? undefined
      : {
          providerState,
          ...(assistantResponses?.length ? { assistantResponses } : {})
        }
});

/**
 * 完成态 memory：统一清理未完成的 providerState。
 * 新一轮的 active plan 从 ChatItem history 恢复，不在 memory 中建立第二份状态。
 */
export const buildAgentLoopCoreDoneMemories = ({
  memoryState,
  runningAppInfo,
  nodeId
}: {
  memoryState?: WorkflowMemoryState;
  runningAppInfo?: WorkflowMemorySource;
  nodeId: string;
}) => ({
  [getWorkflowNodeMemoryKey({ memoryState, runningAppInfo, nodeId })]: undefined
});
