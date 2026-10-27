import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { ChatDispatchProps } from '../../../../../types/runtime';
import { getWorkflowNodeMemoryKey, WorkflowMemoryState } from '../../../../utils/memories';

type RunningAppInfo = Pick<ChatDispatchProps['runningAppInfo'], 'sourceType' | 'sourceId'>;

export type AgentLoopCoreMemoryKeys = {
  memoryKey: string;
};

export type AgentLoopCoreProviderStateMemory = {
  providerState?: unknown;
};

/**
 * 生成当前节点的统一 agent-loop providerState memory key。
 */
export const getAgentLoopCoreMemoryKeys = ({
  memoryState,
  runningAppInfo,
  nodeId
}: {
  memoryState?: WorkflowMemoryState;
  runningAppInfo?: RunningAppInfo;
  nodeId: string;
}): AgentLoopCoreMemoryKeys => ({
  memoryKey: getWorkflowNodeMemoryKey({
    memoryState,
    runningAppInfo,
    nodeId
  })
});

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const readObject = (value: unknown): Record<string, unknown> =>
  isObjectRecord(value) ? value : {};

/**
 * 从当前工作流记忆状态（或上一条 AI history）中恢复 agent-loop providerState。
 * 只恢复 AI 轮次写入的 memories，避免把末尾为用户消息的轮次误当成可继续执行的 loop 状态。
 * 同时通过 WorkflowMemoryState 自动兼容旧版 `agentLoopMemory-${nodeId}` 键格式。
 */
export const readAgentLoopCoreProviderStateMemory = ({
  memoryState,
  history,
  histories,
  runningAppInfo,
  nodeId
}: {
  memoryState?: WorkflowMemoryState;
  history?: ChatItemMiniType[] | number;
  histories: ChatItemMiniType[];
  runningAppInfo?: RunningAppInfo;
  nodeId: string;
}): AgentLoopCoreProviderStateMemory => {
  const lastHistory = histories[histories.length - 1];
  if (histories.length > 0 && lastHistory?.obj !== ChatRoleEnum.AI) {
    return {};
  }
  if (histories.length === 0 && (history === 0 || Array.isArray(history) || !memoryState)) {
    return {};
  }

  const state = (() => {
    if (Array.isArray(history)) {
      return WorkflowMemoryState.fromHistories(histories, memoryState);
    }
    return memoryState ?? WorkflowMemoryState.fromHistories(histories);
  })();
  const storedMemory = state.readNodeMemory({
    runningAppInfo,
    nodeId
  });
  if (!isObjectRecord(storedMemory)) return {};

  return { providerState: storedMemory.providerState };
};

/**
 * 将本轮 providerState 转换为统一格式的 workflow memories。
 * 暂停态写入 providerState；完成态写 undefined，清理未完成状态。
 */
export const buildAgentLoopCoreProviderStateMemories = ({
  memoryState,
  runningAppInfo,
  nodeId,
  memory
}: {
  memoryState?: WorkflowMemoryState;
  runningAppInfo?: RunningAppInfo;
  nodeId: string;
  memory: AgentLoopCoreProviderStateMemory;
}) => {
  const keys = getAgentLoopCoreMemoryKeys({
    memoryState,
    runningAppInfo,
    nodeId
  });
  const hasMemory = memory.providerState !== undefined;

  return {
    [keys.memoryKey]: hasMemory ? memory : undefined
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
  const restoredState = readObject(restoredProviderState);

  return {
    providerState: restoredProviderState,
    isAskResume: hasLastInteractive && isObjectRecord(restoredState.pendingMainContext)
  };
};

/**
 * 暂停态 memory 统一保存完整 providerState。
 */
export const buildAgentLoopCorePausedMemories = ({
  memoryState,
  runningAppInfo,
  nodeId,
  providerState
}: {
  memoryState?: WorkflowMemoryState;
  runningAppInfo?: RunningAppInfo;
  nodeId: string;
  providerState: unknown;
}) =>
  buildAgentLoopCoreProviderStateMemories({
    memoryState,
    runningAppInfo,
    nodeId,
    memory: {
      providerState
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
  runningAppInfo?: RunningAppInfo;
  nodeId: string;
}) =>
  buildAgentLoopCoreProviderStateMemories({
    memoryState,
    runningAppInfo,
    nodeId,
    memory: {}
  });
